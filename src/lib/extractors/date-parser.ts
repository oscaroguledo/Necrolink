/**
 * Citation date extraction from the text around a link.
 *
 * The date is used to pick the Wayback Machine snapshot closest to when the
 * author cited the page, so an access date ("Retrieved…", "Accessed…") beats
 * a publication date, which beats a bare year.
 *
 * All dates are returned as UTC midnight. Impossible dates (Feb 30, month 13),
 * years before the web (< 1990) and future dates return undefined.
 */

export interface DateParseOptions {
  /** Reference "today", for rejecting future dates. Defaults to now. */
  now?: Date;
}

const MIN_YEAR = 1990;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

// Higher rank wins; ties go to the earliest match in the text
const Rank = {
  ParenYear: 1,
  MonthYear: 2,
  FullDate: 3,
  Published: 4,
  Accessed: 5,
} as const;
type Rank = (typeof Rank)[keyof typeof Rank];

const ACCESS_KEYWORD = /(?:retrieved|accessed|viewed|visited|archived)\s*(?:on|:)?\s*$/i;
const PUBLISH_KEYWORD = /(?:published|posted|updated|last\s+modified)\s*(?:on|:)?\s*$/i;

interface Candidate {
  date: Date;
  index: number;
  rank: Rank;
}

type Pattern = {
  regex: RegExp;
  rank: Rank;
  toParts: (m: RegExpMatchArray) => [year: number, month: number, day: number] | undefined;
};

const PATTERNS: Pattern[] = [
  // 2023-06-15 or 2023/06/15
  {
    regex: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g,
    rank: Rank.FullDate,
    toParts: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // June 15, 2023 / Jun. 15 2023
  {
    regex: new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'),
    rank: Rank.FullDate,
    toParts: (m) => monthParts(m[1], m[3], m[2]),
  },
  // 15 June 2023
  {
    regex: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})\\b`, 'gi'),
    rank: Rank.FullDate,
    toParts: (m) => monthParts(m[2], m[3], m[1]),
  },
  // June 2023 → first of the month
  {
    regex: new RegExp(`\\b${MONTH},?\\s+(\\d{4})\\b`, 'gi'),
    rank: Rank.MonthYear,
    toParts: (m) => monthParts(m[1], m[2], '1'),
  },
  // (2023), (2023a), (2023, June 15), (2023, June) — APA style
  {
    regex: new RegExp(`\\((\\d{4})[a-z]?(?:,\\s*${MONTH}(?:\\s+(\\d{1,2}))?)?\\)`, 'gi'),
    rank: Rank.ParenYear,
    toParts: (m) => {
      if (!m[2]) return [Number(m[1]), 1, 1];
      return monthParts(m[2], m[1], m[3] ?? '1');
    },
  },
];

/**
 * Try to extract a citation date from the text around a link.
 *
 * @param context - Text surrounding the link (e.g. ExtractedLink.context)
 * @returns UTC-midnight Date, or undefined if no valid date is found
 *
 * @example
 * extractCitationDate('Smith (2021). Title. Retrieved June 15, 2023')
 * // => 2023-06-15T00:00:00.000Z  (access date beats the (2021) year)
 */
export function extractCitationDate(
  context: string,
  options: DateParseOptions = {}
): Date | undefined {
  if (typeof context !== 'string' || context.length === 0) return undefined;
  const now = options.now ?? new Date();

  const candidates: Candidate[] = [];

  for (const { regex, rank, toParts } of PATTERNS) {
    for (const match of context.matchAll(regex)) {
      const parts = toParts(match);
      if (!parts) continue;
      const date = validDate(...parts, now);
      if (!date) continue;

      const index = match.index ?? 0;
      candidates.push({ date, index, rank: keywordRank(context, index, rank) });
    }
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => b.rank - a.rank || a.index - b.index);
  return candidates[0]!.date;
}

/** Upgrade a full or month-level date's rank if a keyword sits right before it. */
function keywordRank(context: string, index: number, rank: Rank): Rank {
  if (rank === Rank.ParenYear) return rank;
  const before = context.slice(Math.max(0, index - 30), index);
  if (ACCESS_KEYWORD.test(before)) return Rank.Accessed;
  if (PUBLISH_KEYWORD.test(before)) return Rank.Published;
  return rank;
}

function monthParts(
  monthName: string | undefined,
  year: string | undefined,
  day: string | undefined
): [number, number, number] | undefined {
  const month = monthName ? MONTHS[monthName.toLowerCase().replace(/\.$/, '')] : undefined;
  if (!month || !year || !day) return undefined;
  return [Number(year), month, Number(day)];
}

/** Build a UTC date, rejecting impossible, pre-web and future dates. */
function validDate(year: number, month: number, day: number, now: Date): Date | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls Feb 30 over to Mar 2; reject anything that changed
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  if (date.getTime() > now.getTime()) return undefined;
  return date;
}
