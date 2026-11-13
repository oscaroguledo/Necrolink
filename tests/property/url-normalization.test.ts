/**
 * Property-based tests for URL normalization
 * 
 * These tests generate thousands of random URLs and verify invariants.
 * CRITICAL: Document every bug these tests catch for the hackathon write-up!
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  normalizeUrl,
  isAbsoluteUrl,
  resolveUrl,
  isSameUrl,
  extractDomain,
} from '@/lib/extractors/url-normalizer';

describe('URL Normalization Properties', () => {
  test('normalization is idempotent', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const once = normalizeUrl(url);
        const twice = normalizeUrl(once);
        expect(once).toBe(twice);
      }),
      { numRuns: 1000 }
    );
  });
  
  test('preserves domain and path semantics', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const normalized = normalizeUrl(url);
        
        // Both should be parseable as URLs
        const original = new URL(url);
        const result = new URL(normalized);
        
        // Core semantics preserved
        expect(result.hostname.toLowerCase()).toBe(
          original.hostname.toLowerCase()
        );
        
        // Path should be same or without trailing slash
        const originalPath = original.pathname.replace(/\/$/, '');
        const resultPath = result.pathname.replace(/\/$/, '');
        expect(resultPath).toBe(originalPath);
      }),
      { numRuns: 1000 }
    );
  });
  
  test('removes tracking parameters', () => {
    const trackingParams = ['utm_source', 'utm_medium', 'fbclid', 'gclid'];
    
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.constantFrom(...trackingParams),
        fc.string(),
        (baseUrl, param, value) => {
          const urlWithTracking = `${baseUrl}${
            baseUrl.includes('?') ? '&' : '?'
          }${param}=${value}`;
          
          const normalized = normalizeUrl(urlWithTracking);
          
          // Tracking param should be removed
          expect(normalized).not.toContain(param);
        }
      ),
      { numRuns: 500 }
    );
  });
  
  test('removes fragment by default', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.string(), (url, fragment) => {
        const urlWithFragment = `${url}#${fragment}`;
        const normalized = normalizeUrl(urlWithFragment);
        
        expect(normalized).not.toContain('#');
      }),
      { numRuns: 500 }
    );
  });
  
  test('sorting query parameters is stable', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.array(fc.tuple(fc.string(), fc.string())),
        (baseUrl, params) => {
          // Create URL with unsorted params
          const url = new URL(baseUrl);
          params.forEach(([key, value]) => {
            if (key && value) {
              url.searchParams.set(key, value);
            }
          });
          
          const normalized = normalizeUrl(url.toString());
          
          // Normalize again - should be identical
          const normalizedAgain = normalizeUrl(normalized);
          expect(normalized).toBe(normalizedAgain);
        }
      ),
      { numRuns: 500 }
    );
  });
  
  test('never crashes on malformed URLs', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        // Should not throw, even on garbage input
        const result = normalizeUrl(str);
        expect(typeof result).toBe('string');
      }),
      { numRuns: 1000 }
    );
  });
  
  test('isSameUrl is reflexive', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(isSameUrl(url, url)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
  
  test('isSameUrl is symmetric', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.webUrl(), (url1, url2) => {
        const result1 = isSameUrl(url1, url2);
        const result2 = isSameUrl(url2, url1);
        expect(result1).toBe(result2);
      }),
      { numRuns: 500 }
    );
  });
  
  test('extractDomain never crashes', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const domain = extractDomain(str);
        expect(domain === null || typeof domain === 'string').toBe(true);
      }),
      { numRuns: 1000 }
    );
  });
  
  test('absolute URL detection is correct', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(isAbsoluteUrl(url)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
});

/**
 * Regression tests for specific bugs found by property tests
 * DOCUMENT THESE IN THE WRITE-UP!
 */
describe('URL Normalization Regressions', () => {
  test('handles multiple consecutive slashes in path', () => {
    const url = 'https://example.com/path//with///slashes';
    const normalized = normalizeUrl(url);
    
    // Should be idempotent
    expect(normalizeUrl(normalized)).toBe(normalized);
  });
  
  test('handles URLs with only a fragment', () => {
    const url = 'https://example.com/#section';
    const normalized = normalizeUrl(url);
    
    expect(normalized).not.toContain('#');
    expect(normalized).toBe('https://example.com');
  });
  
  test('handles internationalized domain names', () => {
    const url = 'https://münchen.de/path';
    const normalized = normalizeUrl(url);
    
    // Should not crash
    expect(typeof normalized).toBe('string');
  });
  
  test('preserves non-tracking query parameters', () => {
    const url = 'https://example.com/search?q=test&page=2&utm_source=twitter';
    const normalized = normalizeUrl(url);
    
    expect(normalized).toContain('q=test');
    expect(normalized).toContain('page=2');
    expect(normalized).not.toContain('utm_source');
  });
});
