/**
 * Unit tests for HTML link extraction
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractLinksFromHTML } from '@/lib/extractors/html';

describe('HTML Link Extractor', () => {
  describe('Absolute URLs', () => {
    test('extracts URL, text, and position from a simple link', async () => {
      const html = '<p>See <a href="https://example.com">Example</a> for details.</p>';
      const links = await extractLinksFromHTML(html);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        url: 'https://example.com/',
        originalUrl: 'https://example.com',
        text: 'Example',
      });
      expect(links[0].position.offset).toBeGreaterThanOrEqual(0);
      expect(links[0].id).toMatch(/^link_\d+$/);
    });

    test('extracts both http and https links', async () => {
      const html = `
        <a href="http://insecure.example.com">HTTP</a>
        <a href="https://secure.example.com">HTTPS</a>
      `;
      const links = await extractLinksFromHTML(html);

      expect(links.map((l) => l.url)).toEqual([
        'http://insecure.example.com/',
        'https://secure.example.com/',
      ]);
    });

    test('extracts protocol-relative URLs as https', async () => {
      const links = await extractLinksFromHTML('<a href="//cdn.example.com/lib.js">CDN</a>');

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://cdn.example.com/lib.js');
    });
  });

  describe('Relative URLs', () => {
    const base = 'https://example.com/docs/';

    test('resolves root-relative paths against baseUrl', async () => {
      const links = await extractLinksFromHTML('<a href="/about">About</a>', base);
      expect(links[0].url).toBe('https://example.com/about');
      expect(links[0].originalUrl).toBe('/about');
    });

    test('resolves ./ and bare relative paths against baseUrl', async () => {
      const links = await extractLinksFromHTML(
        '<a href="./overview.html">A</a><a href="guide.html">B</a>',
        base
      );
      expect(links.map((l) => l.url)).toEqual([
        'https://example.com/docs/overview.html',
        'https://example.com/docs/guide.html',
      ]);
    });

    test('resolves ../ paths against baseUrl', async () => {
      const links = await extractLinksFromHTML('<a href="../contact.html">Contact</a>', base);
      expect(links[0].url).toBe('https://example.com/contact.html');
    });

    test('uses the <base> tag when no baseUrl is passed', async () => {
      const html = `
        <html><head><base href="https://site.example.org/blog/"></head>
        <body><a href="post-1.html">Post</a></body></html>
      `;
      const links = await extractLinksFromHTML(html);
      expect(links[0].url).toBe('https://site.example.org/blog/post-1.html');
    });

    test('passed baseUrl takes priority over the <base> tag', async () => {
      const html = `
        <html><head><base href="https://ignored.example.org/"></head>
        <body><a href="page.html">Page</a></body></html>
      `;
      const links = await extractLinksFromHTML(html, 'https://preferred.example.com/');
      expect(links[0].url).toBe('https://preferred.example.com/page.html');
    });

    test('skips relative links when there is no base to resolve against', async () => {
      // Without a base, "about.html" would otherwise become the bogus host https://about.html/
      const html = '<a href="about.html">About</a><a href="/x">X</a><a href="https://ok.example.com">OK</a>';
      const links = await extractLinksFromHTML(html);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://ok.example.com/');
    });
  });

  describe('Anchor Text Extraction', () => {
    test('extracts text from nested elements', async () => {
      const html = `
        <a href="https://a.example.com"><strong>bold text</strong></a>
        <a href="https://b.example.com"><em>emphasized</em></a>
        <a href="https://c.example.com"><strong>bold and <em>italic</em> mixed</strong></a>
      `;
      const links = await extractLinksFromHTML(html);

      expect(links.map((l) => l.text)).toEqual([
        'bold text',
        'emphasized',
        'bold and italic mixed',
      ]);
    });

    test('falls back to href when anchor text is empty', async () => {
      const links = await extractLinksFromHTML('<a href="https://empty.example.com"></a>');
      expect(links[0].text).toBe('https://empty.example.com');
    });

    test('trims whitespace around anchor text', async () => {
      const links = await extractLinksFromHTML('<a href="https://x.example.com">\n   Spaced   \n</a>');
      expect(links[0].text).toBe('Spaced');
    });
  });

  describe('Position Tracking', () => {
    test('offsets increase in document order', async () => {
      const html = `
        <a href="https://one.example.com">1</a>
        <a href="https://two.example.com">2</a>
        <a href="https://three.example.com">3</a>
      `;
      const links = await extractLinksFromHTML(html);
      const offsets = links.map((l) => l.position.offset);

      expect(offsets).toHaveLength(3);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
      }
    });

    test('duplicate URLs keep distinct positions', async () => {
      const html = `
        <p>First <a href="https://dup.example.com">one</a>.</p>
        <p>Second <a href="https://dup.example.com">two</a>.</p>
      `;
      const links = await extractLinksFromHTML(html);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe(links[1].url);
      expect(links[0].position.offset).not.toBe(links[1].position.offset);
    });
  });

  describe('Context Extraction', () => {
    test('includes surrounding paragraph text', async () => {
      const html = '<p>Smith (2023). <a href="https://j.example.org">Journal</a>. Retrieved 2023-06-15.</p>';
      const links = await extractLinksFromHTML(html);

      expect(links[0].context).toContain('Smith (2023)');
      expect(links[0].context).toContain('Retrieved 2023-06-15');
    });

    test('limits context length for long paragraphs', async () => {
      const filler = 'word '.repeat(100);
      const html = `<p>${filler}<a href="https://mid.example.com">the link</a> ${filler}</p>`;
      const links = await extractLinksFromHTML(html);

      expect(links[0].context).toContain('the link');
      expect(links[0].context.length).toBeLessThan(200);
      expect(links[0].context.startsWith('...')).toBe(true);
      expect(links[0].context.endsWith('...')).toBe(true);
    });

    test('uses the list item as context inside lists', async () => {
      const html = '<ul><li>Item one <a href="https://li.example.com">link</a> here</li><li>Other</li></ul>';
      const links = await extractLinksFromHTML(html);

      expect(links[0].context).toBe('Item one link here');
    });
  });

  describe('URL Normalization', () => {
    test('removes tracking params and sorts the rest', async () => {
      const html = '<a href="https://example.com/page?query=test&utm_source=newsletter&page=2">T</a>';
      const links = await extractLinksFromHTML(html);

      expect(links[0].url).toBe('https://example.com/page?page=2&query=test');
      expect(links[0].originalUrl).toBe(
        'https://example.com/page?query=test&utm_source=newsletter&page=2'
      );
    });

    test('lowercases scheme and host and drops trailing slash', async () => {
      const links = await extractLinksFromHTML('<a href="HTTPS://EXAMPLE.COM/PATH/">M</a>');
      expect(links[0].url).toBe('https://example.com/PATH');
    });

    test('strips fragments from full URLs', async () => {
      const links = await extractLinksFromHTML('<a href="https://research.org/paper#section-3">S</a>');
      expect(links[0].url).toBe('https://research.org/paper');
      expect(links[0].originalUrl).toBe('https://research.org/paper#section-3');
    });
  });

  describe('Special Schemes', () => {
    test.each([
      ['mailto:test@example.com'],
      ['tel:+1234567890'],
      ["javascript:alert('x')"],
      ['JAVASCRIPT:void(0)'],
      ['  javascript:void(0)'],
      ['data:text/plain,Hello'],
      ['ftp://files.example.com/file.txt'],
    ])('skips %s', async (href) => {
      const links = await extractLinksFromHTML(`<a href="${href}">x</a>`);
      expect(links).toHaveLength(0);
    });

    test('skips fragment-only links', async () => {
      const links = await extractLinksFromHTML('<a href="#top">Top</a>');
      expect(links).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('returns empty array for empty or whitespace input', async () => {
      expect(await extractLinksFromHTML('')).toEqual([]);
      expect(await extractLinksFromHTML('   \n  ')).toEqual([]);
    });

    test('returns empty array when there are no links', async () => {
      expect(await extractLinksFromHTML('<p>No links here.</p>')).toEqual([]);
    });

    test('ignores anchors without href or with empty href', async () => {
      const html = '<a name="anchor">A</a><a href="">B</a><a href="   ">C</a>';
      expect(await extractLinksFromHTML(html)).toEqual([]);
    });

    test('handles malformed HTML without throwing', async () => {
      // Note: an *unclosed* <a> is re-opened by the HTML5 parser in the next
      // block (same as browsers), so we close the anchor but leave other tags broken.
      const html = '<p><a href="https://broken.example.com">Unclosed <b>tags</a><p>more <div><span>';
      const links = await extractLinksFromHTML(html);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://broken.example.com/');
    });
  });

  describe('Unique IDs', () => {
    test('IDs are unique and follow link_N', async () => {
      const html = Array.from(
        { length: 5 },
        (_, i) => `<a href="https://site${i}.example.com">${i}</a>`
      ).join('');
      const links = await extractLinksFromHTML(html);
      const ids = links.map((l) => l.id);

      expect(new Set(ids).size).toBe(5);
      ids.forEach((id) => expect(id).toMatch(/^link_\d+$/));
    });
  });

  describe('Integration: sample.html fixture', () => {
    test('extracts all checkable links from the fixture', async () => {
      const html = await readFile(join(__dirname, '../fixtures/sample.html'), 'utf-8');
      const links = await extractLinksFromHTML(html);
      const urls = links.map((l) => l.url);

      // 26 anchors in the fixture, 5 of them special schemes / fragment-only
      expect(links).toHaveLength(21);

      // Relative links resolved via the fixture's <base href="https://example.com/docs/">
      expect(urls).toContain('https://example.com/about');
      expect(urls).toContain('https://example.com/contact.html');
      expect(urls).toContain('https://example.com/docs/guide.html');
      expect(urls).toContain('https://example.com/docs/installation');
      expect(urls).toContain('https://example.com/parent-page.html');

      // Skipped schemes never appear
      expect(urls.some((u) => /mailto:|tel:|javascript:|data:/i.test(u))).toBe(false);

      // Every link has the required fields
      for (const link of links) {
        expect(link.id).toMatch(/^link_\d+$/);
        expect(link.url).toMatch(/^https?:\/\//);
        expect(link.originalUrl).toBeTruthy();
        expect(link.text).toBeTruthy();
        expect(typeof link.position.offset).toBe('number');
        expect(typeof link.context).toBe('string');
      }
    });

    test('citation context includes the retrieval date', async () => {
      const html = await readFile(join(__dirname, '../fixtures/sample.html'), 'utf-8');
      const links = await extractLinksFromHTML(html);
      const citation = links.find((l) => l.url === 'https://journal.example.org/articles/link-rot');

      expect(citation?.context).toMatch(/Retrieved 2023-06-15/);
    });
  });
});
