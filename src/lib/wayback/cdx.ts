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
import { TokenBucketLimiter, type SlotLimiter } from './rate-limiter';
import { TtlCache, CACHE_TTL_MS } from './cache';
import { USER_AGENT } from '@/lib/checker/safe-fetch';
import { log } from '@/lib/logger';

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
  limiter?: SlotLimiter;
  cache?: TtlCache<ArchivedSnapshot | null>;
  timeoutMs?: number;
}

/**
 * Requests per minute to web.archive.org (CDX lookups and archived page
 * downloads together). The Internet Archive refuses connections for several
 * minutes when a client goes much faster: we hit this at 5 req/s (the
 * spec's figure), and again with bursts of ~8 requests, while testing. Tool
 * authors report about 15/min. Override with WAYBACK_MAX_PER_MINUTE and
 * WAYBACK_BURST.
 */
export const WAYBACK_MAX_PER_MINUTE = Math.max(1, Number(process.env.WAYBACK_MAX_PER_MINUTE) || 12);
/** Requests allowed back to back before pacing starts (blocked at ~8 in testing). */
export const WAYBACK_BURST = Math.max(1, Number(process.env.WAYBACK_BURST) || 5);

// Shared across requests in this server process: every request to
// web.archive.org goes through it. A small burst keeps short documents fast.
export const sharedLimiter: SlotLimiter = new TokenBucketLimiter(WAYBACK_MAX_PER_MINUTE, WAYBACK_BURST);

/**
 * Circuit breaker: after the Archive refuses a connection or answers 429, stop
 * contacting it for a while instead of extending the block.
 */
const BLOCK_MS = 5 * 60_000;
let archiveBlockedUntil = 0;

export function isArchiveBlocked(now: number = Date.now()): boolean {
  return now < archiveBlockedUntil;
}

export function reportArchiveThrottled(now: number = Date.now()): void {
  if (now >= archiveBlockedUntil) log.warn('wayback.blocked', { minutes: BLOCK_MS / 60_000 });
  archiveBlockedUntil = now + BLOCK_MS;
}

/** For tests. */
export function resetArchiveBreaker(): void {
  archiveBlockedUntil = 0;
}

const THROTTLED_MESSAGE = 'The Internet Archive is limiting requests right now';
const DEFAULT_TIMEOUT_MS = 15_000;
export const sharedCache = new TtlCache<ArchivedSnapshot | null>(5000);

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
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Day precision is plenty for picking a snapshot and keeps the cache useful
  const day = citationDate ? toWaybackTimestamp(citationDate).slice(0, 8) : 'latest';
  const cacheKey = `cdx:${url}:${day}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    log.info('wayback.query', { cached: true, found: cached !== null });
    return cached;
  }

  const startedAt = performance.now();

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

  const rows = await queryCdx(query, { fetch: doFetch, limiter, timeoutMs });
  const rawSnapshotCount = Array.isArray(rows) && rows.length > 1 ? rows.length - 1 : 0;

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

  const latencyMs = Math.round(performance.now() - startedAt);
  // No URL: cited links come from users' documents and are never logged
  log.info('wayback.query', {
    cached: false,
    found: result !== null,
    snapshots: rawSnapshotCount,
    latencyMs,
  });

  cache.set(cacheKey, result, CACHE_TTL_MS.cdx);
  return result;
}

/**
 * One CDX request, paced by the shared limiter and guarded by the circuit
 * breaker. Returns the parsed JSON body.
 *
 * @throws WaybackError when the Archive is throttling us, unreachable or errors
 */
async function queryCdx(
  query: URLSearchParams,
  deps: { fetch: typeof fetch; limiter: SlotLimiter; timeoutMs: number }
): Promise<unknown> {
  if (isArchiveBlocked()) throw new WaybackError(THROTTLED_MESSAGE);
  await deps.limiter.waitForSlot();
  try {
    const response = await deps.fetch(`${CDX_ENDPOINT}?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    if (response.status === 429) {
      reportArchiveThrottled();
      throw new WaybackError(THROTTLED_MESSAGE);
    }
    if (!response.ok) {
      throw new WaybackError(`The Internet Archive returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof WaybackError) throw error;
    // fetch() wraps the socket error: TypeError('fetch failed', { cause })
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (code === 'ECONNREFUSED') {
      reportArchiveThrottled();
      throw new WaybackError(THROTTLED_MESSAGE);
    }
    throw new WaybackError('The Internet Archive could not be reached');
  }
}

/** One capture in a snapshot listing. */
export interface SnapshotListing {
  /** Capture time, ISO 8601 (UTC). */
  timestamp: string;
  /** Wayback Machine URL of this capture. */
  archiveUrl: string;
  statusCode: string;
  mimeType: string;
}

export interface ListSnapshotsOptions {
  from?: Date;
  to?: Date;
  /** Captures to return, 1..MAX_LISTED_SNAPSHOTS (default 20). */
  limit?: number;
}

export const MAX_LISTED_SNAPSHOTS = 100;
const listingCache = new TtlCache<SnapshotListing[]>(1000);

/**
 * The most recent captures of `url` (within `from`..`to` if given), oldest
 * first. Consecutive identical captures are collapsed, so each entry is a
 * version of the page that differed from the one before. Cached for 24 hours.
 *
 * @throws WaybackError when the Wayback Machine is unreachable or errors
 */
export async function listSnapshots(
  url: string,
  options: ListSnapshotsOptions = {},
  deps: Omit<WaybackDeps, 'cache'> & { cache?: TtlCache<SnapshotListing[]> } = {}
): Promise<SnapshotListing[]> {
  const limit = Math.min(MAX_LISTED_SNAPSHOTS, Math.max(1, Math.floor(options.limit ?? 20)));
  const query = new URLSearchParams({
    url,
    output: 'json',
    fl: 'timestamp,original,statuscode,mimetype',
    collapse: 'digest',
    limit: String(-limit), // newest N, still returned oldest first
  });
  if (options.from) query.set('from', toWaybackTimestamp(options.from));
  if (options.to) query.set('to', toWaybackTimestamp(options.to));

  const cache = deps.cache ?? listingCache;
  const cacheKey = `list:${query}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rows = await queryCdx(query, {
    fetch: deps.fetch ?? fetch,
    limiter: deps.limiter ?? sharedLimiter,
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const listing = parseCdxRows(rows)
    .filter((s) => !Number.isNaN(parseWaybackTimestamp(s.timestamp)))
    .map((s) => ({
      timestamp: new Date(parseWaybackTimestamp(s.timestamp)).toISOString(),
      archiveUrl: `https://web.archive.org/web/${s.timestamp}/${url}`,
      statusCode: s.statusCode,
      mimeType: s.mimeType,
    }));

  log.info('wayback.list', { snapshots: listing.length });
  cache.set(cacheKey, listing, CACHE_TTL_MS.cdx);
  return listing;
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
