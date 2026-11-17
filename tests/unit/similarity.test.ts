/**
 * Unit tests for similarity functions (spec 03, phase 2).
 */

import { describe, test, expect } from 'vitest';
import { tokenize, jaccard, contentSimilarity, wordCount } from '@/lib/zombie/similarity';

describe('tokenize', () => {
  test('removes stopwords', () => {
    const tokens = tokenize('the quick brown fox and the lazy dog');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
  });

  test('lowercases all words', () => {
    const tokens = tokenize('Hello World TESTING');
    expect(tokens).toEqual(['hello', 'world', 'testing']);
  });

  test('keeps unicode characters', () => {
    const tokens = tokenize('café résumé naïve');
    expect(tokens).toContain('café');
    expect(tokens).toContain('résumé');
    expect(tokens).toContain('naïve');
  });

  test('drops 1-char tokens', () => {
    const tokens = tokenize('a b c hello world x y z');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).not.toContain('x');
    expect(tokens).toContain('hello');
  });

  test('extracts only letters and digits', () => {
    const tokens = tokenize('hello123 world456 test');
    expect(tokens).toContain('hello123');
    expect(tokens).toContain('world456');
    expect(tokens).toContain('test');
  });

  test('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  test('handles punctuation-only string', () => {
    expect(tokenize('!@#$%^&*()')).toEqual([]);
  });
});

describe('jaccard', () => {
  test('identical strings return 1', () => {
    expect(jaccard('hello world', 'hello world')).toBe(1);
  });

  test('completely different strings return 0', () => {
    expect(jaccard('hello world', 'foo bar')).toBe(0);
  });

  test('two empty strings return 1', () => {
    expect(jaccard('', '')).toBe(1);
  });

  test('symmetric: jaccard(a, b) === jaccard(b, a)', () => {
    const a = 'the quick brown fox';
    const b = 'the lazy brown dog';
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });

  test('partial overlap', () => {
    const similarity = jaccard('hello world testing', 'hello world coding');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  test('stopwords are ignored', () => {
    // "the" and "a" are stopwords
    const sim1 = jaccard('the cat', 'a cat');
    expect(sim1).toBe(1); // Both reduce to just "cat"
  });

  test('case insensitive', () => {
    expect(jaccard('Hello World', 'hello world')).toBe(1);
  });
});

describe('contentSimilarity', () => {
  test('identical strings return 1', () => {
    expect(contentSimilarity('hello world testing', 'hello world testing')).toBe(1);
  });

  test('two empty strings return 1', () => {
    expect(contentSimilarity('', '')).toBe(1);
  });

  test('one empty string returns 0', () => {
    expect(contentSimilarity('hello world', '')).toBe(0);
    expect(contentSimilarity('', 'hello world')).toBe(0);
  });

  test('symmetric: contentSimilarity(a, b) === contentSimilarity(b, a)', () => {
    const a = 'the quick brown fox jumps over the lazy dog';
    const b = 'the lazy brown dog sleeps under the tree';
    expect(contentSimilarity(a, b)).toBe(contentSimilarity(b, a));
  });

  test('same text with different lengths', () => {
    const a = 'hello world hello world hello world';
    const b = 'hello world';
    // Cosine similarity is insensitive to repetition
    const similarity = contentSimilarity(a, b);
    expect(similarity).toBeGreaterThan(0.9);
  });

  test('completely different returns low score', () => {
    const similarity = contentSimilarity('research paper machine learning', 'casino gambling poker');
    expect(similarity).toBeLessThan(0.1);
  });

  test('partial overlap', () => {
    const similarity = contentSimilarity('machine learning research paper', 'machine learning tutorial video');
    expect(similarity).toBeGreaterThan(0.3);
    expect(similarity).toBeLessThan(0.9);
  });

  test('returns value in [0, 1]', () => {
    const tests = [
      ['hello world', 'foo bar'],
      ['identical', 'identical'],
      ['partial overlap here', 'partial difference there'],
      ['', ''],
      ['something', ''],
    ];
    for (const [a, b] of tests) {
      const sim = contentSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    }
  });
});

describe('wordCount', () => {
  test('counts words correctly', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  test('ignores stopwords', () => {
    expect(wordCount('the quick brown fox')).toBe(3); // "the" is a stopword
  });

  test('counts tokens with 2+ chars', () => {
    expect(wordCount('a bb ccc')).toBe(2); // "a" is 1 char and is skipped
  });

  test('empty string returns 0', () => {
    expect(wordCount('')).toBe(0);
  });

  test('punctuation-only returns 0', () => {
    expect(wordCount('!@#$%^&*()')).toBe(0);
  });

  test('counts unicode words', () => {
    expect(wordCount('café résumé naïve')).toBe(3);
  });
});
