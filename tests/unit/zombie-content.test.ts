// @vitest-environment node
/**
 * Tests for content extraction, parked-page detection and similarity (spec 03).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { extractMainContent, detectParkedPage, spamTerms } from '@/lib/zombie/content';
import { jaccard, contentSimilarity, tokenize, wordCount } from '@/lib/zombie/similarity';

const fixture = (name: string) =>
  extractMainContent(readFileSync(join(__dirname, '../fixtures/zombie', name), 'utf-8'), 'https://dpl.example.org/research/link-rot');

const archived = fixture('research-archived.html');
const updated = fixture('research-updated.html');
const parked = fixture('parked.html');
const casino = fixture('casino.html');
const shop = fixture('topic-change.html');

describe('extractMainContent', () => {
  test('extracts the article without nav and footer', () => {
    expect(archived.usedReadability).toBe(true);
    expect(archived.title).toMatch(/Link Rot and Content Drift/);
    expect(archived.text).toContain('content drift');
    expect(archived.text).not.toContain('Privacy policy');
    expect(archived.text).not.toMatch(/\bPeople\b/);
  });

  test('falls back to body text for short pages', () => {
    expect(parked.usedReadability).toBe(false);
    expect(parked.text).toContain('This domain is for sale');
  });

  test('never runs scripts in the page', () => {
    const page = fixture('script-trap.html');
    expect(page.title).toBe('Safe Title');
    expect(page.text).toContain('Original text that should be extracted as is.');
    expect(page.text).not.toContain('SCRIPT RAN');
  });

  test('handles empty and malformed HTML', () => {
    expect(extractMainContent('', 'https://x.example/')).toMatchObject({ title: '', text: '' });
    expect(extractMainContent('<p>unclosed <b>tags', 'not a url').text).toBe('unclosed tags');
  });

  test('collapses whitespace', () => {
    expect(extractMainContent('<p>a\n\n   b\t c</p>', 'https://x.example/').text).toBe('a b c');
  });
});

describe('page signals', () => {
  test('detects a parked / for-sale domain', () => {
    expect(detectParkedPage(parked)).toMatch(/for sale/);
  });

  test.each([
    ['buy this domain', 'Buy this domain now'],
    ['reseller', 'Listed on HugeDomains.com'],
    ['expired', 'The domain example.org has expired'],
    ['suspended', 'This account has been suspended'],
  ])('detects %s', (_label, text) => {
    expect(detectParkedPage({ title: '', text, usedReadability: false })).toBeDefined();
  });

  test('a normal article is not parked', () => {
    expect(detectParkedPage(archived)).toBeUndefined();
    expect(detectParkedPage(shop)).toBeUndefined();
  });

  test('finds gambling spam terms', () => {
    expect(spamTerms(casino)).toEqual(expect.arrayContaining(['casino bonus', 'sports betting']));
    expect(spamTerms(archived)).toEqual([]);
  });
});

describe('similarity on fixtures', () => {
  test('redesigned + updated article stays very similar', () => {
    expect(contentSimilarity(archived.text, updated.text)).toBeGreaterThan(0.8);
    expect(jaccard(archived.title, updated.title)).toBeGreaterThan(0.5);
  });

  test.each([
    ['parked page', () => parked],
    ['casino takeover', () => casino],
    ['shoe shop', () => shop],
  ])('%s is very different from the article', (_label, other) => {
    expect(contentSimilarity(archived.text, other().text)).toBeLessThan(0.15);
    expect(jaccard(archived.title, other().title)).toBeLessThan(0.2);
  });
});

describe('similarity properties (spec 03 task 2.3)', () => {
  const text = fc.array(fc.constantFrom('link', 'rot', 'archive', 'paper', 'casino', 'shoe', 'drift', 'cite', '42', 'web'), {
    maxLength: 40,
  }).map((words) => words.join(' '));

  test('identical texts score 1', () => {
    fc.assert(
      fc.property(text, (t) => {
        expect(jaccard(t, t)).toBe(1);
        expect(contentSimilarity(t, t)).toBe(1);
      }),
      { numRuns: 500 }
    );
  });

  test('symmetric and within [0, 1]', () => {
    fc.assert(
      fc.property(fc.oneof(text, fc.string()), fc.oneof(text, fc.string()), (a, b) => {
        for (const sim of [jaccard, contentSimilarity]) {
          const ab = sim(a, b);
          expect(ab).toBe(sim(b, a));
          expect(ab).toBeGreaterThanOrEqual(0);
          expect(ab).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 1000 }
    );
  });

  test('texts with no words in common score 0', () => {
    const left = fc.array(fc.constantFrom('alpha', 'beta', 'gamma'), { minLength: 1 }).map((w) => w.join(' '));
    const right = fc.array(fc.constantFrom('delta', 'omega', 'sigma'), { minLength: 1 }).map((w) => w.join(' '));
    fc.assert(
      fc.property(left, right, (a, b) => {
        expect(jaccard(a, b)).toBe(0);
        expect(contentSimilarity(a, b)).toBe(0);
      }),
      { numRuns: 300 }
    );
  });

  test('repeating a text does not change cosine similarity (length-insensitive)', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(contentSimilarity(`${a} ${a}`, b)).toBeCloseTo(contentSimilarity(a, b), 9);
      }),
      { numRuns: 500 }
    );
  });
});

describe('tokenize', () => {
  test('lowercases, keeps letters and digits in any script, drops stopwords and 1-char tokens', () => {
    expect(tokenize('The Café of 2023 is a NÄCHSTE x Ünïcode')).toEqual(['café', '2023', 'nächste', 'ünïcode']);
    expect(wordCount('a b cc dd')).toBe(2);
  });
});
