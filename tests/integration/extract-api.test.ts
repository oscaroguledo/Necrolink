// @vitest-environment node
/**
 * Integration tests for POST /api/extract, calling the route handler with
 * real multipart requests.
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { POST } from '@/app/api/extract/route';

const URL_ = 'http://localhost/api/extract';

async function fixtureFile(name: string, filename = name, type = '') {
  const bytes = await readFile(join(__dirname, '../fixtures', name));
  return new File([bytes], filename, { type });
}

async function upload(fields: Record<string, string | File>, headers?: HeadersInit) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const response = await POST(new Request(URL_, { method: 'POST', body: form, headers }));
  return { status: response.status, body: await response.json() };
}

describe('POST /api/extract', () => {
  describe('success', () => {
    test('PDF upload returns links with pages and ISO citation dates', async () => {
      const { status, body } = await upload({ file: await fixtureFile('sample.pdf') });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ filename: 'sample.pdf', type: 'pdf' });
      expect(body.data.stats.total).toBe(7);

      const citation = body.data.links.find(
        (l: { url: string }) => l.url === 'https://journal.example.org/articles/link-rot'
      );
      expect(citation.position.page).toBe(2);
      expect(citation.citationDate).toBe('2023-06-15T00:00:00.000Z');
    });

    test('Markdown upload with deduplicateUrls', async () => {
      const { status, body } = await upload({
        file: await fixtureFile('sample.md'),
        options: JSON.stringify({ deduplicateUrls: true }),
      });

      expect(status).toBe(200);
      expect(body.data.type).toBe('markdown');
      expect(body.data.links).toHaveLength(body.data.stats.unique);
      expect(body.data.stats.unique).toBeLessThan(body.data.stats.total);
    });

    test('HTML upload resolves relative links against baseUrl', async () => {
      const file = new File(['<a href="/about">About</a>'], 'page.html');
      const { status, body } = await upload({ file, baseUrl: 'https://site.example.com/blog/' });

      expect(status).toBe(200);
      expect(body.data.links[0].url).toBe('https://site.example.com/about');
    });

    test('explicit type overrides the filename', async () => {
      const file = new File(['[a](https://x.example.com)'], 'notes.txt');
      const { status, body } = await upload({ file, type: 'markdown' });

      expect(status).toBe(200);
      expect(body.data.type).toBe('markdown');
    });

    test('a PDF renamed to .md is still read as a PDF', async () => {
      const { status, body } = await upload({ file: await fixtureFile('sample.pdf', 'renamed.md') });
      expect(status).toBe(200);
      expect(body.data.type).toBe('pdf');
    });
  });

  describe('errors', () => {
    type ErrorBody = { success: boolean; error: { code: string; message: string } };
    const expectError = (res: { status: number; body: ErrorBody }, status: number, code: string) => {
      expect(res.status).toBe(status);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(code);
      expect(res.body.error.message).toBeTruthy();
    };

    test('400 INVALID_REQUEST without multipart body', async () => {
      const response = await POST(
        new Request(URL_, {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json' },
        })
      );
      expectError({ status: response.status, body: await response.json() }, 400, 'INVALID_REQUEST');
    });

    test('400 INVALID_REQUEST when the file field is missing', async () => {
      expectError(await upload({ type: 'pdf' }), 400, 'INVALID_REQUEST');
    });

    test('400 INVALID_REQUEST for an unknown type', async () => {
      expectError(
        await upload({ file: await fixtureFile('sample.md'), type: 'docx' }),
        400,
        'INVALID_REQUEST'
      );
    });

    test.each([
      ['not json', 'nope'],
      ['an array', '[]'],
      ['a non-boolean flag', '{"extractDates":"yes"}'],
    ])('400 INVALID_REQUEST when options is %s', async (_label, options) => {
      expectError(
        await upload({ file: await fixtureFile('sample.md'), options }),
        400,
        'INVALID_REQUEST'
      );
    });

    test('400 INVALID_REQUEST for a non-http baseUrl', async () => {
      expectError(
        await upload({ file: await fixtureFile('sample.html'), baseUrl: 'javascript:alert(1)' }),
        400,
        'INVALID_REQUEST'
      );
    });

    test('413 FILE_TOO_LARGE for a file over 10 MB', async () => {
      const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.md');
      expectError(await upload({ file: big }), 413, 'FILE_TOO_LARGE');
    });

    test('413 FILE_TOO_LARGE from Content-Length, before reading the body', async () => {
      const response = await POST(
        new Request(URL_, {
          method: 'POST',
          body: 'x',
          headers: {
            'content-type': 'multipart/form-data; boundary=x',
            'content-length': String(50 * 1024 * 1024),
          },
        })
      );
      expectError({ status: response.status, body: await response.json() }, 413, 'FILE_TOO_LARGE');
    });

    test('415 UNSUPPORTED_FORMAT for other file types', async () => {
      const file = new File(['{"a":1}'], 'data.json', { type: 'application/json' });
      expectError(await upload({ file }), 415, 'UNSUPPORTED_FORMAT');
    });

    test('422 ENCRYPTED_PDF for password-protected PDFs', async () => {
      expectError(await upload({ file: await fixtureFile('encrypted.pdf') }), 422, 'ENCRYPTED_PDF');
    });

    test('422 PARSE_ERROR for corrupt PDFs', async () => {
      expectError(await upload({ file: await fixtureFile('corrupt.pdf') }), 422, 'PARSE_ERROR');
    });

    test('422 NO_LINKS_FOUND for a document without links', async () => {
      expectError(
        await upload({ file: new File(['# No links here'], 'empty.md') }),
        422,
        'NO_LINKS_FOUND'
      );
    });
  });
});
