// @vitest-environment node
/**
 * Unit tests for spec 04 export: replacement map, Markdown, HTML and report.
 */

import { describe, test, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { extractLinksFromMarkdown } from '@/lib/extractors/markdown';
import { extractLinksFromHTML } from '@/lib/extractors/html';
import { buildReplacementMap, isArchiveUrl } from '@/lib/exporters/replacement-map';
import { exportMarkdown, escapeMarkdown } from '@/lib/exporters/markdown';
import { exportHtml } from '@/lib/exporters/html';
import { exportReport } from '@/lib/exporters/report';
import type { CheckResult, ExtractedLink } from '@/types/link';

const NOW = new Date('2026-11-17T12:00:00Z');
const ARCHIVE = (url: string, ts = '20190501000000') => `https://web.archive.org/web/${ts}/${url}`;

type Verdict = Pick<CheckResult, 'linkId' | 'status' | 'reason' | 'archived'>;
const ghost = (linkId: string, url: string, ts?: string): Verdict => ({
  linkId,
  status: 'ghost',
  reason: 'Page not found (404)',
  archived: { url: ARCHIVE(url, ts), timestamp: '2019-05-01T00:00:00.000Z', originalTimestamp: ts ?? '20190501000000', statusCode: '200', mimeType: 'text/html' },
});
const zombie = (linkId: string, reason = 'Redirects to a different site (casino.example.net)'): Verdict => ({ linkId, status: 'zombie', reason });
const lost = (linkId: string): Verdict => ({ linkId, status: 'lost', reason: 'The domain no longer exists' });
const living = (linkId: string): Verdict => ({ linkId, status: 'living', reason: 'The page loads' });

async function md(content: string, verdicts: (links: ExtractedLink[]) => Verdict[]) {
  const links = await extractLinksFromMarkdown(content);
  const { rules, stats } = buildReplacementMap(links, verdicts(links));
  return exportMarkdown(content, links, rules, stats, NOW);
}

async function html(content: string, verdicts: (links: ExtractedLink[]) => Verdict[]) {
  const links = await extractLinksFromHTML(content);
  const { rules, stats } = buildReplacementMap(links, verdicts(links));
  return exportHtml(content, links, rules, stats, NOW);
}

describe('buildReplacementMap', () => {
  const links = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, originalUrl: `https://${id}.example.com/` }));

  test('one rule per changed link, footnotes shared across zombies and lost souls', () => {
    const { rules, stats } = buildReplacementMap(links, [
      zombie('a'),
      ghost('b', 'https://b.example.com/'),
      lost('c'),
      living('d'),
      zombie('e'),
    ]);
    expect(rules.map((r) => [r.linkId, r.type, r.footnote])).toEqual([
      ['a', 'zombie', 1],
      ['b', 'ghost', undefined],
      ['c', 'lost', 2],
      ['e', 'zombie', 3],
    ]);
    expect(stats).toEqual({ ghosts: 1, zombies: 2, lost: 1, unchanged: 1 });
  });

  test('a ghost without a genuine archive URL is left unchanged', () => {
    const fake = { ...ghost('a', 'x'), archived: { ...ghost('a', 'x').archived!, url: 'javascript:alert(1)' } };
    expect(buildReplacementMap(links, [fake]).rules).toEqual([]);
  });

  test.each([
    ['https://web.archive.org/web/20190501000000/https://x.example/', true],
    ['https://web.archive.org/web/20190501000000id_/https://x.example/', true],
    ['http://web.archive.org/web/20190501000000/https://x.example/', false],
    ['https://web.archive.org.evil.example/web/2019/x', false],
    ['javascript:alert(1)', false],
    [42, false],
  ])('isArchiveUrl(%s) → %s', (url, ok) => {
    expect(isArchiveUrl(url)).toBe(ok);
  });
});

