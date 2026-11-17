/**
 * Unit tests for HTML link extraction
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractLinksFromHTML } from '@/lib/extractors/html';

describe('HTML Link Extraction', () => {
  test('extracts absolute URLs', async () => {
    const html = `
      <p>Visit <a href="https://example.com">Example</a> website.</p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/');
    expect(links[0]?.originalUrl).toBe('https://example.com');
    expect(links[0]?.text).toBe('Example');
  });

  test('resolves relative URLs with base', async () => {
    const html = `
      <p>See <a href="/docs/guide">the guide</a> for details.</p>
    `;
    
    const links = await extractLinksFromHTML(html, 'https://example.com');
    
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/docs/guide');
    expect(links[0]?.originalUrl).toBe('/docs/guide');
  });

  test('uses base tag from HTML', async () => {
    const html = `
      <html>
        <head><base href="https://example.com/"></head>
        <body><a href="/page">Page</a></body>
      </html>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/page');
  });

  test('skips mailto links', async () => {
    const html = `
      <p>Email: <a href="mailto:test@example.com">Contact</a></p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(0);
  });

  test('skips tel links', async () => {
    const html = `
      <p>Call: <a href="tel:+1234567890">Phone</a></p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(0);
  });

  test('skips javascript links', async () => {
    const html = `
      <p><a href="javascript:alert('test')">Alert</a></p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(0);
  });

  test('extracts text from nested HTML elements', async () => {
    const html = `
      <p>
        <a href="https://example.com/bold"><strong>Bold Text</strong></a>
        <a href="https://example.com/italic"><em>Italic Text</em></a>
        <a href="https://example.com/mixed"><strong>Bold</strong> and <em>italic</em></a>
      </p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(3);
    expect(links[0]?.text).toBe('Bold Text');
    expect(links[1]?.text).toBe('Italic Text');
    expect(links[2]?.text).toBe('Bold and italic');
  });

  test('normalizes URLs', async () => {
    const html = `
      <a href="https://example.com/page?utm_source=test&page=1">Link</a>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    // URL should be normalized (tracking params removed, params sorted)
    expect(links[0]?.url).toBe('https://example.com/page?page=1');
    expect(links[0]?.url).not.toContain('utm_source');
  });

  test('extracts context around links', async () => {
    const html = `
      <p>Check out this amazing website at <a href="https://example.com">Example</a> for more information.</p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.context).toContain('Example');
    expect(links[0]?.context.length).toBeGreaterThan(0);
  });

  test('handles empty HTML', async () => {
    const links = await extractLinksFromHTML('');
    expect(links).toHaveLength(0);
  });

  test('handles HTML with no links', async () => {
    const html = '<p>Just text, no links here.</p>';
    const links = await extractLinksFromHTML(html);
    expect(links).toHaveLength(0);
  });

  test('handles malformed HTML gracefully', async () => {
    const html = '<p>Broken <a href="https://example.com">link</p>';
    const links = await extractLinksFromHTML(html);
    
    // Should still extract the link despite malformed HTML
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://example.com/');
  });

  test('trims whitespace from link text', async () => {
    const html = `
      <a href="https://example.com">   Trimmed   </a>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.text).toBe('Trimmed');
  });

  test('handles links with no text', async () => {
    const html = '<a href="https://example.com"></a>';
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.text).toBe('');
  });

  test('generates unique IDs for each link', async () => {
    const html = `
      <a href="https://example.com/1">Link 1</a>
      <a href="https://example.com/2">Link 2</a>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(2);
    expect(links[0]?.id).toBeTruthy();
    expect(links[1]?.id).toBeTruthy();
    expect(links[0]?.id).not.toBe(links[1]?.id);
  });

  test('handles duplicate URLs', async () => {
    const html = `
      <p>First: <a href="https://example.com/page">Link 1</a></p>
      <p>Second: <a href="https://example.com/page">Link 2</a></p>
    `;
    
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(2);
    expect(links[0]?.url).toBe('https://example.com/page');
    expect(links[1]?.url).toBe('https://example.com/page');
    // But different IDs
    expect(links[0]?.id).not.toBe(links[1]?.id);
  });

  test('skips relative URLs without base', async () => {
    const html = '<a href="/relative/path">Relative</a>';
    const links = await extractLinksFromHTML(html);
    
    // Should skip since it can't resolve to absolute
    expect(links).toHaveLength(0);
  });

  test('handles links with fragments', async () => {
    const html = '<a href="https://example.com/doc#section">Section</a>';
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    // Fragment should be removed by normalization
    expect(links[0]?.url).toBe('https://example.com/doc');
  });

  test('handles links with query parameters', async () => {
    const html = '<a href="https://example.com/search?q=test&page=2">Search</a>';
    const links = await extractLinksFromHTML(html);
    
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toContain('page=2');
    expect(links[0]?.url).toContain('q=test');
  });
});

describe('HTML Link Extraction - Integration', () => {
  test('extracts all links from sample HTML file', async () => {
    const htmlPath = join(__dirname, '../fixtures/sample.html');
    const html = readFileSync(htmlPath, 'utf-8');
    
    const links = await extractLinksFromHTML(html);
    
    // Sample HTML has many links (exact count may vary, but should be > 15)
    expect(links.length).toBeGreaterThan(15);
    
    // Verify some expected links are extracted
    const urls = links.map(l => l.url);
    expect(urls).toContain('https://github.com/example/repo');
    expect(urls).toContain('https://example.com/docs/getting-started');
    
    // Verify mailto links are skipped
    expect(urls).not.toContain('mailto:contact@example.com');
  });
});
