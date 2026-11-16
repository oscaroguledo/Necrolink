// @vitest-environment node
/**
 * Property-based tests for snapshot selection and rate limiting (spec 02 task 7.3).
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  findClosestSnapshot,
  parseWaybackTimestamp,
  toWaybackTimestamp,
  type CdxSnapshot,
} from '@/lib/wayback/cdx';
import { RateLimiter } from '@/lib/wayback/rate-limiter';

const MIN = new Date('1996-01-01T00:00:00Z');
const MAX = new Date('2026-11-01T00:00:00Z');
const secondDate = fc
  .date({ min: MIN, max: MAX })
  .map((d) => new Date(Math.floor(d.getTime() / 1000) * 1000));

const snapshotArb = fc.record({
  timestamp: secondDate.map(toWaybackTimestamp),
  original: fc.constant('http://example.com/'),
  statusCode: fc.constantFrom('200', '200', '200', '301', '404'),
  mimeType: fc.constant('text/html'),
});

const timeOf = (s: CdxSnapshot) => parseWaybackTimestamp(s.timestamp);

describe('findClosestSnapshot properties', () => {
  test('timestamps round-trip at second precision', () => {
    fc.assert(
      fc.property(secondDate, (d) => {
        expect(parseWaybackTimestamp(toWaybackTimestamp(d))).toBe(d.getTime());
      }),
      { numRuns: 1000 }
    );
  });

  test('the chosen capture is the closest 200 capture in real time', () => {
    fc.assert(
      fc.property(fc.array(snapshotArb, { maxLength: 30 }), secondDate, (snapshots, target) => {
        const chosen = findClosestSnapshot(snapshots, target);
        const usable = snapshots.filter((s) => s.statusCode === '200');

        if (usable.length === 0) {
          expect(chosen).toBeNull();
          return;
        }
        expect(chosen?.statusCode).toBe('200');
        const best = Math.min(...usable.map((s) => Math.abs(timeOf(s) - target.getTime())));
        expect(Math.abs(timeOf(chosen!) - target.getTime())).toBe(best);
      }),
      { numRuns: 2000 }
    );
  });

  test('without a date, the chosen capture is the newest 200 capture', () => {
    fc.assert(
      fc.property(fc.array(snapshotArb, { minLength: 1, maxLength: 30 }), (snapshots) => {
        const chosen = findClosestSnapshot(snapshots);
        const usable = snapshots.filter((s) => s.statusCode === '200');
        if (usable.length === 0) return;
        expect(timeOf(chosen!)).toBe(Math.max(...usable.map(timeOf)));
      }),
      { numRuns: 1000 }
    );
  });

  test('order of the input does not change the answer', () => {
    fc.assert(
      fc.property(fc.array(snapshotArb, { maxLength: 20 }), secondDate, (snapshots, target) => {
        const a = findClosestSnapshot(snapshots, target);
        const b = findClosestSnapshot([...snapshots].reverse(), target);
        expect(a && Math.abs(timeOf(a) - target.getTime())).toBe(
          b && Math.abs(timeOf(b) - target.getTime())
        );
      }),
      { numRuns: 1000 }
    );
  });
});

describe('RateLimiter properties', () => {
  test('no two requests ever start less than the interval apart', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Bursts of callers arriving at arbitrary (non-decreasing) times
        fc.array(fc.tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 1, max: 8 })), {
          minLength: 1,
          maxLength: 15,
        }),
        fc.integer({ min: 1, max: 300 }),
        async (bursts, interval) => {
          let clock = 0;
          const starts: number[] = [];
          const limiter = new RateLimiter(
            interval,
            () => clock,
            async (ms) => {
              starts.push(clock + ms);
            }
          );

          for (const [gap, size] of bursts) {
            clock += gap;
            const before = starts.length;
            await Promise.all(Array.from({ length: size }, () => limiter.waitForSlot()));
            // Callers that did not sleep start right now
            const slept = starts.length - before;
            for (let i = 0; i < size - slept; i++) starts.push(clock);
          }

          const sorted = [...starts].sort((a, b) => a - b);
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(interval);
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});
