/**
 * Replacement rules for export (spec 04): what to do with each link.
 *
 *   ghost  → swap the URL for the archived copy, mark 👻→⏮️
 *   zombie → keep the URL, mark 🧟, footnote explaining what changed
 *   lost   → NEVER change the URL (nothing to resurrect it from), mark 🪦,
 *            footnote telling the reader to find another source
 *   living / error / unchecked → leave alone
 *
 * Rules are matched to links in the document by original URL and occurrence
 * (the 2nd time a URL appears gets the rule for its 2nd extracted link), so
 * the same URL cited with different dates can get different archive copies.
 */

import type { CheckResult, ExtractedLink } from '@/types/link';

export type ReplacementType = 'ghost' | 'zombie' | 'lost';

export interface ReplacementRule {
  linkId: string;
  type: ReplacementType;
  originalUrl: string;
  /** Archived copy (ghosts only). */
  newUrl?: string;
  /** Archive capture date, ISO (ghosts only). */
  archivedAt?: string;
  /** Footnote text (zombies and lost souls). */
  note?: string;
  /** Shared numbering across zombies and lost souls, from 1. */
  footnote?: number;
}

export interface ExportStats {
  ghosts: number;
  zombies: number;
  lost: number;
  unchanged: number;
}

const ARCHIVE_URL = /^https:\/\/web\.archive\.org\/web\/\d{4,14}(id_)?\/\S+$/;

/** True only for a genuine Wayback Machine link (never javascript:, data:, ...). */
export function isArchiveUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 4096 && ARCHIVE_URL.test(url);
}

/** One sentence, single line, at most 300 chars. */
function cleanNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Build one rule per link that needs changing, in document order, with
 * sequential footnote numbers across zombies and lost souls.
 */
export function buildReplacementMap(
  links: Pick<ExtractedLink, 'id' | 'originalUrl'>[],
  results: Pick<CheckResult, 'linkId' | 'status' | 'reason' | 'archived'>[]
): { rules: ReplacementRule[]; stats: ExportStats } {
  const byId = new Map(results.map((r) => [r.linkId, r]));
  const rules: ReplacementRule[] = [];
  const stats: ExportStats = { ghosts: 0, zombies: 0, lost: 0, unchanged: 0 };
  let footnote = 0;

  for (const link of links) {
    const result = byId.get(link.id);
    const base = { linkId: link.id, originalUrl: link.originalUrl };

    if (result?.status === 'ghost' && isArchiveUrl(result.archived?.url)) {
      rules.push({
        ...base,
        type: 'ghost',
        newUrl: result.archived!.url,
        ...(result.archived?.timestamp ? { archivedAt: result.archived.timestamp } : {}),
      });
      stats.ghosts++;
    } else if (result?.status === 'zombie') {
      rules.push({ ...base, type: 'zombie', note: cleanNote(result.reason || 'The page has changed since it was cited'), footnote: ++footnote });
      stats.zombies++;
    } else if (result?.status === 'lost') {
      rules.push({
        ...base,
        type: 'lost',
        note: 'This link is dead and the Internet Archive has no copy. Find another source.',
        footnote: ++footnote,
      });
      stats.lost++;
    } else {
      stats.unchanged++;
    }
  }

  return { rules, stats };
}

/**
 * Look up rules by original URL and occurrence index.
 * `next(url)` returns the rule for the next occurrence of that URL, if any.
 */
export function ruleCursor(links: Pick<ExtractedLink, 'id' | 'originalUrl'>[], rules: ReplacementRule[]) {
  const ruleById = new Map(rules.map((r) => [r.linkId, r]));
  const queues = new Map<string, Array<ReplacementRule | undefined>>();
  for (const link of links) {
    const queue = queues.get(link.originalUrl) ?? [];
    queue.push(ruleById.get(link.id));
    queues.set(link.originalUrl, queue);
  }
  return {
    next(originalUrl: string): ReplacementRule | undefined {
      return queues.get(originalUrl)?.shift();
    },
  };
}

export const NECROLINK_URL = 'https://github.com/oscaroguledo/Necrolink';

export function summaryLine(stats: ExportStats): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(stats.ghosts, 'ghost resurrected', 'ghosts resurrected'),
    plural(stats.zombies, 'zombie flagged', 'zombies flagged'),
    plural(stats.lost, 'lost soul', 'lost souls'),
  ].join(', ');
}
