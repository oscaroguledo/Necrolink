/**
 * HTML export (spec 04): rewrite a page with resurrected links.
 *
 * Security: notes contain text from arbitrary websites (zombie reasons quote
 * page titles), so every inserted string is set with cheerio .text()/.attr(),
 * which escapes it. (The spec sketch interpolated it into HTML: stored XSS in
 * the user's exported file.) Footnote references go AFTER the link, not inside
 * it, because an <a> inside an <a> is invalid HTML.
 */

import * as cheerio from 'cheerio';
import type { ExtractedLink } from '@/types/link';
import { ruleCursor, summaryLine, NECROLINK_URL, type ReplacementRule, type ExportStats } from './replacement-map';

const SKIP_SCHEME = /^(mailto:|tel:|javascript:|data:|#)/i;
const MARKER = { ghost: '👻→⏮️', zombie: '🧟', lost: '🪦' } as const;
const MARKER_TITLE = {
  ghost: 'Resurrected from the Internet Archive',
  zombie: 'This page may have changed since it was cited',
  lost: 'Dead link, no archived copy',
} as const;

export function exportHtml(
  html: string,
  links: Pick<ExtractedLink, 'id' | 'originalUrl'>[],
  rules: ReplacementRule[],
  stats: ExportStats,
  now: Date = new Date()
): string {
  const isFullDocument = /<html[\s>]|<body[\s>]|<!doctype/i.test(html);
  const $ = cheerio.load(html, null, isFullDocument);
  const cursor = ruleCursor(links, rules);
  const notes: Array<{ n: number; type: 'zombie' | 'lost'; text: string }> = [];

  // Same order and filters as the HTML extractor, so occurrences line up
  $('a[href]').each((_, element) => {
    const $a = $(element);
    const href = $a.attr('href')?.trim();
    if (!href || SKIP_SCHEME.test(href)) return;

    const rule = cursor.next(href);
    if (!rule) return;

    const marker = $('<span>').addClass('necrolink-marker').attr('title', MARKER_TITLE[rule.type]).text(MARKER[rule.type]);
    $a.prepend(' ').prepend(marker);
    $a.attr('data-necrolink', rule.type);

    if (rule.type === 'ghost') {
      $a.attr('href', rule.newUrl!);
      $a.attr('data-necrolink-original', rule.originalUrl);
      if (rule.archivedAt) $a.attr('title', `Archived copy from ${rule.archivedAt.slice(0, 10)} (original: ${rule.originalUrl})`);
      return;
    }

    const n = rule.footnote!;
    const ref = $('<sup>').addClass('necrolink-ref').append($('<a>').attr('href', `#necrolink-note-${n}`).text(`[${n}]`));
    $a.after(ref);
    notes.push({ n, type: rule.type, text: rule.note ?? '' });
  });

  // Fragments have no <body>; append at the root instead
  const append = (content: string | ReturnType<typeof $>) => {
    if ($('body').length > 0) $('body').append(content);
    else $.root().append(content);
  };
  append('\n<hr>\n');
  if (notes.length > 0) {
    const list = $('<ol>');
    for (const note of notes) {
      const prefix = note.type === 'zombie' ? '🧟 This link may have changed: ' : '🪦 Lost soul: ';
      list.append($('<li>').attr('id', `necrolink-note-${note.n}`).attr('value', String(note.n)).text(prefix + note.text));
    }
    append($('<section>').attr('id', 'necrolink-notes').append($('<h2>').text('🪦 Necrolink Notes')).append(list));
  }

  const footer = $('<footer>').attr('id', 'necrolink-footer');
  const line = $('<p>').append($('<em>').append('Fixed by ').append($('<a>').attr('href', NECROLINK_URL).text('Necrolink')).append(` on ${now.toISOString().slice(0, 10)}: ${summaryLine(stats)}.`));
  append(footer.append(line));

  return $.html();
}
