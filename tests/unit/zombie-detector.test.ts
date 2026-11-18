// @vitest-environment node
/**
 * Tests for detectZombie() with fixture pages served by a fake fetchPage
 * (spec 03 tasks 4.1–4.3 and 6.2).
 */

import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectZombie, rawArchiveUrl, driftFromSimilarity, type ZombieDeps } from '@/lib/zombie/detector';
import type { PageResult } from '@/lib/checker/safe-fetch';
import { RateLimiter } from '@/lib/wayback/rate-limiter';
import { TtlCache } from '@/lib/wayback/cache';
import type { ArchivedSnapshot } from '@/types/link';
import type { AiAnalysis, AiAnalysisInput } from '@/lib/zombie/ai';
import { extractMainContent } from '@/lib/zombie/content';
import { contentSimilarity } from '@/lib/zombie/similarity';

const html = (name: string) => readFileSync(join(__dirname, '../fixtures/zombie', name), 'utf-8');
const URL_ = 'https://dpl.example.org/research/link-rot';
const SNAPSHOT: ArchivedSnapshot = {
  url: `https://web.archive.org/web/20190501000000/${URL_}`,
  timestamp: '2019-05-01T00:00:00.000Z',
  originalTimestamp: '20190501000000',
  statusCode: '200',
  mimeType: 'text/html',
};
const ARCHIVE_RAW = rawArchiveUrl(SNAPSHOT, URL_);

/** Fake web: archive serves the original article; `current` decides the live page. */
function deps(current: string | null, overrides: Partial<ZombieDeps> = {}) {
  const fetchPage = vi.fn(async (url: string): Promise<PageResult> => {
    const body = url === ARCHIVE_RAW ? html('research-archived.html') : current;
    return body === null
      ? { finalUrl: url, redirects: [], method: 'GET', attempts: 1, error: 'TIMEOUT' }
      : { finalUrl: url, redirects: [], method: 'GET', attempts: 1, status: 200, contentType: 'text/html', html: body, truncated: false };
  });
  return {
    fetchPage,
    d: { fetchPage, analyze: null, archiveLimiter: new RateLimiter(0), cache: new TtlCache(), ...overrides } as ZombieDeps,
  };
}

const input = (finalUrl = URL_) => ({ url: URL_, finalUrl, archived: SNAPSHOT, suspicionReason: 'Redirects to a different site' });
const aiSays = (isZombie: boolean): AiAnalysis => ({
  isZombie,
  confidence: 0.8,
  reason: isZombie ? 'AI: different topic' : 'AI: same topic, rewritten',
  changes: { titleChanged: true, contentDrift: isZombie ? 'complete' : 'minor', possibleTakeover: false },
});

describe('rawArchiveUrl', () => {
  test('uses id_ mode so the Wayback toolbar is not included', () => {
    expect(ARCHIVE_RAW).toBe(`https://web.archive.org/web/20190501000000id_/${URL_}`);
  });
});

describe('detectZombie: known cases (task 6.1)', () => {
  test('parked domain → zombie, takeover, without needing the AI', async () => {
    const analyze = vi.fn();
    const report = await detectZombie(input(), deps(html('parked.html'), { analyze }).d);

    expect(report).toMatchObject({ isZombie: true, method: 'heuristic', changes: { possibleTakeover: true, contentDrift: 'complete' } });
    expect(report.confidence).toBeGreaterThanOrEqual(0.9);
    expect(report.reason).toMatch(/for sale/);
    expect(analyze).not.toHaveBeenCalled();
  });

  test('casino takeover → zombie naming the spam', async () => {
    const report = await detectZombie(input('https://casino.example.net/'), deps(html('casino.html')).d);
    expect(report).toMatchObject({ isZombie: true, changes: { possibleTakeover: true, redirectTarget: 'https://casino.example.net/' } });
    expect(report.reason).toMatch(/taken over/);
  });

  test('topic change (article → shoe shop) → zombie with both titles', async () => {
    const report = await detectZombie(input(), deps(html('topic-change.html')).d);
    expect(report).toMatchObject({ isZombie: true, method: 'heuristic', changes: { contentDrift: 'complete' } });
    expect(report.reason).toMatch(/was "Link Rot.*now "Summer Running Shoes/);
    expect(report.similarity).toBeLessThan(0.1);
  });

  test('redesigned + updated article at a new address → living', async () => {
    const report = await detectZombie(input('https://new.example.org/link-rot'), deps(html('research-updated.html')).d);
    expect(report).toMatchObject({ isZombie: false, method: 'heuristic', changes: { contentDrift: 'none' } });
    expect(report.reason).toMatch(/same content/);
    expect(report.similarity).toBeGreaterThan(0.8);
  });
});

