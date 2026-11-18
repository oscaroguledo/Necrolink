/**
 * Check one link end to end (spec 02):
 *   fetch → classify → (dead or suspicious) look up the closest archived copy
 *
 *   alive       → living
 *   dead + copy → ghost (resurrectable)
 *   dead, none  → lost  (lost soul)
 *   suspicious  → content comparison (spec 03): zombie, or living if the
 *                 same content is still there; tentative zombie if it
 *                 could not be compared
 *   unchecked   → error
 */

import type { ArchivedSnapshot, CheckResult } from '@/types/link';
import { safeFetch, type FetchResult, type SafeFetchOptions } from './safe-fetch';
import { classify, type Classification } from './classify';
import { isOnline as defaultIsOnline } from './connectivity';
import { findArchivedSnapshot, WaybackError } from '@/lib/wayback/cdx';
import { TtlCache, CACHE_TTL_MS } from '@/lib/wayback/cache';
import { detectZombie, type ZombieInput, type AiBudget } from '@/lib/zombie/detector';
import type { ZombieReport } from '@/types/link';

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
  /** Content comparison for suspicious links; null keeps them tentative. */
  detectZombie?: ((input: ZombieInput, signal?: AbortSignal) => Promise<ZombieReport>) | null;
  /** AI calls left for this request (shared across its links). */
  aiBudget?: AiBudget;
  /** Is this server online? Checked before blaming a link for a network failure. */
  isOnline?: () => Promise<boolean>;
  now?: () => Date;
}

const sharedHealthCache = new TtlCache<{ fetch: FetchResult; classification: Classification }>(5000);

export { sharedHealthCache };

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

      // A network-level failure may be OUR outage, not the site's: confirm we
      // are online before declaring the link dead (and never cache it if not)
      if (health.classification.verdict === 'dead' && fetched.error && !(await (deps.isOnline ?? defaultIsOnline)())) {
        return {
          ...base,
          status: 'error',
          reason: "Necrolink's server could not reach the internet, so this link was not checked. Try again in a few minutes.",
          error: 'SERVER_OFFLINE',
          checkedAt: now(),
        };
      }
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
        // The archived copy lets us compare then vs now
        const archived = await findSnapshot(link.url, link.citationDate).catch(() => null);
        const detect =
          deps.detectZombie === undefined
            ? (input: ZombieInput, s?: AbortSignal) => detectZombie(input, { aiBudget: deps.aiBudget, signal: s })
            : deps.detectZombie;
        const report = detect
          ? await detect(
              {
                url: link.url,
                finalUrl: fetched.finalUrl,
                suspicionReason: classification.reason,
                ...(archived ? { archived } : {}),
              },
              signal
            ).catch(() => null)
          : null;

        if (report && !report.isZombie) {
          return {
            ...base,
            ...details,
            status: 'living',
            reason: report.reason,
            zombie: report,
            ...(archived ? { archived } : {}),
            checkedAt: now(),
          };
        }
        return {
          ...base,
          ...details,
          status: 'zombie',
          // Tentative unless the content comparison confirmed it
          suspicious: !report || report.method === 'unverified',
          reason: report?.reason ?? classification.reason,
          ...(report ? { zombie: report } : {}),
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
            reason: `${classification.reason}. ${why}, so no archived copy could be looked up. Try again in a few minutes.`,
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
