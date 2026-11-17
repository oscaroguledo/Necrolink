/**
 * Wayback Machine CDX client: find the archived copy of a URL closest to the
 * date it was cited (spec 02, phase 3).
 *
 * Verified against the live API (Nov 2026):
 * - results are OLDEST first by default (not newest, as the spec assumed);
 *   `limit=-N` returns the newest N
 * - `sort=closest&closest=<timestamp>` returns captures nearest a date
 * - a URL that was never archived returns `[]`
 */

import type { ArchivedSnapshot } from '@/types/link';
import { RateLimiter } from './rate-limiter';
import { TtlCache, CACHE_TTL_MS } from './cache';
import { USER_AGENT } from '@/lib/checker/safe-fetch';

const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';

export interface CdxSnapshot {
  timestamp: string; // YYYYMMDDhhmmss (UTC)
  original: string;
  statusCode: string;
  mimeType: string;
}

/** The Wayback Machine could not be reached or answered with an error. */
export class WaybackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaybackError';
  }
}

export interface WaybackDeps {
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  cache?: TtlCache<ArchivedSnapshot | null>;
  timeoutMs?: number;
}

// Shared across requests in this server process: every request to
// web.archive.org (CDX lookups and archived page downloads) goes through it
export const sharedLimiter = new RateLimiter(200);
const sharedCache = new TtlCache<ArchivedSnapshot | null>(5000);

/** Wayback timestamp (YYYYMMDDhhmmss, UTC) → epoch milliseconds, or NaN. */
export function parseWaybackTimestamp(ts: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(ts);
  if (!m) return NaN;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

/** Date → Wayback timestamp (YYYYMMDDhhmmss, UTC). */
export function toWaybackTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Pick the snapshot to resurrect from: the 200-status capture closest in time
 * to `citationDate`, or the newest one when there is no date.
 *
 * Compares real times. The spec's sketch subtracted timestamps as integers:
 * for a target of 20230101000000, a capture 1 second earlier (20221231235959)
 * is 8,869,764,041 away but one 10 hours later (20230101100000) is only
 * 100,000 away, so it picked the capture 10 hours off.
 */
export function findClosestSnapshot(
  snapshots: CdxSnapshot[],
  citationDate?: Date
): CdxSnapshot | null {
  const usable = snapshots.filter(
    (s) => s.statusCode === '200' && !Number.isNaN(parseWaybackTimestamp(s.timestamp))
  );
  if (usable.length === 0) return null;

  if (!citationDate) {
    return usable.reduce((newest, s) =>
      parseWaybackTimestamp(s.timestamp) > parseWaybackTimestamp(newest.timestamp) ? s : newest
    );
  }

  const target = citationDate.getTime();
  return usable.reduce((best, s) => {
    const diff = Math.abs(parseWaybackTimestamp(s.timestamp) - target);
    const bestDiff = Math.abs(parseWaybackTimestamp(best.timestamp) - target);
    return diff < bestDiff ? s : best;
  });
}

/**
 * Find the best archived copy of `url`, or `null` if it was never archived
 * with a 200 status. Results (including misses) are cached for 24 hours.
 *
 * @throws WaybackError when the Wayback Machine is unreachable or errors
 */
export async function findArchivedSnapshot(
  url: string,
  citationDate?: Date,
  deps: WaybackDeps = {}
): Promise<ArchivedSnapshot | null> {
  const doFetch = deps.fetch ?? fetch;
  const limiter = deps.limiter ?? sharedLimiter;
  const cache = deps.cache ?? sharedCache;
  const timeoutMs = deps.timeoutMs ?? 15_000;

  // Day precision is plenty for picking a snapshot and keeps the cache useful
  const day = citationDate ? toWaybackTimestamp(citationDate).slice(0, 8) : 'latest';
  const cacheKey = `cdx:${url}:${day}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const query = new URLSearchParams({
    url,
    output: 'json',
    fl: 'timestamp,original,statuscode,mimetype',
    filter: 'statuscode:200',
  });
  if (citationDate) {
    query.set('sort', 'closest');
    query.set('closest', toWaybackTimestamp(citationDate));
    query.set('limit', '5');
  } else {
    query.set('limit', '-5'); // newest 5
  }

  await limiter.waitForSlot();
  let rows: unknown;
  try {
    const response = await doFetch(`${CDX_ENDPOINT}?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new WaybackError(`The Internet Archive returned ${response.status}`);
    }
    rows = await response.json();
  } catch (error) {
    if (error instanceof WaybackError) throw error;
    throw new WaybackError('The Internet Archive could not be reached');
  }

  const snapshot = findClosestSnapshot(parseCdxRows(rows), citationDate);
  const result: ArchivedSnapshot | null = snapshot
    ? {
        url: `https://web.archive.org/web/${snapshot.timestamp}/${url}`,
        timestamp: new Date(parseWaybackTimestamp(snapshot.timestamp)).toISOString(),
        originalTimestamp: snapshot.timestamp,
        statusCode: snapshot.statusCode,
        mimeType: snapshot.mimeType,
        ...(citationDate ? { closestToDate: citationDate } : {}),
      }
    : null;

  cache.set(cacheKey, result, CACHE_TTL_MS.cdx);
  return result;
}

/** CDX JSON (header row + data rows) → snapshots. Ignores malformed rows. */
export function parseCdxRows(rows: unknown): CdxSnapshot[] {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const [header, ...data] = rows as unknown[][];
  if (!Array.isArray(header)) return [];
  const col = (name: string) => header.indexOf(name);
  const [t, o, s, m] = ['timestamp', 'original', 'statuscode', 'mimetype'].map(col);
  if (t === undefined || t < 0) return [];

  return data
    .filter((row): row is string[] => Array.isArray(row) && typeof row[t] === 'string')
    .map((row) => ({
      timestamp: row[t]!,
      original: (o !== undefined && o >= 0 ? row[o] : '') ?? '',
      statusCode: (s !== undefined && s >= 0 ? row[s] : '') ?? '',
      mimeType: (m !== undefined && m >= 0 ? row[m] : '') ?? '',
    }));
}
