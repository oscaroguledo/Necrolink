// @vitest-environment node
/**
 * Integration tests for POST /api/export, end to end:
 * extract → (mocked) check results → export → downloaded file.
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { POST } from '@/app/api/export/route';
import { extractLinks } from '@/lib/extractors';
import { safeBaseName } from '@/lib/exporters/export-handler';

const fixture = (name: string) => readFile(join(__dirname, '../fixtures', name));
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

/** Give each extracted link a verdict in rotation: ghost, zombie, lost, living. */
function verdicts(links: { id: string; originalUrl: string }[]) {
  return links.map((link, i) => {
    const status = (['ghost', 'zombie', 'lost', 'living'] as const)[i % 4];
    return {
      linkId: link.id,
      status,
      reason: status === 'zombie' ? 'Redirects to a different site (casino.example.net)' : 'Page not found (404)',
      ...(status === 'ghost'
        ? { archived: { url: `https://web.archive.org/web/20190501000000/${link.originalUrl}`, timestamp: '2019-05-01T00:00:00.000Z' } }
        : {}),
    };
  });
}

describe('POST /api/export', () => {
  test('Markdown: extract → check → export returns the fixed document as a download', async () => {
    const content = (await fixture('sample.md')).toString('utf-8');
    const extracted = await extractLinks({ data: new TextEncoder().encode(content), filename: 'sample.md' });
    const response = await post({ filename: 'My Paper (final).md', type: 'markdown', content, results: verdicts(extracted.links) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('filename="My_Paper_final_.necrolink.md"');
    const stats = JSON.parse(response.headers.get('x-necrolink-stats')!);
    expect(stats.ghosts + stats.zombies + stats.lost + stats.unchanged).toBe(extracted.links.length);

    const body = await response.text();
    expect(body).toContain('👻→⏮️');
    expect(body).toContain('https://web.archive.org/web/20190501000000/');
    expect(body).toContain('## 🪦 Necrolink Notes');
    expect(body).toMatch(/\*Fixed by \[Necrolink\]/);
  });

  test('HTML: uses baseUrl to match relative links the same way extraction did', async () => {
    const content = (await fixture('sample.html')).toString('utf-8');
    const extracted = await extractLinks({ data: new TextEncoder().encode(content), filename: 'sample.html' });
    const response = await post({ filename: 'sample.html', type: 'html', content, results: verdicts(extracted.links) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('data-necrolink="ghost"');
    expect(body).toContain('id="necrolink-notes"');
  });

  test('PDF: returns a resurrection report', async () => {
    const extracted = await extractLinks({ data: new Uint8Array(await fixture('sample.pdf')), filename: 'sample.pdf' });
    const response = await post({ filename: 'sample.pdf', type: 'pdf', links: extracted.links, results: verdicts(extracted.links) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('sample.necrolink-report.md');
    const body = await response.text();
    expect(body).toContain('# 🪦 Necrolink report: sample.pdf');
    expect(body).toMatch(/\| p\. \d+ \|/);
  });

  test('a fake archive URL is ignored, never written into the document', async () => {
    const content = '[x](https://dead.example.com)\n';
    const response = await post({
      filename: 'x.md',
      type: 'markdown',
      content,
      results: [{ linkId: 'link_1', status: 'ghost', reason: '404', archived: { url: 'javascript:alert(1)', timestamp: '' } }],
    });
    const body = await response.text();
    expect(body).not.toContain('javascript:');
    expect(body).toContain('[x](https://dead.example.com)');
  });

  describe('validation', () => {
    test.each([
      ['not JSON', 'nope'],
      ['missing filename', { type: 'markdown', content: 'x', results: [] }],
      ['bad type', { filename: 'x', type: 'docx', content: 'x', results: [] }],
      ['document without content', { filename: 'x.md', type: 'markdown', results: [] }],
      ['report without links', { filename: 'x.pdf', type: 'pdf', results: [] }],
      ['bad status', { filename: 'x.md', type: 'markdown', content: 'x', results: [{ linkId: 'a', status: 'undead' }] }],
      ['bad baseUrl', { filename: 'x.html', type: 'html', content: 'x', baseUrl: 'javascript:1', results: [] }],
    ])('400 for %s', async (_label, body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    });

    test('413 for a body over 12 MB', async () => {
      const response = await post('{}', { 'content-length': String(13 * 1024 * 1024) });
      expect(response.status).toBe(413);
    });
  });
});

describe('safeBaseName', () => {
  test.each([
    ['paper.pdf', 'paper'],
    ['My Paper (final).md', 'My_Paper_final_'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\docs\\notes.html', 'notes'],
    ['"; evil=1.md', 'evil_1'],
    ['.hidden', 'document'],
    ['', 'document'],
  ])('%s → %s', (input, expected) => {
    expect(safeBaseName(input)).toBe(expected);
  });
});
