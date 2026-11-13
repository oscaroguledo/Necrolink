/**
 * Unit tests for Markdown link extraction
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractLinksFromMarkdown } from '@/lib/extractors/markdown';

describe('Markdown Link Extractor', () => {
  describe('Inline Links', () => {
    test('extracts URL, text, and position from inline link', async () => {
      const markdown = '[Example](https://example.com)';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        url: 'https://example.com/',
        originalUrl: 'https://example.com',
        text: 'Example',
      });
      expect(links[0].position.line).toBeGreaterThan(0);
      expect(links[0].position.offset).toBeGreaterThanOrEqual(0);
      expect(links[0].id).toMatch(/^link_\d+$/);
    });

    test('extracts multiple inline links', async () => {
      const markdown = `
[First](https://first.com)
[Second](https://second.com)
[Third](https://third.com)
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(3);
      expect(links[0].url).toBe('https://first.com/');
      expect(links[1].url).toBe('https://second.com/');
      expect(links[2].url).toBe('https://third.com/');
    });

    test('normalizes URLs by removing tracking parameters', async () => {
      const markdown = '[Link](https://example.com?utm_source=test&page=2)';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/?page=2');
      expect(links[0].originalUrl).toBe('https://example.com?utm_source=test&page=2');
    });
  });

  describe('Reference Links', () => {
    test('resolves reference-style links', async () => {
      const markdown = `
[Example][ref1]

[ref1]: https://example.com "Title"
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        url: 'https://example.com/',
        originalUrl: 'https://example.com',
        text: 'Example',
      });
    });

    test('handles multiple references to same definition', async () => {
      const markdown = `
[First][ref]
[Second][ref]

[ref]: https://example.com
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/');
      expect(links[1].url).toBe('https://example.com/');
      expect(links[0].text).toBe('First');
      expect(links[1].text).toBe('Second');
      // Different positions
      expect(links[0].position.offset).not.toBe(links[1].position.offset);
    });

    test('handles case-insensitive reference identifiers', async () => {
      const markdown = `
[Link][REF]

[ref]: https://example.com
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/');
    });
  });

  describe('Autolinks', () => {
    test('extracts autolinks', async () => {
      const markdown = 'Visit <https://example.com> for more info.';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        url: 'https://example.com/',
        originalUrl: 'https://example.com',
        text: 'https://example.com', // autolinks use URL as text
      });
    });

    test('extracts multiple autolinks', async () => {
      const markdown = `
<https://first.com>
<https://second.com>
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://first.com/');
      expect(links[1].url).toBe('https://second.com/');
    });
  });

  describe('Position Tracking', () => {
    test('tracks line numbers correctly', async () => {
      const markdown = `# Title

[First Link](https://first.com)

[Second Link](https://second.com)`;
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(2);
      expect(links[0].position.line).toBe(3);
      expect(links[1].position.line).toBe(5);
    });

    test('tracks character offsets', async () => {
      const markdown = '[First](https://first.com) and [Second](https://second.com)';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(2);
      expect(links[0].position.offset).toBe(0);
      expect(links[1].position.offset).toBeGreaterThan(links[0].position.offset);
    });

    test('positions are monotonically increasing', async () => {
      const markdown = `
[A](https://a.com)
[B](https://b.com)
[C](https://c.com)
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(3);
      expect(links[0].position.offset).toBeLessThan(links[1].position.offset);
      expect(links[1].position.offset).toBeLessThan(links[2].position.offset);
    });
  });

  describe('Context Extraction', () => {
    test('extracts surrounding context', async () => {
      const markdown = 'This is some text before [the link](https://example.com) and some text after.';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      expect(links[0].context).toContain('text before');
      expect(links[0].context).toContain('the link');
      expect(links[0].context).toContain('text after');
    });

    test('context is limited to reasonable length', async () => {
      const longText = 'a'.repeat(200);
      const markdown = `${longText}[link](https://example.com)${longText}`;
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(1);
      // Context should be roughly 100 chars (50 before + 50 after) plus link length
      expect(links[0].context.length).toBeLessThan(200);
    });
  });

  describe('Edge Cases', () => {
    test('returns empty array for empty input', async () => {
      const links = await extractLinksFromMarkdown('');
      expect(links).toEqual([]);
    });

    test('returns empty array for markdown with no links', async () => {
      const markdown = `# Title

This is plain text with no links.

Just some paragraphs.`;
      const links = await extractLinksFromMarkdown(markdown);
      expect(links).toEqual([]);
    });

    test('skips fragment-only links', async () => {
      const markdown = '[Section](#section)';
      const links = await extractLinksFromMarkdown(markdown);
      expect(links).toEqual([]);
    });

    test('skips mailto links', async () => {
      const markdown = '[Email](mailto:test@example.com)';
      const links = await extractLinksFromMarkdown(markdown);
      expect(links).toEqual([]);
    });

    test('handles malformed markdown gracefully', async () => {
      const markdown = '[broken link](not a url)';
      const links = await extractLinksFromMarkdown(markdown);
      
      // Should extract but URL normalization will handle it
      expect(links.length).toBeGreaterThanOrEqual(0);
    });

    test('handles duplicate URLs at different positions', async () => {
      const markdown = `
[First occurrence](https://duplicate.com)
Some text in between.
[Second occurrence](https://duplicate.com)
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe(links[1].url);
      expect(links[0].position.offset).not.toBe(links[1].position.offset);
      expect(links[0].context).not.toBe(links[1].context);
    });
  });

  describe('Mixed Link Types', () => {
    test('extracts all link types from mixed content', async () => {
      const markdown = `
# Mixed Links

[Inline](https://inline.com)
[Reference][ref]
<https://autolink.com>

[ref]: https://reference.com
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(3);
      
      const urls = links.map(l => l.url).sort();
      expect(urls).toEqual([
        'https://autolink.com/',
        'https://inline.com/',
        'https://reference.com/',
      ]);
    });
  });

  describe('Integration with Real Fixture', () => {
    test('extracts all links from sample.md fixture', async () => {
      const fixturePath = join(__dirname, '..', 'fixtures', 'sample.md');
      const content = await readFile(fixturePath, 'utf-8');
      const links = await extractLinksFromMarkdown(content);

      // Verify we extracted a reasonable number of links
      expect(links.length).toBeGreaterThanOrEqual(10);
      expect(links.length).toBeLessThanOrEqual(20);

      // All links should have required fields
      links.forEach(link => {
        expect(link.id).toBeTruthy();
        expect(link.url).toBeTruthy();
        expect(link.originalUrl).toBeTruthy();
        expect(link.text).toBeTruthy();
        expect(link.position.offset).toBeGreaterThanOrEqual(0);
        expect(link.position.line).toBeGreaterThan(0);
        expect(link.context).toBeTruthy();
      });

      // Check for specific URLs we know are in the fixture
      const urls = links.map(l => l.url);
      expect(urls).toContain('https://example.com/page');
      expect(urls).toContain('https://example.com/reference');
      expect(urls).toContain('https://archive.org/');
    });

    test('finds duplicate URLs in fixture', async () => {
      const fixturePath = join(__dirname, '..', 'fixtures', 'sample.md');
      const content = await readFile(fixturePath, 'utf-8');
      const links = await extractLinksFromMarkdown(content);

      // Find duplicates
      const urlCounts = new Map<string, number>();
      links.forEach(link => {
        urlCounts.set(link.url, (urlCounts.get(link.url) || 0) + 1);
      });

      // Should have at least one duplicate URL
      const duplicates = Array.from(urlCounts.entries()).filter(([_, count]) => count > 1);
      expect(duplicates.length).toBeGreaterThan(0);
    });

    test('extracts context with dates for citation detection', async () => {
      const fixturePath = join(__dirname, '..', 'fixtures', 'sample.md');
      const content = await readFile(fixturePath, 'utf-8');
      const links = await extractLinksFromMarkdown(content);

      // At least one link should have date-like text in context
      const hasDateContext = links.some(link => 
        /\d{4}-\d{2}-\d{2}|\d{4}\/\d{2}\/\d{2}|retrieved|published|accessed/i.test(link.context)
      );
      expect(hasDateContext).toBe(true);
    });
  });

  describe('URL Normalization Integration', () => {
    test('applies normalizeUrl to all extracted links', async () => {
      const markdown = `
[A](https://example.com/?utm_source=test)
[B](https://example.com/#fragment)
[C](HTTPS://EXAMPLE.COM/PATH/)
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      expect(links).toHaveLength(3);
      
      // All should be normalized
      links.forEach(link => {
        expect(link.url).toMatch(/^https:\/\//);
        expect(link.url).not.toContain('utm_source');
        expect(link.url.includes('HTTPS') || link.url.includes('EXAMPLE')).toBe(false);
      });
    });
  });

  describe('Unique IDs', () => {
    test('generates unique IDs for each link', async () => {
      const markdown = `
[A](https://a.com)
[B](https://b.com)
[C](https://c.com)
      `.trim();
      const links = await extractLinksFromMarkdown(markdown);

      const ids = links.map(l => l.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('IDs follow the link_N pattern', async () => {
      const markdown = '[Link](https://example.com)';
      const links = await extractLinksFromMarkdown(markdown);

      expect(links[0].id).toMatch(/^link_\d+$/);
    });
  });
});
