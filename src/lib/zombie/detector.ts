/**
 * Zombie detection (spec 03): does a suspicious link still show what was cited?
 *
 * 1. Download the current page and the raw archived copy (Wayback `id_` mode,
 *    no toolbar) in parallel, through the SSRF-safe fetcher.
 * 2. Strong signals decide immediately: parked / for-sale page, new spam.
 * 3. Quick check: clearly different → zombie; clearly similar → living.
 * 4. Only uncertain cases go to the Kiro API (if configured and in budget),
 *    so the AI never overrules a strong heuristic signal.
 * 5. Without AI, uncertain cases get a cautious heuristic verdict.
 */

import type { ArchivedSnapshot, ContentChanges, ZombieReport } from '@/types/link';
import { fetchPage, type PageResult, type SafeFetchOptions } from '@/lib/checker/safe-fetch';
import { sharedLimiter } from '@/lib/wayback/cdx';
import { RateLimiter } from '@/lib/wayback/rate-limiter';
import { TtlCache, CACHE_TTL_MS } from '@/lib/wayback/cache';
import { extractMainContent, detectParkedPage, spamTerms, type PageContent } from './content';
import { contentSimilarity, jaccard, wordCount } from './similarity';
import { analyzeWithAI, aiConfigFromEnv, type AiAnalysisInput, type AiAnalysis } from './ai';

export interface ZombieInput {
  url: string;
  /** Where the link ends up after redirects. */
  finalUrl: string;
  archived?: ArchivedSnapshot;
  /** Why the link was flagged (from classification). */
  suspicionReason: string;
}

/** Shared per /api/check request so one document cannot exhaust AI credits. */
export interface AiBudget {
  remaining: number;
}

export interface ZombieDeps {
  fetchPage?: (url: string, options: SafeFetchOptions) => Promise<PageResult>;
  /** Set to null to disable AI analysis. */
  analyze?: ((input: AiAnalysisInput) => Promise<AiAnalysis>) | null;
  aiBudget?: AiBudget;
  archiveLimiter?: RateLimiter;
  cache?: TtlCache<ZombieReport>;
  signal?: AbortSignal;
}

const sharedCache = new TtlCache<ZombieReport>(2000);
const MIN_WORDS = 40;

/** Raw archived page URL: `id_` returns the original HTML without the Wayback toolbar. */
export function rawArchiveUrl(snapshot: ArchivedSnapshot, url: string): string {
  return `https://web.archive.org/web/${snapshot.originalTimestamp}id_/${url}`;
}

export function driftFromSimilarity(similarity: number): ContentChanges['contentDrift'] {
  if (similarity >= 0.7) return 'none';
  if (similarity >= 0.4) return 'minor';
  if (similarity >= 0.15) return 'major';
  return 'complete';
}

const quote = (title: string) => (title.length > 60 ? `"${title.slice(0, 57)}..."` : `"${title}"`);

