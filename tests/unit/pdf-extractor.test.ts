/**
 * Unit tests for PDF link extraction
 */

import { describe, test, expect } from 'vitest';
import { extractLinksFromPDF } from '@/lib/extractors/pdf';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the sample PDF fixture
const getSamplePDF = (): Uint8Array => {
  const path = join(__dirname, '../fixtures/sample.pdf');
  return new Uint8Array(readFileSync(path));
};

describe('PDF Link Extraction', () => {
  test('handles empty buffer', async () => {
    const buffer = new Uint8Array(0);
    const links = await extractLinksFromPDF(buffer);
    expect(links).toHaveLength(0);
  });

  test('extracts URLs from PDF text content', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    expect(links.length).toBeGreaterThanOrEqual(1);
    const exampleLink = links.find(l => l.url.includes('example.com'));
    expect(exampleLink).toBeDefined();
    expect(exampleLink?.position.page).toBe(1);
  });

  test('tracks page numbers correctly', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    // Sample PDF has links on pages 1 and 2
    expect(links.length).toBeGreaterThan(0);
    expect(links.some(l => l.position.page === 1)).toBe(true);
    expect(links.some(l => l.position.page === 2)).toBe(true);
  });

  test('extracts context around URLs', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    expect(links.length).toBeGreaterThan(0);
    // Check that at least one link has context
    const linkWithContext = links.find(l => l.context.length > 0);
    expect(linkWithContext).toBeDefined();
  });

  test('normalizes extracted URLs', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    expect(links.length).toBeGreaterThan(0);
    // All URLs should be normalized
    links.forEach(link => {
      expect(link.url).toBeTruthy();
      expect(link.originalUrl).toBeTruthy();
      // URL should start with http(s)
      expect(link.url.startsWith('http')).toBe(true);
    });
  });

  test('handles malformed PDFs gracefully', async () => {
    const malformed = new Uint8Array([1, 2, 3, 4, 5]);
    
    // Should throw PdfExtractionError instead of returning empty array
    await expect(extractLinksFromPDF(malformed)).rejects.toThrow();
  });

  test('generates unique IDs for each link', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    if (links.length >= 2) {
      expect(links[0]?.id).toBeTruthy();
      expect(links[1]?.id).toBeTruthy();
      expect(links[0]?.id).not.toBe(links[1]?.id);
      
      // Check all IDs are unique
      const ids = links.map(l => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  test('extracts multiple URLs from same page', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    // Sample PDF contains 7 URLs total across 2 pages
    expect(links.length).toBeGreaterThanOrEqual(7);
    
    // Page 1 should have multiple links
    const page1Links = links.filter(l => l.position.page === 1);
    expect(page1Links.length).toBeGreaterThan(1);
  });

  test('handles URLs with paths and query parameters', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    // Our sample PDF has various URL formats
    expect(links.length).toBeGreaterThan(0);
    
    // All URLs should have proper structure
    links.forEach(link => {
      expect(link.url).toMatch(/^https?:\/\//);
      expect(link.originalUrl).toMatch(/^https?:\/\//);
    });
  });

  test('skips non-HTTP URLs', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    // All extracted links should be HTTP/HTTPS
    expect(links.every(l => l.url.startsWith('http'))).toBe(true);
  });

  test('provides text and context for each link', async () => {
    const pdfContent = getSamplePDF();
    const links = await extractLinksFromPDF(pdfContent);
    
    expect(links.length).toBeGreaterThan(0);
    links.forEach(link => {
      expect(link.text).toBeTruthy();
      expect(link.context).toBeTruthy();
      expect(link.position.page).toBeGreaterThan(0);
      expect(typeof link.position.offset).toBe('number');
    });
  });
});
