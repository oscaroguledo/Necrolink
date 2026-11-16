/**
 * Tests for the concurrency limiter.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { createLimiter } from '@/lib/checker/concurrency';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  test('never runs more than max tasks at once, and runs them all', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 25 }),
        async (max, delays) => {
          const limit = createLimiter(max);
          let running = 0;
          let peak = 0;
          const results = await Promise.all(
            delays.map((delay, i) =>
              limit(async () => {
                running++;
                peak = Math.max(peak, running);
                for (let t = 0; t < delay; t++) await tick();
                running--;
                return i;
              })
            )
          );
          expect(peak).toBeLessThanOrEqual(max);
          expect(results).toEqual(delays.map((_, i) => i));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('a rejected task rejects its own promise and frees its slot', async () => {
    const limit = createLimiter(1);
    const failed = limit(async () => {
      throw new Error('nope');
    });
    const next = limit(async () => 'ok');
    await expect(failed).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ok');
    expect(limit.activeCount).toBe(0);
    expect(limit.pendingCount).toBe(0);
  });

  test('rejects invalid max', () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
  });
});
