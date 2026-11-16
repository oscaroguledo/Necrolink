/**
 * Unit tests for citation date extraction
 */

import { describe, test, expect } from 'vitest';
import { extractCitationDate } from '@/lib/extractors/date-parser';

const NOW = new Date('2026-11-16T12:00:00Z');
const parse = (text: string) => extractCitationDate(text, { now: NOW })?.toISOString().slice(0, 10);

describe('extractCitationDate', () => {
  describe('formats', () => {
    test.each([
      ['Accessed 2023-06-15', '2023-06-15'],
      ['see 2023/06/15 snapshot', '2023-06-15'],
      ['Retrieved June 15, 2023', '2023-06-15'],
      ['Retrieved Jun. 15 2023', '2023-06-15'],
      ['Retrieved Sept 3rd, 2021', '2021-09-03'],
      ['Accessed 15 June 2023', '2023-06-15'],
      ['Accessed 1st Dec 2020', '2020-12-01'],
      ['Published: June 2023', '2023-06-01'],
      ['Smith, J. (2023). Title.', '2023-01-01'],
      ['Smith, J. (2023b). Title.', '2023-01-01'],
      ['Smith, J. (2023, June 15). Title.', '2023-06-15'],
      ['Smith, J. (2023, March). Title.', '2023-03-01'],
      ['RETRIEVED JUNE 15, 2023', '2023-06-15'],
    ])('%s → %s', (text, expected) => {
      expect(parse(text)).toBe(expected);
    });
  });

  describe('priority', () => {
    test('access date beats publication year', () => {
      expect(parse('Smith (2021). Title. Retrieved June 15, 2023')).toBe('2023-06-15');
    });

    test('access date beats publication date', () => {
      expect(parse('Published 2020-01-10. Accessed 2023-06-15.')).toBe('2023-06-15');
    });

    test('publication date beats a plain date', () => {
      expect(parse('Event on 2019-05-05. Published on 2020-01-10.')).toBe('2020-01-10');
    });

    test('full date beats a parenthesized year', () => {
      expect(parse('Doe (2018) wrote this on 2019-04-01')).toBe('2019-04-01');
    });

    test('earliest date wins among equal ranks', () => {
      expect(parse('2019-04-01 and 2020-05-02')).toBe('2019-04-01');
    });
  });

  describe('invalid dates return undefined', () => {
    test.each([
      ['2023-02-30', 'Feb 30 does not exist'],
      ['2023-13-01', 'month 13'],
      ['2023-00-10', 'month 0'],
      ['February 29, 2023', 'not a leap year'],
      ['(1234)', 'before the web'],
      ['Retrieved 1985-06-01', 'before the web'],
      ['Accessed 2030-01-01', 'in the future'],
      ['(2027)', 'in the future'],
      ['Smarch 15, 2023', 'not a month'],
      ['', 'empty'],
      ['no dates in here', 'no date'],
      ['Call 555-1234 or 2023', 'bare year is too noisy'],
    ])('%s (%s)', (text) => {
      expect(parse(text)).toBeUndefined();
    });

    test('Feb 29 in a leap year is valid', () => {
      expect(parse('Accessed 2024-02-29')).toBe('2024-02-29');
    });

    test('falls back to the next valid date when the first is impossible', () => {
      expect(parse('2023-02-30 then Retrieved 2023-03-01')).toBe('2023-03-01');
    });
  });

  test('returns UTC midnight regardless of server time zone', () => {
    const date = extractCitationDate('Retrieved June 15, 2023', { now: NOW });
    expect(date?.toISOString()).toBe('2023-06-15T00:00:00.000Z');
  });

  test('works on real extractor context', () => {
    // Context produced by the PDF extractor for the sample.pdf citation
    const context =
      'th, J. (2023). Link Rot in Academic Publications. https://journal.example.org/articles/link-rot. Retrieved 2023-06-15. See (https://paren.example';
    expect(parse(context)).toBe('2023-06-15');
  });
});
