/**
 * Main-content extraction and page-type signals for zombie detection (spec 03).
 */

import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface PageContent {
  title: string;
  /** Main text, whitespace-collapsed, at most MAX_TEXT_CHARS. */
  text: string;
  /** False when Readability found no article and body text was used. */
  usedReadability: boolean;
}

export const MAX_TEXT_CHARS = 20_000;
const MIN_ARTICLE_CHARS = 200;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Extract the title and main text of a page (Readability, falling back to
 * body text without nav/header/footer/scripts).
 *
 * Security: the HTML is untrusted. jsdom runs no scripts and loads no
 * subresources unless `runScripts` / `resources` are set; keep them unset.
 */
export function extractMainContent(html: string, url: string): PageContent {
  const virtualConsole = new VirtualConsole(); // swallow CSS/HTML parse noise
  const dom = new JSDOM(html, { url: safeDocumentUrl(url), virtualConsole });
  const document = dom.window.document;
  const title = clean(document.title);

  try {
    const article = new Readability(document.cloneNode(true) as Document).parse();
    const text = clean(article?.textContent);
    if (article && text.length >= MIN_ARTICLE_CHARS) {
      return { title: clean(article.title) || title, text: text.slice(0, MAX_TEXT_CHARS), usedReadability: true };
    }
  } catch {
    // fall through to body text
  }

  document.querySelectorAll('script, style, noscript, template, nav, header, footer, aside').forEach((el) => el.remove());
  const text = clean(document.body?.textContent);
  dom.window.close();
  return { title, text: text.slice(0, MAX_TEXT_CHARS), usedReadability: false };
}

function safeDocumentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : 'https://invalid.example/';
  } catch {
    return 'https://invalid.example/';
  }
}

const PARKED_PATTERNS: Array<[RegExp, string]> = [
  [/\b(this |the )?domain (name )?(is|may be|might be) (for sale|available)\b/i, 'says the domain is for sale'],
  [/\bbuy (this|the) domain\b/i, 'offers to sell the domain'],
  [/\b(this )?domain (has been |is )?(registered|parked)\b.{0,60}\b(godaddy|namecheap|sedo|bodis|parking)/i, 'is a registrar parking page'],
  [/\b(this (web ?page|website|domain) is parked|parked free|domain parking)\b/i, 'is a parked domain'],
  [/\b(hugedomains|dan\.com|afternic|sedo\.com|undeveloped\.com)\b/i, 'is listed by a domain reseller'],
  [/\bthe domain .{0,40} has expired\b/i, 'says the domain has expired'],
  [/\baccount (has been )?suspended\b/i, 'shows a suspended hosting account'],
];

const SPAM_PATTERN =
  /\b(online casino|casino bonus|slot (machine|games?)|sports betting|poker online|judi online|togel|viagra|cialis|replica watches|payday loans?|escort service)\b/gi;

/** Why the page looks like a parked / for-sale / suspended domain, if it does. */
export function detectParkedPage(page: PageContent): string | undefined {
  const haystack = `${page.title} ${page.text.slice(0, 5000)}`;
  for (const [pattern, why] of PARKED_PATTERNS) {
    if (pattern.test(haystack)) return why;
  }
  return undefined;
}

/** Distinct spam terms (gambling, pharma, ...) on the page. */
export function spamTerms(page: PageContent): string[] {
  const found = `${page.title} ${page.text}`.toLowerCase().match(SPAM_PATTERN) ?? [];
  return [...new Set(found)];
}
