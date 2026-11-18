/**
 * PDF link extraction using pdfjs-dist.
 *
 * Finds two kinds of links on every page:
 * 1. Link annotations: the clickable areas a PDF stores separately from its
 *    text (anchor text can differ from the URL, e.g. "the Internet Archive").
 * 2. Plain-text URLs: URLs printed in the text but not clickable
 *    (common in reference lists).
 * A URL that is both visible and clickable is reported once.
 */

import { normalizeUrl } from './url-normalizer';
import { extractCitationDate } from './date-parser';

import type { ExtractedLink as BaseExtractedLink } from '@/types/link';

/** PDF links always carry a 1-based page number; offset is within that page's text. */
export interface ExtractedLink extends BaseExtractedLink {
  position: { page: number; offset: number };
}

export type PdfErrorCode = 'ENCRYPTED' | 'PARSE_ERROR' | 'TIMEOUT' | 'TOO_MANY_PAGES';

export interface PdfExtractOptions {
  /** Abort the parse (e.g. on timeout); throws PdfExtractionError('TIMEOUT'). */
  signal?: AbortSignal;
  /** Refuse PDFs with more pages than this, to bound memory and time. Default 1000. */
  maxPages?: number;
}

export const DEFAULT_MAX_PDF_PAGES = 1000;

/** Thrown when a PDF cannot be read, so the API can return a clear error code. */
export class PdfExtractionError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

const CONTEXT_CHARS = 50;

// http(s):// or www. followed by URL characters
const TEXT_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+/gi;

interface TextSpan {
  start: number; // offset in page text
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageLink {
  originalUrl: string;
  url: string;
  text: string;
  offset: number;
  end: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface PdfAnnotation {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
  rect?: number[];
}

/**
 * Extract all HTTP/HTTPS links from a PDF.
 *
 * @param data - PDF file contents
 * @returns Links in document order, with page numbers
 * @param options - Abort signal and page limit
 * @throws PdfExtractionError with code ENCRYPTED, PARSE_ERROR, TIMEOUT or TOO_MANY_PAGES
 *
 * @example
 * ```typescript
 * const links = await extractLinksFromPDF(await readFile('paper.pdf'));
 * // => [{ id: 'link_1', url: 'https://archive.org/web', text: 'the Internet Archive',
 * //       position: { page: 1, offset: 5 }, ... }]
 * ```
 */
export async function extractLinksFromPDF(
  data: Uint8Array | ArrayBuffer,
  options: PdfExtractOptions = {}
): Promise<ExtractedLink[]> {
  const { signal, maxPages = DEFAULT_MAX_PDF_PAGES } = options;
  const timedOut = () =>
    new PdfExtractionError('TIMEOUT', 'This PDF took too long to read. Try a smaller file.');
  if (signal?.aborted) throw timedOut();

  // pdf.js detaches the buffer it is given, so pass a copy
  const bytes = new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : data.slice());
  if (bytes.length === 0) {
    return [];
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  let doc;
  const loadingTask = pdfjs.getDocument({
      data: bytes,
      // Security: pdf.js < 4.2.67 could run attacker-controlled JS through
      // font compilation (CVE-2024-4367). pdf.js 6 no longer compiles code at
      // all (no eval / new Function; guarded by a test), so there is no
      // isEvalSupported option to set any more. Keep pdfjs-dist >= 4.2.67.
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
  });
  // Destroying the loading task stops pdf.js and rejects every pending promise
  const onAbort = () => void loadingTask.destroy();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    doc = await loadingTask.promise;
  } catch (error) {
    signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted) throw timedOut();
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') {
      throw new PdfExtractionError(
        'ENCRYPTED',
        'This PDF is password-protected. Remove the password and upload it again.'
      );
    }
    throw new PdfExtractionError('PARSE_ERROR', 'This file could not be read as a PDF.');
  }

  try {
    if (doc.numPages > maxPages) {
      throw new PdfExtractionError(
        'TOO_MANY_PAGES',
        `This PDF has ${doc.numPages} pages; the limit is ${maxPages}.`
      );
    }

    const links: ExtractedLink[] = [];
    let linkIndex = 1;

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      // pdf.js resolves through promise callbacks only, which Node runs before
      // timers and other requests. Yield once per page so a timeout can fire
      // and other requests are served while a long PDF is parsed.
      await new Promise((resolve) => setImmediate(resolve));
      if (signal?.aborted) throw timedOut();
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const annotations = (await page.getAnnotations()) as PdfAnnotation[];

      const { text, spans } = buildPageText(textContent.items as PdfTextItem[]);
      const pageLinks = linksFromAnnotations(annotations, spans);
      pageLinks.push(...linksFromText(text, pageLinks));
      pageLinks.sort((a, b) => a.offset - b.offset);

      for (const link of pageLinks) {
        const context = extractContext(text, link.offset, link.end);
        links.push({
          id: `link_${linkIndex++}`,
          url: link.url,
          originalUrl: link.originalUrl,
          text: link.text,
          position: { page: pageNumber, offset: link.offset },
          context,
          citationDate: extractCitationDate(context),
        });
      }

      page.cleanup();
    }

    return links;
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    if (signal?.aborted) throw timedOut();
    throw new PdfExtractionError('PARSE_ERROR', 'This PDF could not be fully read.');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await loadingTask.destroy();
  }
}

