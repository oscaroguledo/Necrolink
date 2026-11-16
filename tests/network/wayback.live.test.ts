// @vitest-environment node
/**
 * Live tests against the real Wayback Machine and real websites (spec 02 task 3.4).
 * Skipped by default; run with:  NETWORK_TESTS=1 npx vitest run tests/network
 */

import { describe, test, expect } from 'vitest';
import { findArchivedSnapshot } from '@/lib/wayback/cdx';
import { TtlCache } from '@/lib/wayback/cache';
import { RateLimiter } from '@/lib/wayback/rate-limiter';
import { checkLink } from '@/lib/checker/check-link';
import type { ArchivedSnapshot } from '@/types/link';

const live = process.env.NETWORK_TESTS === '1';
const deps = () => ({ cache: new TtlCache<ArchivedSnapshot | null>(), limiter: new RateLimiter(200) });

describe.skipIf(!live)('Wayback Machine (live)', () => {
  test('finds a capture close to a citation date', async () => {
    const snapshot = await findArchivedSnapshot('example.com', new Date('2015-06-15T00:00:00Z'), deps());
    expect(snapshot).not.toBeNull();
    const gapDays = Math.abs(Date.parse(snapshot!.timestamp) - Date.parse('2015-06-15')) / 86_400_000;
    expect(gapDays).toBeLessThan(30);
    expect(snapshot!.url).toMatch(/^https:\/\/web\.archive\.org\/web\/2015\d{10}\/example\.com$/);
  }, 60_000);

  test('without a date, returns a recent capture', async () => {
    const snapshot = await findArchivedSnapshot('example.com', undefined, deps());
    expect(Date.parse(snapshot!.timestamp)).toBeGreaterThan(Date.parse('2025-01-01'));
  }, 60_000);

  test('a never-archived URL returns null', async () => {
    const snapshot = await findArchivedSnapshot(
      `https://necrolink-never-archived-${Date.now()}.com/page`,
      undefined,
      deps()
    );
    expect(snapshot).toBeNull();
  }, 60_000);

  test('end to end: GeoCities is a zombie with a pre-shutdown archived copy', async () => {
    const result = await checkLink({
      id: 'geo',
      url: 'http://www.geocities.com/SiliconValley/',
      citationDate: new Date('2005-06-15T00:00:00Z'),
    });
    expect(result.status).toBe('zombie');
    // Closest 200 capture to 2005 is from 1999 (later captures are redirects);
    // what matters is a copy from before GeoCities closed on 2009-10-26
    expect(Date.parse(result.archived!.timestamp)).toBeLessThan(Date.parse('2009-10-26'));
  }, 90_000);
});
