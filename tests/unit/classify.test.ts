/**
 * Tests for link status classification (spec 02 phase 2).
 */

import { describe, test, expect } from 'vitest';
import { classify, isDeadStatus, sameSite } from '@/lib/checker/classify';
import type { FetchResult } from '@/lib/checker/safe-fetch';

const URL_ = 'https://example.com/papers/link-rot';
const fetched = (overrides: Partial<FetchResult>): FetchResult => ({
  finalUrl: URL_,
  redirects: [],
  method: 'HEAD',
  attempts: 1,
  ...overrides,
});

describe('isDeadStatus', () => {
  test.each([
    [404, true],
    [410, true],
    [500, true],
    [503, true],
    [400, true],
    [451, true],
    [200, false],
    [301, false],
    [401, false],
    [403, false],
    [429, false],
  ])('%i → %s', (status, dead) => {
    expect(isDeadStatus(status)).toBe(dead);
  });
});

describe('classify', () => {
  describe('alive', () => {
    test('200 without redirects', () => {
      expect(classify(fetched({ status: 200 }), URL_).verdict).toBe('alive');
    });

    test('http → https on the same host is fine', () => {
      const result = fetched({
        status: 200,
        finalUrl: 'https://example.com/papers/link-rot',
        redirects: ['https://example.com/papers/link-rot'],
      });
      expect(classify(result, 'http://example.com/papers/link-rot').verdict).toBe('alive');
    });

    test('adding www. is fine', () => {
      const result = fetched({
        status: 200,
        finalUrl: 'https://www.example.com/papers/link-rot',
        redirects: ['https://www.example.com/papers/link-rot'],
      });
      expect(classify(result, URL_).verdict).toBe('alive');
    });
  });

  describe('dead', () => {
    test.each([
      [404, /not found/i],
      [410, /permanently removed/i],
      [502, /server error/i],
      [400, /rejected/i],
    ])('%i', (status, reason) => {
      const c = classify(fetched({ status }), URL_);
      expect(c.verdict).toBe('dead');
      expect(c.reason).toMatch(reason);
    });

    test.each([
      ['DNS_NOT_FOUND', /domain no longer exists/i],
      ['CONNECTION_REFUSED', /refused/i],
      ['TIMEOUT', /did not respond/i],
      ['TLS_ERROR', /certificate/i],
      ['CONNECTION_RESET', /dropping/i],
    ] as const)('%s', (error, reason) => {
      const c = classify(fetched({ error }), URL_);
      expect(c.verdict).toBe('dead');
      expect(c.reason).toMatch(reason);
    });
  });

  describe('suspicious (zombie candidates)', () => {
    test('redirect to a different domain', () => {
      const c = classify(
        fetched({
          status: 200,
          finalUrl: 'https://casino.example.net/',
          redirects: ['https://casino.example.net/'],
        }),
        URL_
      );
      expect(c.verdict).toBe('suspicious');
      expect(c.reason).toContain('casino.example.net');
    });

    test('deep link redirected to the homepage (soft 404)', () => {
      const c = classify(
        fetched({ status: 200, finalUrl: 'https://example.com/', redirects: ['https://example.com/'] }),
        URL_
      );
      expect(c.verdict).toBe('suspicious');
      expect(c.reason).toMatch(/homepage/);
    });

    test('a link to the homepage that stays on the homepage is fine', () => {
      const c = classify(
        fetched({ status: 200, finalUrl: 'https://example.com/', redirects: ['https://example.com/'] }),
        'http://example.com/'
      );
      expect(c.verdict).toBe('alive');
    });

    test.each(['/login', '/signin?next=/papers', '/account/login', '/sso/'])(
      'redirect to a login page (%s)',
      (path) => {
        const finalUrl = `https://example.com${path}`;
        const c = classify(fetched({ status: 200, finalUrl, redirects: [finalUrl] }), URL_);
        expect(c.verdict).toBe('suspicious');
        expect(c.reason).toMatch(/login/i);
      }
    );

    test('more than 2 redirects on the same site', () => {
      const c = classify(
        fetched({
          status: 200,
          finalUrl: 'https://example.com/c',
          redirects: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
        }),
        URL_
      );
      expect(c.verdict).toBe('suspicious');
      expect(c.reason).toMatch(/3 redirects/);
    });

    test('redirect loop', () => {
      expect(classify(fetched({ error: 'TOO_MANY_REDIRECTS' }), URL_).verdict).toBe('suspicious');
    });

    test.each([401, 403])('%i', (status) => {
      expect(classify(fetched({ status }), URL_).verdict).toBe('suspicious');
    });
  });

  describe('unchecked', () => {
    test.each([
      [{ error: 'BLOCKED_ADDRESS' as const }, /private or internal/],
      [{ error: 'INVALID_URL' as const }, /not a valid/],
      [{ status: 429 }, /rate-limited/],
    ])('%o', (overrides, reason) => {
      const c = classify(fetched(overrides), URL_);
      expect(c.verdict).toBe('unchecked');
      expect(c.reason).toMatch(reason);
    });
  });
});

describe('sameSite', () => {
  test.each([
    ['example.com', 'example.com', true],
    ['example.com', 'www.example.com', true],
    ['blog.example.com', 'example.com', true],
    ['EXAMPLE.com', 'example.COM.', true],
    ['example.com', 'example.net', false],
    ['example.com', 'notexample.com', false],
    ['example.com', 'example.com.evil.net', false],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(sameSite(a, b)).toBe(expected);
  });
});