describe('exportMarkdown', () => {
  test('ghost: URL swapped for the archive copy, marked, rest untouched', async () => {
    const out = await md('See [the study](https://dead.example.com/study) for *details*.\n', (l) => [ghost(l[0]!.id, 'https://dead.example.com/study')]);
    expect(out).toContain(`See [👻→⏮️ the study](${ARCHIVE('https://dead.example.com/study')}) for *details*.`);
    expect(out).not.toContain('(https://dead.example.com/study)');
  });

  test('zombie and lost soul: URL kept, marked, namespaced footnotes with notes section', async () => {
    const out = await md('A [z](https://z.example.com) and [l](https://l.example.com).\n', (l) => [zombie(l[0]!.id), lost(l[1]!.id)]);
    expect(out).toContain('A [🧟 z](https://z.example.com)[^necrolink-1] and [🪦 l](https://l.example.com)[^necrolink-2].');
    expect(out).toContain('## 🪦 Necrolink Notes');
    expect(out).toContain('[^necrolink-1]: 🧟 This link may have changed: Redirects to a different site (casino.example.net)');
    expect(out).toContain('[^necrolink-2]: 🪦 Lost soul: This link is dead and the Internet Archive has no copy. Find another source.');
  });

  test("does not collide with the author's own footnotes", async () => {
    const out = await md('Claim[^1] with [z](https://z.example.com).\n\n[^1]: Author note.\n', (l) => [zombie(l[0]!.id)]);
    expect(out).toContain('[^1]: Author note.');
    expect(out).toContain('[^necrolink-1]');
  });

  test('links inside code are never changed', async () => {
    const doc = 'Real [x](https://x.example.com).\n\n```\n[x](https://x.example.com)\n```\n\n`https://x.example.com`\n';
    const out = await md(doc, (l) => l.map((link) => ghost(link.id, link.originalUrl)));
    expect(out).toContain('```\n[x](https://x.example.com)\n```');
    expect(out).toContain('`https://x.example.com`');
  });

  test('reference link ghost becomes an inline link; the shared definition is untouched', async () => {
    const doc = 'Dead [one][ref] and live [two][ref].\n\n[ref]: https://shared.example.com/page\n';
    const out = await md(doc, (l) => [ghost(l[0]!.id, 'https://shared.example.com/page'), living(l[1]!.id)]);
    expect(out).toContain(`Dead [👻→⏮️ one](${ARCHIVE('https://shared.example.com/page')}) and live [two][ref].`);
    expect(out).toContain('[ref]: https://shared.example.com/page');
  });

  test('angle-bracket autolinks', async () => {
    const out = await md('Visit <https://dead.example.com/x> now.\n', (l) => [ghost(l[0]!.id, 'https://dead.example.com/x')]);
    expect(out).toContain(`Visit 👻→⏮️ <${ARCHIVE('https://dead.example.com/x')}> now.`);
  });

  test('the same URL cited twice can get different archive copies', async () => {
    const doc = '[a](https://same.example.com) and [b](https://same.example.com)\n';
    const out = await md(doc, (l) => [ghost(l[0]!.id, 'https://same.example.com', '20100101000000'), ghost(l[1]!.id, 'https://same.example.com', '20200101000000')]);
    expect(out.indexOf('20100101000000')).toBeLessThan(out.indexOf('20200101000000'));
  });

  test('escapes notes so page titles cannot inject Markdown or HTML', async () => {
    const out = await md('[z](https://z.example.com)\n', (l) => [zombie(l[0]!.id, 'Now titled <script>alert(1)</script> [click](javascript:x)')]);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; \\[click\\](javascript:x)');
    expect(out).not.toContain('<script>');
  });

  test('footer with date and counts; links the repo, not an unowned domain', async () => {
    const out = await md('[x](https://x.example.com)\n', (l) => [living(l[0]!.id)]);
    expect(out).toMatch(/\*Fixed by \[Necrolink\]\(https:\/\/github\.com\/oscaroguledo\/Necrolink\) on 2026-11-17: 0 ghosts resurrected, 0 zombies flagged, 0 lost souls\.\*\n$/);
    expect(out).not.toContain('necrolink.dev');
    expect(out).not.toContain('Necrolink Notes');
  });

  test('escapeMarkdown', () => {
    expect(escapeMarkdown('a*b_c`d[e]f<g>h#i|j\\k')).toBe('a\\*b\\_c\\`d\\[e\\]f&lt;g&gt;h\\#i\\|j\\\\k');
  });
});

