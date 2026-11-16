// @vitest-environment node
/**
 * Unit tests for the extraction service (type detection, limits, options).
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  extractLinks,
  detectDocumentType,
  ExtractionError,
  MAX_FILE_BYTES,
} from '@/lib/extractors';

const fixture = async (name: string) =>
  new Uint8Array(await readFile(join(__dirname, '../fixtures', name)));
const text = (s: string) => new TextEncoder().encode(s);
const expectError = async (promise: Promise<unknown>, code: string, status: number) => {
  const error = (await promise.catch((e: unknown) => e)) as ExtractionError;
  expect(error).toBeInstanceOf(ExtractionError);
  expect(error.code).toBe(code);
  expect(error.status).toBe(status);
  expect(error.message).toBeTruthy();
};

describe('detectDocumentType', () => {
  const empty = new Uint8Array();

  test.each([
    ['paper.pdf', 'pdf'],
    ['README.md', 'markdown'],
    ['notes.MARKDOWN', 'markdown'],
    ['page.html', 'html'],
    ['page.HTM', 'html'],
  ])('detects %s by extension → %s', (filename, expected) => {
    expect(detectDocumentType({ data: empty, filename })).toBe(expected);
  });

  test('explicit type wins over the extension', () => {
    expect(detectDocumentType({ data: empty, filename: 'x.html', type: 'markdown' })).toBe(
      'markdown'
    );
  });

  test('falls back to MIME type, ignoring parameters', () => {
    expect(
      detectDocumentType({ data: empty, filename: 'upload', mimeType: 'text/html; charset=utf-8' })
    ).toBe('html');
  });

  test('falls back to PDF magic bytes', async () => {
    expect(detectDocumentType({ data: await fixture('sample.pdf'), filename: 'blob' })).toBe('pdf');
  });

  test('rejects unknown types with UNSUPPORTED_FORMAT', () => {
    expect(() => detectDocumentType({ data: text('hello'), filename: 'photo.png' })).toThrow(
      ExtractionError
    );
  });
});

describe('extractLinks', () => {
  test('extracts from Markdown and builds the response shape', async () => {
    const result = await extractLinks({
      data: await fixture('sample.md'),
      filename: 'sample.md',
    });

    expect(result.documentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toMatchObject({ filename: 'sample.md', type: 'markdown' });
    expect(result.links.length).toBe(result.stats.total);
    expect(result.stats.unique).toBeLessThanOrEqual(result.stats.total);
    expect(result.stats.withDates).toBeGreaterThan(0);
  });

  test('extracts from HTML, resolving relative links against baseUrl', async () => {
    const result = await extractLinks({
      data: text('<a href="/about">About</a>'),
      filename: 'page.html',
      baseUrl: 'https://site.example.com/blog/',
    });
    expect(result.links[0]?.url).toBe('https://site.example.com/about');
  });

  test('extracts from PDF with page numbers', async () => {
    const result = await extractLinks({ data: await fixture('sample.pdf'), filename: 'sample.pdf' });
    expect(result.type).toBe('pdf');
    expect(result.links.every((l) => typeof l.position.page === 'number')).toBe(true);
  });

  test('deduplicateUrls keeps the first occurrence; stats still count all', async () => {
    const data = text('[a](https://dup.example.com) [b](https://dup.example.com) [c](https://one.example.com)');
    const all = await extractLinks({ data, filename: 'x.md' });
    const deduped = await extractLinks({ data, filename: 'x.md' }, { deduplicateUrls: true });

    expect(all.links).toHaveLength(3);
    expect(deduped.links.map((l) => l.text)).toEqual(['a', 'c']);
    expect(deduped.stats).toEqual({ total: 3, unique: 2, withDates: 0 });
  });

  test('extractDates: false removes citation dates', async () => {
    const data = text('[paper](https://p.example.com) Retrieved 2023-06-15.');
    const withDates = await extractLinks({ data, filename: 'x.md' });
    const without = await extractLinks({ data, filename: 'x.md' }, { extractDates: false });

    expect(withDates.links[0]?.citationDate).toBeInstanceOf(Date);
    expect(without.links[0]).not.toHaveProperty('citationDate');
    expect(without.stats.withDates).toBe(0);
  });

  test('strips a UTF-8 byte order mark', async () => {
    const data = text('﻿[a](https://bom.example.com)');
    const result = await extractLinks({ data, filename: 'x.md' });
    expect(result.links[0]?.url).toBe('https://bom.example.com/');
  });

  describe('errors', () => {
    test('FILE_TOO_LARGE (413) above 10 MB', async () => {
      const big = new Uint8Array(MAX_FILE_BYTES + 1);
      await expectError(extractLinks({ data: big, filename: 'big.md' }), 'FILE_TOO_LARGE', 413);
    });

    test('INVALID_REQUEST (400) for an empty file', async () => {
      await expectError(
        extractLinks({ data: new Uint8Array(), filename: 'x.md' }),
        'INVALID_REQUEST',
        400
      );
    });

    test('UNSUPPORTED_FORMAT (415) for unknown types', async () => {
      await expectError(
        extractLinks({ data: text('hi'), filename: 'x.docx' }),
        'UNSUPPORTED_FORMAT',
        415
      );
    });

    test('ENCRYPTED_PDF (422) for password-protected PDFs', async () => {
      await expectError(
        extractLinks({ data: await fixture('encrypted.pdf'), filename: 'e.pdf' }),
        'ENCRYPTED_PDF',
        422
      );
    });

    test('PARSE_ERROR (422) for corrupt PDFs', async () => {
      await expectError(
        extractLinks({ data: await fixture('corrupt.pdf'), filename: 'c.pdf' }),
        'PARSE_ERROR',
        422
      );
    });

    test('PARSE_ERROR (422) for binary data posing as Markdown', async () => {
      const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x81]);
      await expectError(extractLinks({ data: binary, filename: 'x.md' }), 'PARSE_ERROR', 422);
    });

    test('NO_LINKS_FOUND (422) when the document has no links', async () => {
      await expectError(
        extractLinks({ data: text('# Just a heading'), filename: 'x.md' }),
        'NO_LINKS_FOUND',
        422
      );
    });
  });
});
