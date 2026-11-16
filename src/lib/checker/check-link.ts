/**
 * Check one link end to end (spec 02):
 *   fetch → classify → (dead or suspicious) look up the closest archived copy
 *
 *   alive       → living
 *   dead + copy → ghost (resurrectable)
 *   dead, none  → lost  (lost soul)
 *   suspicious  → zombie (tentative; spec 03 confirms with content)
 *   unchecked   → error
 */

import type { ArchivedSnapshot, CheckResult } from '@/types/link';
import { safeFetch, type FetchResult, type SafeFetchOptions } from './safe-fetch';
import { classify, type Classification } from './classify';
import { findArchivedSnapshot, WaybackError } from '@/lib/wayback/cdx';
import { TtlCache, CACHE_TTL_MS } from '@/lib/wayback/cache';

export interface LinkToCheck {
  id: string;
  url: string;
  citationDate?: Date;
}

export interface CheckDeps {
  fetchStatus?: (url: string, options: SafeFetchOptions) => Promise<FetchResult>;
  findSnapshot?: (url: string, citationDate?: Date) => Promise<ArchivedSnapshot | null>;
  /** Caches fetch + classification by URL for 1 hour. */
  healthCache?: TtlCache<{ fetch: FetchResult; classification: Classification }>;
  now?: () => Date;
}

const sharedHealthCache = new TtlCache<{ fetch: FetchResult; classification: Classification }>(5000);

/** The result for one link. Never throws; failures become status "error". */
export async function checkLink(
  link: LinkToCheck,
  deps: CheckDeps = {},
  signal?: AbortSignal
): Promise<CheckResult> {
  const fetchStatus = deps.fetchStatus ?? safeFetch;
  const findSnapshot = deps.findSnapshot ?? findArchivedSnapshot;
  const healthCache = deps.healthCache ?? sharedHealthCache;
  const now = deps.now ?? (() => new Date());

  const base = { linkId: link.id, url: link.url };

  try {
    let health = healthCache.get(link.url);
    if (!health) {
      const fetched = await fetchStatus(link.url, { signal });
      health = { fetch: fetched, classification: classify(fetched, link.url) };
      // Don't cache "couldn't check" results; they may work next time
      if (health.classification.verdict !== 'unchecked') {
        healthCache.set(link.url, health, CACHE_TTL_MS.health);
      }
    }

    const { fetch: fetched, classification } = health;
    const details = {
      ...(fetched.status !== undefined ? { httpStatus: fetched.status } : {}),
      ...(fetched.redirects.length > 0 ? { finalUrl: fetched.finalUrl } : {}),
    };

    switch (classification.verdict) {
      case 'alive':
        return { ...base, ...details, status: 'living', reason: classification.reason, checkedAt: now() };

      case 'unchecked':
        return {
          ...base,
          ...details,
          status: 'error',
          reason: classification.reason,
          error: fetched.error ?? `HTTP ${fetched.status}`,
          checkedAt: now(),
        };

      case 'suspicious': {
        // The archived copy lets spec 03 compare then vs now; optional here
        const archived = await findSnapshot(link.url, link.citationDate).catch(() => null);
        return {
          ...base,
          ...details,
          status: 'zombie',
          suspicious: true,
          reason: classification.reason,
          ...(archived ? { archived } : {}),
          checkedAt: now(),
        };
      }

      case 'dead': {
        let archived: ArchivedSnapshot | null;
        try {
          archived = await findSnapshot(link.url, link.citationDate);
        } catch (error) {
          const why = error instanceof WaybackError ? error.message : 'The Internet Archive could not be searched';
          return {
            ...base,
            ...details,
            status: 'error',
            reason: `${classification.reason}. ${why}, so no archived copy could be found; try again later.`,
            error: 'WAYBACK_UNAVAILABLE',
            checkedAt: now(),
          };
        }
        if (archived) {
          return { ...base, ...details, status: 'ghost', reason: classification.reason, archived, checkedAt: now() };
        }
        return {
          ...base,
          ...details,
          status: 'lost',
          reason: `${classification.reason}, and the Internet Archive has no copy`,
          checkedAt: now(),
        };
      }
    }
  } catch (error) {
    return {
      ...base,
      status: 'error',
      reason: 'Something went wrong while checking this link',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: now(),
    };
  }
}
