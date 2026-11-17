// @vitest-environment node
/**
 * Property-based tests for document export (spec 04, phase 6).
 *
 * Random Markdown/HTML documents go through the real extractor, random
 * verdicts, and the exporter. Invariants:
 * - outside of changed links, the Markdown document is byte-for-byte identical
 * - lost-soul and zombie URLs are never changed; ghost URLs always are
 * - footnotes are numbered 1..n in reading order, with no gaps or repeats
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import * as cheerio from 'cheerio';
import { extractLinksFromMarkdown } from '@/lib/extractors/markdown';
import { extractLinksFromHTML } from '@/lib/extractors/html';
import { buildReplacementMap } from '@/lib/exporters/replacement-map';
import { exportMarkdown, MARKERS } from '@/lib/exporters/markdown';
import { exportHtml } from '@/lib/exporters/html';
import type { CheckResult, ExtractedLink } from '@/types/link';

const NOW = new Date('2026-11-17T12:00:00Z');
const STATUSES = ['ghost', 'zombie', 'lost', 'living', 'error'] as const;
type Status = (typeof STATUSES)[number];
const archiveFor = (url: string, i: number) => `https://web.archive.org/web/2019050100000${i % 10}/${url}`;

const word = fc.constantFrom('link', 'rot', 'archive', 'paper', 'cite', 'drift', 'web', 'page', 'study', '2023');
const words = fc.array(word, { minLength: 1, maxLength: 4 }).map((w) => w.join(' '));
const url = fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2 })).map(([s, p]) => `https://site${s}.example.com/p${p}`);

const mdSegment = fc.oneof(
  words,
  words.map((w) => `**${w}**`),
  words.map((w) => `\n\n## ${w}\n\n`),
  words.map((w) => `\n- ${w}`),
  fc.constant('\n\n'),
  fc.tuple(words, url).map(([t, u]) => `[${t}](${u})`),
  url.map((u) => `<${u}>`),
  fc.tuple(words, url).map(([t, u]) => `\`[${t}](${u})\``) // inside code: must never change
);
const mdDoc = fc.array(mdSegment, { minLength: 1, maxLength: 25 }).map((s) => s.join(' ') + '\n');

const verdictsFor = (links: ExtractedLink[], statuses: Status[]) =>
  links.map((link, i): Pick<CheckResult, 'linkId' | 'status' | 'reason' | 'archived'> => {
    const status = statuses[i % statuses.length]!;
    return {
      linkId: link.id,
      status,
      reason: `reason ${i}`,
      ...(status === 'ghost'
        ? { archived: { url: archiveFor(link.originalUrl, i), timestamp: '2019-05-01T00:00:00.000Z', originalTimestamp: '20190501000000', statusCode: '200', mimeType: 'text/html' } }
        : {}),
    };
  });

const statusesArb = fc.array(fc.constantFrom(...STATUSES), { minLength: 1, maxLength: 8 });

describe('Markdown export properties', () => {
  test('outside changed links, the document is byte-for-byte identical', async () => {
    await fc.assert(
      fc.asyncProperty(mdDoc, statusesArb, async (doc, statuses) => {
        const links = await extractLinksFromMarkdown(doc);
        const verdicts = verdictsFor(links, statuses);
        const { rules, stats } = buildReplacementMap(links, verdicts);
        const out = exportMarkdown(doc, links, rules, stats, NOW);

        // Undo exactly what the exporter is allowed to do...
        let body = out.slice(0, out.lastIndexOf('\n\n---\n\n'));
        for (const marker of Object.values(MARKERS)) body = body.split(marker).join('');
        body = body.replace(/\[\^necrolink-\d+\]/g, '');
        for (const rule of rules) if (rule.newUrl) body = body.replace(rule.newUrl, rule.originalUrl);

        // ...and the original must come back
        expect(body).toBe(doc.replace(/\s*$/, ''));
      }),
      { numRuns: 500 }
    );
  });

  test('lost and zombie URLs are kept; ghost URLs are replaced; footnotes are 1..n in order', async () => {
    await fc.assert(
      fc.asyncProperty(mdDoc, statusesArb, async (doc, statuses) => {
        const links = await extractLinksFromMarkdown(doc);
        const verdicts = verdictsFor(links, statuses);
        const { rules, stats } = buildReplacementMap(links, verdicts);
        const out = exportMarkdown(doc, links, rules, stats, NOW);
        const body = out.slice(0, out.lastIndexOf('\n\n---\n\n'));

        for (const rule of rules) {
          if (rule.type === 'ghost') expect(body).toContain(rule.newUrl);
          else expect(body).toContain(rule.originalUrl);
        }

        const refs = [...body.matchAll(/\[\^necrolink-(\d+)\]/g)].map((m) => Number(m[1]));
        expect(refs).toEqual(refs.map((_, i) => i + 1));
        expect(refs.length).toBe(stats.zombies + stats.lost);
      }),
      { numRuns: 500 }
    );
  });
});

describe('HTML export properties', () => {
  const htmlLink = fc.tuple(words, url).map(([t, u]) => `<a href="${u}">${t}</a>`);
  const htmlDoc = fc
    .array(fc.oneof(words, htmlLink, words.map((w) => `<p>${w}</p>`), fc.constant('<a href="mailto:x@y.z">m</a>')), { minLength: 1, maxLength: 20 })
    .map((parts) => `<div>${parts.join(' ')}</div>`);

  test('every link gets exactly its own verdict; lost/zombie hrefs never change', async () => {
    await fc.assert(
      fc.asyncProperty(htmlDoc, statusesArb, async (doc, statuses) => {
        const links = await extractLinksFromHTML(doc);
        const verdicts = verdictsFor(links, statuses);
        const { rules, stats } = buildReplacementMap(links, verdicts);
        const $ = cheerio.load(exportHtml(doc, links, rules, stats, NOW), null, false);

        const checked = $('a[href]').filter((_, a) => !/^(mailto:|#)/.test($(a).attr('href') ?? '') && $(a).closest('#necrolink-footer, #necrolink-notes, sup').length === 0);
        expect(checked.length).toBe(links.length);
        checked.each((i, a) => {
          const status = verdicts[i]!.status;
          const href = $(a).attr('href');
          if (status === 'ghost') expect(href).toBe(archiveFor(links[i]!.originalUrl, i));
          else expect(href).toBe(links[i]!.originalUrl);
          expect($(a).attr('data-necrolink')).toBe(['ghost', 'zombie', 'lost'].includes(status) ? status : undefined);
        });
        expect($('a a').length).toBe(0);
      }),
      { numRuns: 300 }
    );
  });
});