/**
 * Join a page's text items into one string, inserting line breaks where the
 * text moves to a new line, and remember where each item sits.
 */
function buildPageText(items: PdfTextItem[]): { text: string; spans: TextSpan[] } {
  let text = '';
  const spans: TextSpan[] = [];
  let lastY: number | undefined;

  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;

    if (lastY !== undefined && Math.abs(y - lastY) > 1 && text && !/\s$/.test(text)) {
      text += '\n';
    }

    spans.push({
      start: text.length,
      str: item.str,
      x,
      y,
      width: item.width,
      height: item.height || Math.abs(item.transform[3] ?? 0),
    });
    text += item.str;
    if (item.hasEOL && !/\s$/.test(text)) text += '\n';
    lastY = y;
  }

  return { text, spans };
}

/** Clickable URI annotations, with anchor text taken from the text under them. */
function linksFromAnnotations(annotations: PdfAnnotation[], spans: TextSpan[]): PageLink[] {
  const links: PageLink[] = [];

  for (const annot of annotations) {
    const href = annot.url ?? annot.unsafeUrl;
    if (annot.subtype !== 'Link' || !href || !/^https?:\/\//i.test(href)) continue;

    const anchor = textUnderRect(annot.rect, spans);
    links.push({
      originalUrl: href,
      url: normalizeUrl(href),
      text: anchor?.text || href,
      offset: anchor?.start ?? 0,
      end: anchor?.end ?? 0,
    });
  }

  return links;
}

/** Find the text covered by an annotation rectangle [x1, y1, x2, y2]. */
function textUnderRect(
  rect: number[] | undefined,
  spans: TextSpan[]
): { text: string; start: number; end: number } | undefined {
  if (!rect || rect.length < 4) return undefined;
  const [rx1, ry1, rx2, ry2] = rect as [number, number, number, number];
  const left = Math.min(rx1, rx2);
  const right = Math.max(rx1, rx2);
  const bottom = Math.min(ry1, ry2);
  const top = Math.max(ry1, ry2);

  let text = '';
  let start: number | undefined;
  let end = 0;

  for (const span of spans) {
    if (!span.str || span.width <= 0) continue;
    const midY = span.y + span.height / 2;
    if (midY < bottom || midY > top) continue;

    const spanRight = span.x + span.width;
    const overlapLeft = Math.max(left, span.x);
    const overlapRight = Math.min(right, spanRight);
    if (overlapRight <= overlapLeft) continue;

    // Approximate characters as evenly spaced to slice partially covered items
    const perChar = span.width / span.str.length;
    let from = Math.max(0, Math.round((overlapLeft - span.x) / perChar));
    let to = Math.min(span.str.length, Math.round((overlapRight - span.x) / perChar));
    // Proportional fonts make the estimate drift by a character or two,
    // so snap outward to whole words (link areas cover whole words).
    const isWordChar = (i: number) => i >= 0 && i < span.str.length && /\S/.test(span.str[i]!);
    while (from > 0 && isWordChar(from - 1) && isWordChar(from)) from--;
    while (to < span.str.length && isWordChar(to - 1) && isWordChar(to)) to++;
    if (to <= from) continue;

    if (start === undefined) start = span.start + from;
    text += (text ? ' ' : '') + span.str.slice(from, to).trim();
    end = span.start + to;
  }

  if (start === undefined || !text.trim()) return undefined;
  return { text: text.trim(), start, end };
}

/** Plain-text URLs, skipping any already reported as an annotation. */
function linksFromText(text: string, annotationLinks: PageLink[]): PageLink[] {
  const links: PageLink[] = [];

  for (const match of text.matchAll(TEXT_URL_PATTERN)) {
    const raw = trimTrailingPunctuation(match[0]);
    const offset = match.index ?? 0;
    const end = offset + raw.length;
    const absolute = /^www\./i.test(raw) ? `https://${raw}` : raw;
    const url = normalizeUrl(absolute);

    const duplicate = annotationLinks.some(
      (a) => a.url === url && (a.end === 0 || (offset < a.end && end > a.offset))
    );
    if (duplicate) continue;

    links.push({ originalUrl: raw, url, text: raw, offset, end });
  }

  return links;
}

/** Drop sentence punctuation and unbalanced closing brackets from a URL's end. */
function trimTrailingPunctuation(url: string): string {
  let result = url;
  for (;;) {
    const last = result.slice(-1);
    if (/[.,;:!?'"]/.test(last)) {
      result = result.slice(0, -1);
    } else if (last === ')' && count(result, '(') < count(result, ')')) {
      result = result.slice(0, -1);
    } else if (last === ']' && count(result, '[') < count(result, ']')) {
      result = result.slice(0, -1);
    } else {
      return result;
    }
  }
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/** ~50 chars either side of the link, on one line. */
function extractContext(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_CHARS);
  const to = Math.min(text.length, Math.max(end, start) + CONTEXT_CHARS);
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}
