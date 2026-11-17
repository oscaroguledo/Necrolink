// @vitest-environment node
/**
 * Unit tests for the Wayback Machine client, rate limiter and cache.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  findArchivedSnapshot,
  findClosestSnapshot,
  parseCdxRows,
  parseWaybackTimestamp,
  toWaybackTimestamp,
  WaybackError,
  isArchiveBlocked,
  resetArchiveBreaker,
  type CdxSnapshot,
} from '@/lib/wayback/cdx';
import { RateLimiter, TokenBucketLimiter } from '@/lib/wayback/rate-limiter';
import { TtlCache } from '@/lib/wayback/cache';
import type { ArchivedSnapshot } from '@/types/link';

const HEADER = ['timestamp', 'original', 'statuscode', 'mimetype'];
const snap = (timestamp: string, statusCode = '200'): CdxSnapshot => ({
  timestamp,
  original: 'http://example.com/page',
  statusCode,
  mimeType: 'text/html',
});

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function mockFetch(body: unknown, status = 200) {
  return vi.fn<FetchArgs, Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status })
  );
}
const deps = (fetchImpl: unknown) => ({
  fetch: fetchImpl as unknown as typeof fetch,
  limiter: new RateLimiter(0),
  cache: new TtlCache<ArchivedSnapshot | null>(),
});

describe('timestamps', () => {
  test('parse and format round-trip', () => {
    const date = new Date('2023-06-15T12:34:56Z');
    expect(toWaybackTimestamp(date)).toBe('20230615123456');
    expect(parseWaybackTimestamp('20230615123456')).toBe(date.getTime());
  });

  test('short timestamps default to midnight', () => {
    expect(parseWaybackTimestamp('20230615')).toBe(Date.UTC(2023, 5, 15));
  });

  test('garbage is NaN', () => {
    expect(parseWaybackTimestamp('not-a-time')).toBeNaN();
  });
});

describe('findClosestSnapshot', () => {
  test('picks the capture closest in real time, not by integer difference', () => {
    // As integers, 20221231235959 is 8,869,764,041 from the target and
    // 20230101100000 only 100,000, so integer subtraction picks the latter.
    // In real time they are 1 second and 10 hours away.
    const target = new Date('2023-01-01T00:00:00Z');
    const result = findClosestSnapshot(
      [snap('20230101100000'), snap('20221231235959')],
      target
    );
    expect(result?.timestamp).toBe('20221231235959');
  });

  test('without a date, returns the newest capture regardless of order', () => {
    const result = findClosestSnapshot([snap('20200101000000'), snap('20240101000000'), snap('20220101000000')]);
    expect(result?.timestamp).toBe('20240101000000');
  });

  test('ignores non-200 captures', () => {
    const result = findClosestSnapshot(
      [snap('20230615000000', '404'), snap('20100101000000')],
      new Date('2023-06-15T00:00:00Z')
    );
    expect(result?.timestamp).toBe('20100101000000');
  });

  test('null when nothing usable', () => {
    expect(findClosestSnapshot([])).toBeNull();
    expect(findClosestSnapshot([snap('20230101000000', '302')])).toBeNull();
  });
});

describe('parseCdxRows', () => {
  test('maps columns by header name', () => {
    const rows = [
      ['original', 'timestamp', 'mimetype', 'statuscode'],
      ['http://x/', '20230101000000', 'text/html', '200'],
    ];
    expect(parseCdxRows(rows)).toEqual([
      { timestamp: '20230101000000', original: 'http://x/', statusCode: '200', mimeType: 'text/html' },
    ]);
  });

  test.each([[[]], [null], ['oops'], [[HEADER]], [[HEADER, 'bad row', [42]]]])(
    'handles empty or malformed input %#',
    (rows) => {
      expect(parseCdxRows(rows)).toEqual([]);
    }
  );
});

describe('findArchivedSnapshot', () => {
  test('asks for captures closest to the citation date and builds the archive URL', async () => {
    const fetchImpl = mockFetch([HEADER, ['20230614225804', 'http://user:pass@example.com/page', '200', 'text/html']]);
    const result = await findArchivedSnapshot(
      'https://example.com/page',
      new Date('2023-06-15T00:00:00Z'),
      deps(fetchImpl)
    );

    const requested = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(requested.searchParams.get('sort')).toBe('closest');
    expect(requested.searchParams.get('closest')).toBe('20230615000000');
    expect(requested.searchParams.get('filter')).toBe('statuscode:200');

    expect(result).toMatchObject({
      // Built from the URL we checked, not the odd "original" field
      url: 'https://web.archive.org/web/20230614225804/https://example.com/page',
      timestamp: '2023-06-14T22:58:04.000Z',
      originalTimestamp: '20230614225804',
      statusCode: '200',
    });
  });

  test('without a date asks for the newest captures (limit=-5)', async () => {
    const fetchImpl = mockFetch([HEADER, ['20240101000000', 'http://x/', '200', 'text/html']]);
    await findArchivedSnapshot('https://example.com/page', undefined, deps(fetchImpl));

    const requested = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(requested.searchParams.get('limit')).toBe('-5');
    expect(requested.searchParams.has('sort')).toBe(false);
  });

  test('never-archived URL → null', async () => {
    const result = await findArchivedSnapshot('https://never.example.com/', undefined, deps(mockFetch([])));
    expect(result).toBeNull();
  });

  test('caches hits and misses', async () => {
    const fetchImpl = mockFetch([]);
    const d = deps(fetchImpl);
    await findArchivedSnapshot('https://never.example.com/', undefined, d);
    await findArchivedSnapshot('https://never.example.com/', undefined, d);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(d.cache.hits).toBe(1);
  });

  test('a different citation day is a different cache entry', async () => {
    const fetchImpl = mockFetch([]);
    const d = deps(fetchImpl);
    await findArchivedSnapshot('https://x.example.com/', new Date('2020-01-01T00:00:00Z'), d);
    await findArchivedSnapshot('https://x.example.com/', new Date('2021-01-01T00:00:00Z'), d);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('throws WaybackError on an error status', async () => {
    await expect(
      findArchivedSnapshot('https://x.example.com/', undefined, deps(mockFetch('busy', 503)))
    ).rejects.toThrow(WaybackError);
  });

  test('throws WaybackError when the network fails', async () => {
    const failing = vi.fn<FetchArgs, Promise<Response>>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(findArchivedSnapshot('https://x.example.com/', undefined, deps(failing))).rejects.toThrow(
      /could not be reached/
    );
  });

  test('errors are not cached', async () => {
    const d = deps(mockFetch('busy', 503));
    await findArchivedSnapshot('https://x.example.com/', undefined, d).catch(() => undefined);
    expect(d.cache.size).toBe(0);
  });
});

describe('RateLimiter', () => {
  test('10 concurrent callers are spaced 200 ms apart', async () => {
    let clock = 1000;
    const fired: number[] = [];
    const limiter = new RateLimiter(
      200,
      () => clock,
      async (ms) => {
        fired.push(clock + ms);
      }
    );
    await Promise.all(Array.from({ length: 10 }, () => limiter.waitForSlot()));
    // First caller goes immediately (no sleep), the other 9 wait 200, 400, ... 1800
    expect(fired).toEqual([1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800]);
    clock = 5000;
    fired.length = 0;
    await limiter.waitForSlot();
    expect(fired).toEqual([]); // idle long enough: no wait
  });
});

describe('TtlCache', () => {
  test('expires entries after their TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(10, () => now);
    cache.set('a', 'x', 100);
    expect(cache.get('a')).toBe('x');
    now = 100;
    expect(cache.get('a')).toBeUndefined();
  });

  test('stores null (cached miss) distinctly from absent', () => {
    const cache = new TtlCache<string | null>();
    cache.set('miss', null, 1000);
    expect(cache.get('miss')).toBeNull();
    expect(cache.get('absent')).toBeUndefined();
  });

  test('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>(2);
    cache.set('a', 1, 1000);
    cache.set('b', 2, 1000);
    cache.get('a'); // a is now most recent
    cache.set('c', 3, 1000);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});

describe('TokenBucketLimiter', () => {
  test('allows a burst, then spaces requests evenly', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new TokenBucketLimiter(15, 3, () => clock, async (ms) => {
      waits.push(ms);
    });
    await Promise.all(Array.from({ length: 5 }, () => limiter.waitForSlot()));
    // 3 immediately, then one every 4 s (15/min)
    expect(waits).toEqual([4000, 8000]);
  });

  test('rejects nonsense settings', () => {
    expect(() => new TokenBucketLimiter(0)).toThrow(RangeError);
  });
});

describe('Internet Archive circuit breaker', () => {
  afterEach(() => resetArchiveBreaker());

  test('a 429 trips the breaker; later lookups fail fast without a request', async () => {
    const throttled = deps(mockFetch('slow down', 429));
    await expect(findArchivedSnapshot('https://a.example.com/', undefined, throttled)).rejects.toThrow(/limiting requests/);
    expect(isArchiveBlocked()).toBe(true);

    const fetchImpl = mockFetch([]);
    await expect(findArchivedSnapshot('https://b.example.com/', undefined, deps(fetchImpl))).rejects.toThrow(/limiting requests/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a refused connection trips the breaker', async () => {
    const refused = vi.fn<FetchArgs, Promise<Response>>(async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
    });
    await expect(findArchivedSnapshot('https://a.example.com/', undefined, deps(refused))).rejects.toThrow(/limiting requests/);
    expect(isArchiveBlocked()).toBe(true);
  });

  test('other failures do not trip it', async () => {
    await findArchivedSnapshot('https://a.example.com/', undefined, deps(mockFetch('oops', 503))).catch(() => undefined);
    expect(isArchiveBlocked()).toBe(false);
  });
});