describe('exportHtml', () => {
  const page = `<!DOCTYPE html><html><head><title>Refs</title></head><body>
    <p>Read <a href="https://dead.example.com/a">the paper</a>, <a href="https://z.example.com">this</a> and <a href="https://l.example.com">that</a>.</p>
    <a href="mailto:x@example.com">mail</a>
  </body></html>`;
  const verdicts = (l: ExtractedLink[]) => [ghost(l[0]!.id, 'https://dead.example.com/a'), zombie(l[1]!.id), lost(l[2]!.id)];

  test('ghost: href swapped, original kept in a data attribute, marked', async () => {
    const $ = cheerio.load(await html(page, verdicts));
    const a = $('a[data-necrolink="ghost"]');
    expect(a.attr('href')).toBe(ARCHIVE('https://dead.example.com/a'));
    expect(a.attr('data-necrolink-original')).toBe('https://dead.example.com/a');
    expect(a.text()).toBe('👻→⏮️ the paper');
    expect(a.attr('title')).toMatch(/Archived copy from 2019-05-01/);
  });

  test('zombie and lost: href kept, footnote reference placed after the link (no nested <a>)', async () => {
    const $ = cheerio.load(await html(page, verdicts));
    expect($('a[data-necrolink="zombie"]').attr('href')).toBe('https://z.example.com');
    expect($('a[data-necrolink="lost"]').attr('href')).toBe('https://l.example.com');
    expect($('a a').length).toBe(0);
    expect($('a[data-necrolink="zombie"]').next('sup.necrolink-ref').find('a').attr('href')).toBe('#necrolink-note-1');
    expect($('#necrolink-note-2').text()).toMatch(/^🪦 Lost soul: /);
  });

  test('escapes notes (no stored XSS from page titles)', async () => {
    const out = await html('<p><a href="https://z.example.com">z</a></p>', (l) => [zombie(l[0]!.id, 'Now <img src=x onerror=alert(1)>')]);
    const $ = cheerio.load(out);
    expect($('img').length).toBe(0);
    expect($('#necrolink-note-1').text()).toContain('<img src=x onerror=alert(1)>');
  });

  test('fragments stay fragments; footer links the repo', async () => {
    const out = await html('<p><a href="https://x.example.com">x</a></p>', (l) => [living(l[0]!.id)]);
    expect(out).not.toMatch(/<html|<body/);
    expect(out).toContain('https://github.com/oscaroguledo/Necrolink');
    expect(out).toContain('0 ghosts resurrected, 0 zombies flagged, 0 lost souls');
  });

  test('skipped links (mailto) do not shift the matching', async () => {
    const out = await html('<a href="mailto:a@b.c">m</a><a href="https://z.example.com">z</a>', (l) => [zombie(l[0]!.id)]);
    expect(cheerio.load(out)('a[data-necrolink="zombie"]').attr('href')).toBe('https://z.example.com');
  });
});

describe('exportReport', () => {
  const links = [
    { id: 'g', originalUrl: 'https://dead.example.com/a', text: 'Paper | one', position: { page: 2, offset: 0 } },
    { id: 'z', originalUrl: 'https://z.example.com', text: 'Zed', position: { page: 3, offset: 0 } },
    { id: 'l', originalUrl: 'https://l.example.com', text: 'Gone', position: { page: 3, offset: 9 } },
    { id: 'v', originalUrl: 'https://ok.example.com', text: 'OK', position: { page: 4, offset: 0 } },
  ];
  const report = exportReport('paper.pdf', links, [ghost('g', 'https://dead.example.com/a'), zombie('z'), lost('l'), living('v')], NOW);

  test('summarises counts and sections', () => {
    expect(report).toContain('# 🪦 Necrolink report: paper.pdf');
    expect(report).toContain('4 links · 👻 1 resurrected · 🧟 1 zombies · 🪦 1 lost · 🕯️ 1 living');
    expect(report).toContain('## 👻 Ghosts');
    expect(report).toContain('## 🧟 Zombies');
    expect(report).toContain('## 🪦 Lost souls');
    expect(report).toContain('## 🕯️ Living: 1 links still work');
  });

  test('rows have page, escaped text and archive link', () => {
    expect(report).toContain(`| p. 2 | Paper \\| one | <https://dead.example.com/a> | [2019-05-01](${ARCHIVE('https://dead.example.com/a')}) |`);
  });
});
