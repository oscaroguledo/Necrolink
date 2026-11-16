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

export type PdfErrorCode = 'ENCRYPTED' | 'PARSE_ERROR';

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
 * @throws PdfExtractionError with code ENCRYPTED or PARSE_ERROR
 *
 * @example
 * ```typescript
 * const links = await extractLinksFromPDF(await readFile('paper.pdf'));
 * // => [{ id: 'link_1', url: 'https://archive.org/web', text: 'the Internet Archive',
 * //       position: { page: 1, offset: 5 }, ... }]
 * ```
 */
export async function extractLinksFromPDF(
  data: Uint8Array | ArrayBuffer
): Promise<ExtractedLink[]> {
  // pdf.js detaches the buffer it is given, so pass a copy
  const bytes = new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : data.slice());
  if (bytes.length === 0) {
    return [];
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      // Security: pdf.js < 4.2.67 can run attacker-controlled JS via font
      // compilation (CVE-2024-4367). Disabling eval closes that hole.
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch (error) {
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
    const links: ExtractedLink[] = [];
    let linkIndex = 1;

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
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
    throw new PdfExtractionError('PARSE_ERROR', 'This PDF could not be fully read.');
  } finally {
    await doc.destroy();
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