describe('detectZombie: uncertain cases (stage 2)', () => {
  // Keeps the first few sentences of the article, buried under new marketing
  // text: similarity ~0.26, between the quick-check thresholds (0.1 and 0.5)
  const original = extractMainContent(html('research-archived.html'), URL_);
  const opening = original.text.split('. ').slice(0, 4).join('. ');
  const marketing = 'Our lab now offers consulting, training workshops, enterprise licensing and pricing plans for libraries and publishers. ';
  const rewritten = `<html><head><title>Link Rot Services and Consulting</title></head><body><article><p>${opening}.</p><p>${marketing.repeat(10)}</p></article></body></html>`;

  test('fixture really is in the uncertain band', () => {
    const sim = contentSimilarity(original.text, extractMainContent(rewritten, URL_).text);
    expect(sim).toBeGreaterThan(0.1);
    expect(sim).toBeLessThan(0.5);
  });

  test('goes to the AI and uses its verdict', async () => {
    const analyze = vi.fn<(input: AiAnalysisInput) => Promise<AiAnalysis>>(async () => aiSays(false));
    const report = await detectZombie(input(), deps(rewritten, { analyze }).d);

    expect(analyze).toHaveBeenCalledOnce();
    expect(report).toMatchObject({ isZombie: false, method: 'ai', reason: 'AI: same topic, rewritten' });
    expect(analyze.mock.calls[0]![0]).toMatchObject({ url: URL_, archivedDate: SNAPSHOT.timestamp });
  });

  test('AI failure falls back to a cautious heuristic verdict', async () => {
    const analyze = vi.fn(async () => {
      throw new Error('down');
    });
    const report = await detectZombie(input(), deps(rewritten, { analyze }).d);
    expect(report.method).toBe('heuristic');
    expect(report.confidence).toBe(0.55);
  });

  test('no AI configured → heuristic verdict', async () => {
    const report = await detectZombie(input(), deps(rewritten).d);
    expect(report).toMatchObject({ method: 'heuristic', confidence: 0.55 });
  });

  test('the AI budget is shared and stops AI calls when used up', async () => {
    const analyze = vi.fn(async () => aiSays(true));
    const budget = { remaining: 1 };
    const { d } = deps(rewritten, { analyze, aiBudget: budget });

    await detectZombie(input(), d);
    await detectZombie({ ...input(), url: `${URL_}?v=2` }, { ...d, cache: new TtlCache() });

    expect(analyze).toHaveBeenCalledOnce();
    expect(budget.remaining).toBe(0);
  });
});

describe('detectZombie: cannot compare (task 4.3)', () => {
  test('current page unreadable → unverified', async () => {
    const report = await detectZombie(input(), deps(null).d);
    expect(report).toMatchObject({ isZombie: true, method: 'unverified', confidence: 0.5 });
    expect(report.reason).toMatch(/could not be read/);
  });

  test('no archived copy → unverified, unless the page is clearly parked', async () => {
    const noArchive = { url: URL_, finalUrl: URL_, suspicionReason: 'Redirects to the homepage' };
    expect((await detectZombie(noArchive, deps(html('research-updated.html')).d)).method).toBe('unverified');
    expect(await detectZombie(noArchive, deps(html('parked.html')).d)).toMatchObject({ isZombie: true, method: 'heuristic' });
  });

  test('unverified results are not cached; verdicts are', async () => {
    const cache = new TtlCache<never>();
    const unreadable = deps(null, { cache });
    await detectZombie(input(), unreadable.d);
    expect(cache.size).toBe(0);

    const readable = deps(html('topic-change.html'), { cache });
    await detectZombie(input(), readable.d);
    await detectZombie(input(), readable.d);
    expect(readable.fetchPage).toHaveBeenCalledTimes(2); // current + archive, once
  });
});

describe('driftFromSimilarity', () => {
  test.each([
    [0.9, 'none'],
    [0.5, 'minor'],
    [0.2, 'major'],
    [0.05, 'complete'],
  ])('%f → %s', (sim, drift) => {
    expect(driftFromSimilarity(sim)).toBe(drift);
  });
});
