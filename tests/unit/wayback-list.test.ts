// @vitest-environment node
/**
 * listSnapshots: snapshot listings for the MCP server's list_snapshots tool.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  listSnapshots,
  isArchiveBlocked,
  resetArchiveBreaker,
  WaybackError,
  MAX_LISTED_SNAPSHOTS,
  type SnapshotListing,
} from '@/lib/wayback/cdx';
import { RateLimiter } from '@/lib/wayback/rate-limiter';
import { TtlCache } from '@/lib/wayback/cache';

const HEADER = ['timestamp', 'original', 'statuscode', 'mimetype'];
const URL_ = 'https://example.com/page';

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status })
  );
  const deps = {
    fetch: fetchMock as unknown as typeof fetch,
    limiter: new RateLimiter(0),
    cache: new TtlCache<SnapshotListing[]>(),
  };
  const query = (call = 0) => new URL(String(fetchMock.mock.calls[call]![0])).searchParams;
  return { fetchMock, deps, query };
}

afterEach(() => resetArchiveBreaker());

describe('listSnapshots', () => {
  test('asks for the newest distinct captures and returns them oldest first', async () => {
    const { deps, query } = setup([
      HEADER,
      ['20100101000000', URL_, '200', 'text/html'],
      ['20150601120000', URL_, '404', 'text/html'],
    ]);

    const list = await listSnapshots(URL_, { limit: 2 }, deps);

    expect(query().get('collapse')).toBe('digest');
    expect(query().get('limit')).toBe('-2');
    expect(query().has('from')).toBe(false);
    expect(list).toEqual([
      {
        timestamp: '2010-01-01T00:00:00.000Z',
        archiveUrl: `https://web.archive.org/web/20100101000000/${URL_}`,
        statusCode: '200',
        mimeType: 'text/html',
      },
      {
        timestamp: '2015-06-01T12:00:00.000Z',
        archiveUrl: `https://web.archive.org/web/20150601120000/${URL_}`,
        statusCode: '404',
        mimeType: 'text/html',
      },
    ]);
  });

  test('passes the date range as Wayback timestamps', async () => {
    const { deps, query } = setup([HEADER]);
    await listSnapshots(
      URL_,
      { from: new Date('2005-03-04T00:00:00Z'), to: new Date('2006-01-02T23:59:59Z') },
      deps
    );
    expect(query().get('from')).toBe('20050304000000');
    expect(query().get('to')).toBe('20060102235959');
  });

  test.each([
    [undefined, '-20'],
    [0, '-1'],
    [10_000, `-${MAX_LISTED_SNAPSHOTS}`],
    [3.7, '-3'],
  ])('limit %s is clamped to %s', async (limit, expected) => {
    const { deps, query } = setup([HEADER]);
    await listSnapshots(URL_, limit === undefined ? {} : { limit }, deps);
    expect(query().get('limit')).toBe(expected);
  });

  test('never archived → empty list; malformed rows are skipped', async () => {
    expect(await listSnapshots(URL_, {}, setup([]).deps)).toEqual([]);
    const { deps } = setup([HEADER, ['garbage', URL_, '200', 'text/html'], 'not a row']);
    expect(await listSnapshots(URL_, {}, deps)).toEqual([]);
  });

  test('results are cached per query', async () => {
    const { fetchMock, deps } = setup([HEADER, ['20100101000000', URL_, '200', 'text/html']]);
    await listSnapshots(URL_, { limit: 5 }, deps);
    await listSnapshots(URL_, { limit: 5 }, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await listSnapshots(URL_, { limit: 6 }, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('429 trips the shared circuit breaker', async () => {
    const { deps } = setup('slow down', 429);
    await expect(listSnapshots(URL_, {}, deps)).rejects.toThrow(/limiting requests/);
    expect(isArchiveBlocked()).toBe(true);

    // Further lookups do not contact the Archive at all
    const next = setup([HEADER]);
    await expect(listSnapshots(URL_, {}, next.deps)).rejects.toBeInstanceOf(WaybackError);
    expect(next.fetchMock).not.toHaveBeenCalled();
  });

  test('server errors become a WaybackError', async () => {
    const { deps } = setup('oops', 503);
    await expect(listSnapshots(URL_, {}, deps)).rejects.toThrow('The Internet Archive returned 503');
  });
});
