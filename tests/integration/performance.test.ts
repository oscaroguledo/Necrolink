// @vitest-environment node
/**
 * Performance requirements from spec 01:
 * - 50-page PDF extracts in < 5 seconds
 * - 10KB Markdown extracts in < 500ms
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractLinks } from '@/lib/extractors';

describe('extraction performance (spec 01)', () => {
  test('50-page PDF extracts in under 5 seconds', async () => {
    const data = new Uint8Array(await readFile(join(__dirname, '../fixtures/large-50-pages.pdf')));

    const start = performance.now();
    const result = await extractLinks({ data, filename: 'large.pdf' });
    const elapsed = performance.now() - start;

    expect(result.stats.total).toBe(300); // 6 links × 50 pages
    expect(new Set(result.links.map((l) => l.position.page)).size).toBe(50);
    expect(result.stats.withDates).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(5000);
  }, 15_000);

  test('10 KB Markdown extracts in under 500 ms', async () => {
    const line = (i: number) =>
      `- [Reference ${i}](https://example.com/ref/${i}?utm_source=x) Retrieved 2023-06-15.\n`;
    let markdown = '# References\n\n';
    for (let i = 0; markdown.length < 10 * 1024; i++) markdown += line(i);

    const start = performance.now();
    const result = await extractLinks({
      data: new TextEncoder().encode(markdown),
      filename: 'refs.md',
    });
    const elapsed = performance.now() - start;

    expect(result.stats.total).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(500);
  });
});
