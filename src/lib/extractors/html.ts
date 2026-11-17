/**
 * HTML link extraction using cheerio.
 * Extracts links from HTML documents with support for relative URL resolution.
 */

import * as cheerio from 'cheerio';
import { normalizeUrl, resolveUrl, isAbsoluteUrl } from './url-normalizer';
import { generateId } from '../utils';
import { extractCitationDate } from './date-parser';

export interface ExtractedLink {
  id: string;
  url: string;
  originalUrl: string;
  text: string;
  position: {
    offset: number;
  };
  context: string;
  citationDate?: Date;
}

/**
 * Extract all links from HTML content
 * 
 * @param html - HTML source text
 * @param baseUrl - Optional base URL for resolving relative links
 * @returns Array of extracted links with metadata
 * 
 * @example
 * ```typescript
 * const links = await extractLinksFromHTML(`
 *   <a href="https://example.com">Example</a>
 * `);
 * // => [{ id: 'link_1', url: 'https://example.com', ... }]
 * ```
 */
export async function extractLinksFromHTML(
  html: string,
  baseUrl?: string
): Promise<ExtractedLink[]> {
  if (!html || html.trim() === '') {
    return [];
  }

  try {
    const $ = cheerio.load(html);
    const links: ExtractedLink[] = [];

    // Check for <base> tag if no baseUrl provided
    if (!baseUrl) {
      const baseElement = $('base[href]');
      if (baseElement.length > 0) {
        baseUrl = baseElement.attr('href');
      }
    }

    // Extract all <a> elements with href attribute
    $('a[href]').each((index, element) => {
      const $elem = $(element);
      let href = $elem.attr('href');

      if (!href) return;

      // Skip special URL schemes
      if (
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:') ||
        href.startsWith('data:')
      ) {
        return;
      }

      const originalUrl = href;

      // Resolve relative URLs
      if (!isAbsoluteUrl(href) && baseUrl) {
        href = resolveUrl(href, baseUrl);
      }

      // Skip if still not absolute after resolution attempt
      if (!isAbsoluteUrl(href)) {
        return;
      }

      // Extract link text (handle nested HTML)
      const text = $elem.text().trim();

      // Extract surrounding context (50 chars before and after)
      const context = extractContext($, element);

      // Create extracted link
      links.push({
        id: generateId(),
        url: normalizeUrl(href),
        originalUrl,
        text,
        position: {
          offset: index,
        },
        context,
        citationDate: extractCitationDate(context),
      });
    });

    return links;
  } catch (error) {
    // Graceful error handling for malformed HTML
    console.error('Error extracting links from HTML:', error);
    return [];
  }
}

/**
 * Extract surrounding context text for a link element
 */
function extractContext(
  $: cheerio.CheerioAPI,
  element: cheerio.Element
): string {
  const $elem = $(element);
  
  // Get parent text content
  const parent = $elem.parent();
  if (!parent.length) return '';

  // Get all text from parent, which includes the link and surrounding text
  const parentText = parent.text();
  
  // Get just the link text
  const linkText = $elem.text();
  
  // Find link position in parent text
  const linkIndex = parentText.indexOf(linkText);
  if (linkIndex === -1) return parentText.substring(0, 100);

  // Extract 50 chars before and after
  const start = Math.max(0, linkIndex - 50);
  const end = Math.min(parentText.length, linkIndex + linkText.length + 50);
  
  let context = parentText.substring(start, end).trim();
  
  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < parentText.length) context = context + '...';
  
  return context;
}