export async function detectZombie(input: ZombieInput, deps: ZombieDeps = {}): Promise<ZombieReport> {
  const getPage = deps.fetchPage ?? fetchPage;
  const analyze = deps.analyze === undefined ? (aiConfigFromEnv() ? analyzeWithAI : null) : deps.analyze;
  const limiter = deps.archiveLimiter ?? sharedLimiter;
  const cache = deps.cache ?? sharedCache;

  const cacheKey = `zombie:${input.url}:${input.finalUrl}:${input.archived?.originalTimestamp ?? 'none'}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const redirectTarget = input.finalUrl !== input.url ? input.finalUrl : undefined;
  const unverified = (reason: string, current?: PageContent): ZombieReport => ({
    isZombie: true,
    confidence: 0.5,
    method: 'unverified',
    reason,
    changes: { titleChanged: false, contentDrift: 'major', possibleTakeover: false, ...(redirectTarget ? { redirectTarget } : {}) },
    ...(current?.title ? { currentTitle: current.title } : {}),
  });

  const [currentPage, archivedPage] = await Promise.all([
    getPage(input.finalUrl, { signal: deps.signal }),
    input.archived
      ? limiter.waitForSlot().then(() => getPage(rawArchiveUrl(input.archived!, input.url), { signal: deps.signal, timeoutMs: 15_000 }))
      : Promise.resolve(undefined),
  ]);

  const current = currentPage.html ? extractMainContent(currentPage.html, currentPage.finalUrl) : undefined;
  const archived = archivedPage?.html ? extractMainContent(archivedPage.html, input.url) : undefined;

  const finish = (report: ZombieReport) => {
    if (report.method !== 'unverified') cache.set(cacheKey, report, CACHE_TTL_MS.cdx);
    return report;
  };

  if (!current) {
    return unverified(`${input.suspicionReason}. The current page could not be read to confirm.`);
  }

  // Strong signals on the current page alone
  const parked = detectParkedPage(current);
  const newSpam = spamTerms(current).filter((t) => !(archived && spamTerms(archived).includes(t)));
  const titleSim = archived ? jaccard(archived.title, current.title) : 0;
  const titles = {
    ...(archived?.title ? { archivedTitle: archived.title } : {}),
    ...(current.title ? { currentTitle: current.title } : {}),
  };

  if (parked) {
    return finish({
      isZombie: true,
      confidence: 0.95,
      method: 'heuristic',
      reason: `The page now ${parked}; the original content is gone`,
      changes: { titleChanged: archived ? titleSim < 0.5 : true, contentDrift: 'complete', possibleTakeover: true, ...(redirectTarget ? { redirectTarget } : {}) },
      ...titles,
    });
  }
  if (newSpam.length >= 2) {
    return finish({
      isZombie: true,
      confidence: 0.9,
      method: 'heuristic',
      reason: `The site appears to have been taken over: it now advertises ${newSpam.slice(0, 2).join(' and ')}`,
      changes: { titleChanged: true, contentDrift: 'complete', possibleTakeover: true, ...(redirectTarget ? { redirectTarget } : {}) },
      ...titles,
    });
  }

  if (!archived) {
    return unverified(
      input.archived
        ? `${input.suspicionReason}. The archived copy could not be read to compare.`
        : `${input.suspicionReason}. There is no archived copy to compare against.`,
      current
    );
  }

  // Quick check (stage 1)
  const enoughText = wordCount(archived.text) >= MIN_WORDS && wordCount(current.text) >= MIN_WORDS;
  const similarity = enoughText ? contentSimilarity(archived.text, current.text) : titleSim;
  const changes: ContentChanges = {
    titleChanged: titleSim < 0.5,
    contentDrift: driftFromSimilarity(similarity),
    possibleTakeover: false,
    ...(redirectTarget ? { redirectTarget } : {}),
  };
  const base = { ...titles, similarity: Math.round(similarity * 100) / 100, changes };

  if (enoughText && similarity >= 0.5) {
    return finish({
      ...base,
      isZombie: false,
      confidence: Math.min(0.95, 0.6 + 0.4 * similarity),
      method: 'heuristic',
      reason: redirectTarget
        ? 'The link redirects, but the same content is still there'
        : 'Most of the original text is still on the page',
    });
  }
  if (similarity < 0.1 && titleSim < 0.3) {
    return finish({
      ...base,
      isZombie: true,
      confidence: enoughText ? 0.85 : 0.7,
      method: 'heuristic',
      reason: `The page now shows completely different content (was ${quote(archived.title || 'untitled')}, now ${quote(current.title || 'untitled')})`,
    });
  }

  // Uncertain: stage 2 (AI) if available and in budget
  const budget = deps.aiBudget;
  if (analyze && (!budget || budget.remaining > 0)) {
    if (budget) budget.remaining--;
    try {
      const ai = await analyze({
        url: input.url,
        finalUrl: input.finalUrl,
        archivedDate: input.archived?.timestamp ?? '',
        archived: { title: archived.title, text: archived.text },
        current: { title: current.title, text: current.text },
      });
      return finish({
        ...base,
        isZombie: ai.isZombie,
        confidence: ai.confidence,
        method: 'ai',
        reason: ai.reason,
        changes: { ...ai.changes, ...(redirectTarget ? { redirectTarget } : {}) },
      });
    } catch {
      // fall through to the heuristic verdict
    }
  }

  const isZombie = similarity < 0.3;
  return finish({
    ...base,
    isZombie,
    confidence: 0.55,
    method: 'heuristic',
    reason: isZombie
      ? 'Much of the original text is no longer on the page'
      : 'The page has changed, but much of the original text is still there',
  });
}
