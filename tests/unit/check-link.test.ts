// @vitest-environment node
/**
 * Tests for checkLink(): fetch → classify → archive lookup → status.
 */

import { describe, test, expect, vi } from 'vitest';
import { checkLink, type CheckDeps } from '@/lib/checker/check-link';
import type { FetchResult } from '@/lib/checker/safe-fetch';
import { WaybackError } from '@/lib/wayback/cdx';
import { TtlCache } from '@/lib/wayback/cache';
import type { ArchivedSnapshot } from '@/types/link';

const URL_ = 'https://example.com/paper';
const NOW = new Date('2026-11-16T12:00:00Z');
const SNAPSHOT: ArchivedSnapshot = {
  url: `https://web.archive.org/web/20230615000000/${URL_}`,
  timestamp: '2023-06-15T00:00:00.000Z',
  originalTimestamp: '20230615000000',
  statusCode: '200',
  mimeType: 'text/html',
};

function setup(fetchResult: Partial<FetchResult>, snapshot: ArchivedSnapshot | null | Error = SNAPSHOT) {
  const fetchStatus = vi.fn(async () => ({
    finalUrl: URL_,
    redirects: [],
    method: 'HEAD' as const,
    attempts: 1,
    ...fetchResult,
  }));
  const findSnapshot = vi.fn(async () => {
    if (snapshot instanceof Error) throw snapshot;
    return snapshot;
  });
  const deps: CheckDeps = {
    fetchStatus,
    findSnapshot,
    healthCache: new TtlCache(),
    detectZombie: null, // content comparison is tested separately below
    now: () => NOW,
  };
  return { deps, fetchStatus, findSnapshot };
}

const link = { id: 'link_1', url: URL_, citationDate: new Date('2023-06-15T00:00:00Z') };

describe('checkLink', () => {
  test('living: page loads, no archive lookup', async () => {
    const { deps, findSnapshot } = setup({ status: 200 });
    const result = await checkLink(link, deps);

    expect(result).toEqual({
      linkId: 'link_1',
      url: URL_,
      status: 'living',
      reason: 'The page loads',
      httpStatus: 200,
      checkedAt: NOW,
    });
    expect(findSnapshot).not.toHaveBeenCalled();
  });

  test('ghost: dead with an archived copy near the citation date', async () => {
    const { deps, findSnapshot } = setup({ status: 404, method: 'GET' });
    const result = await checkLink(link, deps);

    expect(result).toMatchObject({ status: 'ghost', httpStatus: 404, archived: SNAPSHOT });
    expect(result.reason).toMatch(/not found/i);
    expect(findSnapshot).toHaveBeenCalledWith(URL_, link.citationDate);
  });

  test('lost soul: dead and never archived', async () => {
    const { deps } = setup({ error: 'DNS_NOT_FOUND' }, null);
    const result = await checkLink(link, deps);

    expect(result.status).toBe('lost');
    expect(result.reason).toMatch(/domain no longer exists.*no copy/i);
    expect(result).not.toHaveProperty('archived');
  });

  test('dead but the Wayback Machine is down → error, not a false lost soul', async () => {
    const { deps } = setup({ status: 410 }, new WaybackError('The Internet Archive returned 503'));
    const result = await checkLink(link, deps);

    expect(result.status).toBe('error');
    expect(result.error).toBe('WAYBACK_UNAVAILABLE');
    expect(result.reason).toMatch(/permanently removed.*503.*try again in a few minutes/i);
  });

  test('zombie: suspicious redirect, with an archived copy for comparison', async () => {
    const { deps } = setup({
      status: 200,
      finalUrl: 'https://parked.example.net/',
      redirects: ['https://parked.example.net/'],
    });
    const result = await checkLink(link, deps);

    expect(result).toMatchObject({
      status: 'zombie',
      suspicious: true,
      finalUrl: 'https://parked.example.net/',
      archived: SNAPSHOT,
    });
  });

  test('zombie stays a zombie when the archive lookup fails', async () => {
    const { deps } = setup({ status: 403 }, new WaybackError('down'));
    const result = await checkLink(link, deps);

    expect(result.status).toBe('zombie');
    expect(result).not.toHaveProperty('archived');
  });

  test('unchecked (blocked address) → error with the reason', async () => {
    const { deps, findSnapshot } = setup({ error: 'BLOCKED_ADDRESS' });
    const result = await checkLink({ id: 'x', url: 'http://10.0.0.1/' }, deps);

    expect(result).toMatchObject({ status: 'error', error: 'BLOCKED_ADDRESS' });
    expect(result.reason).toMatch(/private or internal/);
    expect(findSnapshot).not.toHaveBeenCalled();
  });

  test('caches health by URL', async () => {
    const { deps, fetchStatus } = setup({ status: 200 });
    await checkLink(link, deps);
    await checkLink({ ...link, id: 'link_2' }, deps);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  test('does not cache results that could not be checked', async () => {
    const { deps, fetchStatus } = setup({ status: 429 });
    await checkLink(link, deps);
    await checkLink(link, deps);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  test('never throws: unexpected failures become status error', async () => {
    const deps: CheckDeps = {
      fetchStatus: async () => {
        throw new Error('boom');
      },
      healthCache: new TtlCache(),
      now: () => NOW,
    };
    const result = await checkLink(link, deps);
    expect(result).toMatchObject({ status: 'error', error: 'boom' });
  });

  describe('with content comparison (spec 03)', () => {
    const redirected = {
      status: 200,
      finalUrl: 'https://new-home.example.org/paper',
      redirects: ['https://new-home.example.org/paper'],
    };
    const report = (isZombie: boolean, method: 'heuristic' | 'ai' | 'unverified' = 'heuristic') => ({
      isZombie,
      confidence: 0.9,
      method,
      reason: isZombie ? 'The page now shows completely different content' : 'The link redirects, but the same content is still there',
      changes: { titleChanged: isZombie, contentDrift: isZombie ? ('complete' as const) : ('none' as const), possibleTakeover: false },
    });

    test('confirmed zombie: not tentative, report attached', async () => {
      const { deps } = setup(redirected);
      const detect = vi.fn(async () => report(true));
      const result = await checkLink(link, { ...deps, detectZombie: detect });

      expect(result).toMatchObject({ status: 'zombie', suspicious: false, reason: 'The page now shows completely different content' });
      expect(result.zombie?.isZombie).toBe(true);
      expect(detect).toHaveBeenCalledWith(
        expect.objectContaining({ url: URL_, finalUrl: 'https://new-home.example.org/paper', archived: SNAPSHOT }),
        undefined
      );
    });

    test('same content at a new address → living, with the report', async () => {
      const { deps } = setup(redirected);
      const result = await checkLink(link, { ...deps, detectZombie: async () => report(false) });

      expect(result).toMatchObject({ status: 'living', finalUrl: 'https://new-home.example.org/paper' });
      expect(result.reason).toMatch(/same content/);
      expect(result.zombie?.isZombie).toBe(false);
    });

    test('could not compare → tentative zombie', async () => {
      const { deps } = setup(redirected);
      const result = await checkLink(link, { ...deps, detectZombie: async () => report(true, 'unverified') });
      expect(result).toMatchObject({ status: 'zombie', suspicious: true });
    });

    test('detector failure → tentative zombie with the classification reason', async () => {
      const { deps } = setup(redirected);
      const result = await checkLink(link, {
        ...deps,
        detectZombie: async () => {
          throw new Error('boom');
        },
      });
      expect(result).toMatchObject({ status: 'zombie', suspicious: true });
      expect(result.reason).toMatch(/different site/);
    });
  });
});
