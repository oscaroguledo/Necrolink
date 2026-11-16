// @vitest-environment node
/**
 * Integration tests for POST /api/check (Server-Sent Events), with a fake
 * network injected through createCheckHandler().
 */

import { describe, test, expect, vi } from 'vitest';
import { createCheckHandler } from '@/lib/checker/check-handler';
import type { CheckDeps } from '@/lib/checker/check-link';
import type { FetchResult } from '@/lib/checker/safe-fetch';
import { TtlCache } from '@/lib/wayback/cache';
import type { ArchivedSnapshot } from '@/types/link';

/** Fake web: the URL path decides the outcome. */
function fakeDeps(delayMs = 0) {
  let active = 0;
  let peak = 0;
  const fetchStatus = vi.fn(async (url: string, opts: { signal?: AbortSignal }): Promise<FetchResult> => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, delayMs));
    active--;
    if (opts.signal?.aborted) return { finalUrl: url, redirects: [], method: 'HEAD', attempts: 1, error: 'TIMEOUT' };
    const path = new URL(url).pathname;
    const status = path.startsWith('/dead') || path.startsWith('/lost') ? 404 : 200;
    if (path.startsWith('/moved')) {
      return { status: 200, finalUrl: 'https://casino.example.net/', redirects: ['https://casino.example.net/'], method: 'HEAD', attempts: 1 };
    }
    return { status, finalUrl: url, redirects: [], method: status === 404 ? 'GET' : 'HEAD', attempts: 1 };
  });
  const findSnapshot = vi.fn(async (url: string): Promise<ArchivedSnapshot | null> =>
    new URL(url).pathname.startsWith('/lost')
      ? null
      : {
          url: `https://web.archive.org/web/20230101000000/${url}`,
          timestamp: '2023-01-01T00:00:00.000Z',
          originalTimestamp: '20230101000000',
          statusCode: '200',
          mimeType: 'text/html',
        }
  );
  const deps: CheckDeps = { fetchStatus, findSnapshot, healthCache: new TtlCache() };
  return { deps, fetchStatus, findSnapshot, peak: () => peak };
}

function post(body: unknown, init: RequestInit = {}) {
  return new Request('http://localhost/api/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

async function readEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? 'message';
      const data = JSON.parse(/^data: (.+)$/m.exec(block)![1]!);
      return { event, data };
    });
}

describe('POST /api/check', () => {
  test('streams one result per link, then a done summary', async () => {
    const { deps } = fakeDeps();
    const response = await createCheckHandler(deps)(
      post({
        links: [
          { id: 'a', url: 'https://example.com/alive' },
          { id: 'b', url: 'https://example.com/dead', citationDate: '2023-01-15T00:00:00Z' },
          { id: 'c', url: 'https://example.com/lost' },
          { id: 'd', url: 'https://example.com/moved' },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);

    const events = await readEvents(response);
    const results = events.filter((e) => e.event === 'message').map((e) => e.data);
    const byId = Object.fromEntries(results.map((r) => [r.linkId, r]));

    expect(results).toHaveLength(4);
    expect(byId.a).toMatchObject({ status: 'living' });
    expect(byId.b).toMatchObject({ status: 'ghost', archived: { originalTimestamp: '20230101000000' } });
    expect(byId.c).toMatchObject({ status: 'lost' });
    expect(byId.d).toMatchObject({ status: 'zombie', suspicious: true, finalUrl: 'https://casino.example.net/' });
    expect(typeof byId.a!.checkedAt).toBe('string');

    const done = events.at(-1)!;
    expect(done.event).toBe('done');
    expect(done.data).toMatchObject({ total: 4, living: 1, ghost: 1, lost: 1, zombie: 1, error: 0 });
  });

  test('passes the citation date to the archive lookup', async () => {
    const { deps, findSnapshot } = fakeDeps();
    await readEvents(
      await createCheckHandler(deps)(
        post({ links: [{ id: 'b', url: 'https://example.com/dead', citationDate: '2023-01-15T00:00:00Z' }] })
      )
    );
    expect(findSnapshot).toHaveBeenCalledWith('https://example.com/dead', new Date('2023-01-15T00:00:00Z'));
  });

  test('checks a repeated URL once but reports it for every link id', async () => {
    const { deps, fetchStatus } = fakeDeps();
    const events = await readEvents(
      await createCheckHandler(deps)(
        post({
          links: [
            { id: 'first', url: 'https://example.com/dup' },
            { id: 'second', url: 'https://example.com/dup' },
          ],
        })
      )
    );
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.event === 'message').map((e) => e.data.linkId).sort()).toEqual([
      'first',
      'second',
    ]);
  });

  test('runs at most 10 checks at once', async () => {
    const { deps, peak } = fakeDeps(5);
    const links = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, url: `https://example.com/p${i}` }));
    const events = await readEvents(await createCheckHandler(deps)(post({ links })));

    expect(events.filter((e) => e.event === 'message')).toHaveLength(40);
    expect(peak()).toBeLessThanOrEqual(10);
    expect(peak()).toBeGreaterThan(1);
  });

  test('stops starting checks when the client disconnects', async () => {
    const { deps, fetchStatus } = fakeDeps(20);
    const links = Array.from({ length: 100 }, (_, i) => ({ id: `l${i}`, url: `https://example.com/p${i}` }));
    const response = await createCheckHandler(deps)(post({ links }));

    const reader = response.body!.getReader();
    await reader.read(); // first result arrives
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchStatus.mock.calls.length).toBeLessThan(100);
  });

  describe('validation', () => {
    test.each([
      ['not JSON', 'nope', /valid JSON/],
      ['no links array', { foo: 1 }, /"links"/],
      ['empty links', { links: [] }, /empty/],
      ['non-http URL', { links: [{ id: 'a', url: 'ftp://x' }] }, /http\(s\) URL/],
      ['missing id', { links: [{ url: 'https://x.example.com' }] }, /id must be/],
      ['duplicate id', { links: [{ id: 'a', url: 'https://x.example.com' }, { id: 'a', url: 'https://y.example.com' }] }, /duplicated/],
      ['bad date', { links: [{ id: 'a', url: 'https://x.example.com', citationDate: 'yesterday' }] }, /ISO date/],
      ['too long URL', { links: [{ id: 'a', url: `https://x.example.com/${'a'.repeat(2100)}` }] }, /2048/],
      ['too many links', { links: Array.from({ length: 501 }, (_, i) => ({ id: `${i}`, url: 'https://x.example.com' })) }, /At most 500/],
    ])('400 for %s', async (_label, body, message) => {
      const response = await createCheckHandler(fakeDeps().deps)(post(body));
      const json = await response.json();
      expect(response.status).toBe(400);
      expect(json).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
      expect(json.error.message).toMatch(message);
    });

    test('413 when the body is over 1 MB', async () => {
      const response = await createCheckHandler(fakeDeps().deps)(
        post('{}', { headers: { 'content-type': 'application/json', 'content-length': String(2 * 1024 * 1024) } })
      );
      expect(response.status).toBe(413);
    });
  });
});
