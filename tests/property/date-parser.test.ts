/**
 * Property-based tests for citation date extraction (fast-check).
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { extractCitationDate } from '@/lib/extractors/date-parser';

const NOW = new Date('2026-11-16T12:00:00Z');
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Any real calendar day between 1990-01-01 and NOW, at UTC midnight. */
const validDate = fc
  .date({ min: new Date('1990-01-01T00:00:00Z'), max: NOW })
  .map((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const longForm = (d: Date) =>
  `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const dayFirst = (d: Date) =>
  `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Filler text with no digits, so it cannot introduce another date. */
const filler = fc.string({ maxLength: 40 }).map((s) => s.replace(/[\d()]/g, ''));

describe('extractCitationDate properties', () => {
  test('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        extractCitationDate(s, { now: NOW });
      }),
      { numRuns: 2000 }
    );
  });

  test('result is always undefined or a valid UTC-midnight date in [1990, now]', () => {
    const datey = fc.stringOf(
      fc.constantFrom(...'0123456789-/(), JunMarDecRetrievd '.split('')),
      { maxLength: 60 }
    );
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 120 }), datey), (s) => {
        const d = extractCitationDate(s, { now: NOW });
        if (d === undefined) return;
        expect(Number.isNaN(d.getTime())).toBe(false);
        expect(d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds()).toBe(0);
        expect(d.getUTCFullYear()).toBeGreaterThanOrEqual(1990);
        expect(d.getTime()).toBeLessThanOrEqual(NOW.getTime());
      }),
      { numRuns: 2000 }
    );
  });

  test.each([
    ['ISO (2023-06-15)', iso],
    ['long form (June 15, 2023)', longForm],
    ['day first (15 June 2023)', dayFirst],
  ])('round-trips any valid date written as %s', (_name, format) => {
    fc.assert(
      fc.property(validDate, filler, filler, (date, before, after) => {
        const parsed = extractCitationDate(`${before} ${format(date)} ${after}`, { now: NOW });
        expect(parsed?.getTime()).toBe(date.getTime());
      }),
      { numRuns: 1000 }
    );
  });

  test('impossible calendar days are never returned', () => {
    // Day 29–31 in months that are too short for it
    const impossible = fc
      .record({
        year: fc.integer({ min: 1990, max: 2025 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 29, max: 31 }),
      })
      .filter(({ year, month, day }) => new Date(Date.UTC(year, month, 0)).getUTCDate() < day);

    fc.assert(
      fc.property(impossible, ({ year, month, day }) => {
        const text = `Accessed ${year}-${pad(month)}-${pad(day)}`;
        expect(extractCitationDate(text, { now: NOW })).toBeUndefined();
      }),
      { numRuns: 500 }
    );
  });

  test('an access date always beats any parenthesized year', () => {
    fc.assert(
      fc.property(validDate, fc.integer({ min: 1990, max: 2026 }), (accessed, year) => {
        const text = `Author (${year}). Title. Retrieved ${longForm(accessed)}`;
        expect(extractCitationDate(text, { now: NOW })?.getTime()).toBe(accessed.getTime());
      }),
      { numRuns: 1000 }
    );
  });
});
