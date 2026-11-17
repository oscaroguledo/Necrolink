/**
 * HTML link extraction using cheerio.
 * Extracts <a href> links, resolves relative URLs, and normalizes.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { normalizeUrl, resolveUrl, isAbsoluteUrl } from './url-normalizer';
import { extractCitationDate } from './date-parser';

import type { ExtractedLink } from '@/types/link';

// position.offset is the element index (cheerio has no character offsets)
export type { ExtractedLink };

/**
 * Extract all HTTP/HTTPS links from HTML content
 * 
 * @param html - HTML source text
 * @param baseUrl - Optional base URL for resolving relative links
 * @returns Array of extracted links with metadata
 * 
 * @example
 * ```typescript
 * const links = await extractLinksFromHTML(`
 *   <p>Visit <a href="https://example.com">Example</a> for details.</p>
 * `);
 * // => [{ id: 'link_1', url: 'https://example.com/', ... }]
 * ```
 */
export async function extractLinksFromHTML(
  html: string,
  baseUrl?: string
): Promise<ExtractedLink[]> {
  // Handle empty input
  if (!html || html.trim() === '') {
    return [];
  }

  try {
    const $ = cheerio.load(html);
    const links: ExtractedLink[] = [];
    let linkIndex = 1;

    // Detect base URL from <base> tag if present
    const baseTag = $('base[href]').first();
    const detectedBase = baseTag.length > 0 ? baseTag.attr('href') : undefined;
    
    // Prefer passed baseUrl over detected base
    const effectiveBase = baseUrl || detectedBase;

    // Select all anchor elements with href attribute
    $('a[href]').each((index, element) => {
      const $elem = $(element);
      const href = $elem.attr('href')?.trim();

      // Skip if href is empty or undefined
      if (!href) {
        return;
      }

      const lowerHref = href.toLowerCase();

      // Skip special schemes
      if (
        lowerHref.startsWith('mailto:') ||
        lowerHref.startsWith('tel:') ||
        lowerHref.startsWith('javascript:') ||
        lowerHref.startsWith('data:')
      ) {
        return;
      }

      // Skip fragment-only links
      if (href.startsWith('#')) {
        return;
      }

      // Resolve relative and protocol-relative URLs
      let resolvedUrl = href;
      if (!isAbsoluteUrl(href)) {
        if (effectiveBase) {
          resolvedUrl = resolveUrl(href, effectiveBase);
        } else if (href.startsWith('//')) {
          resolvedUrl = 'https:' + href;
        }
      }

      // Only HTTP(S) links can be checked. This also drops relative links
      // with no base URL, which normalizeUrl would otherwise turn into a
      // bogus host (e.g. "about.html" → "https://about.html/").
      if (!/^https?:\/\//i.test(resolvedUrl)) {
        return;
      }

      // Extract anchor text (cheerio handles nested elements automatically)
      const text = $elem.text().trim();
      const displayText = text || href; // fallback to href if no text

      // Extract context from parent element
      const context = extractContext($, $elem);

      // Normalize the URL
      const normalizedUrl = normalizeUrl(resolvedUrl);

      links.push({
        id: `link_${linkIndex++}`,
        url: normalizedUrl,
        originalUrl: href,
        text: displayText,
        position: {
          offset: index, // use element index as offset approximation
        },
        context,
        citationDate: extractCitationDate(context),
      });
    });

    return links;
  } catch (error) {
    console.warn('Failed to extract links from HTML:', error);
    return [];
  }
}

/**
 * Extract surrounding context from the parent element
 * 
 * @param $ - Cheerio instance
 * @param $elem - The anchor element
 * @returns Context string with surrounding text
 */
function extractContext(
  $: cheerio.CheerioAPI,
  $elem: cheerio.Cheerio<Element>
): string {
  // Find the closest block-level parent
  const blockParent = $elem.closest('p, li, td, th, blockquote, div, section, article, body').first();
  
  if (blockParent.length === 0) {
    // Fallback to element text if no block parent found
    return $elem.text().trim();
  }

  // Get full parent text
  const parentText = blockParent.text().trim();
  const linkText = $elem.text().trim();

  // If parent text is short enough, return it as-is
  if (parentText.length <= 150) {
    return parentText;
  }

  // Try to extract ~100 chars centered on the link
  const linkPosition = parentText.indexOf(linkText);
  
  if (linkPosition === -1) {
    // Link text not found in parent (edge case), return truncated parent
    return parentText.substring(0, 100) + '...';
  }

  // Calculate window around link text
  const beforeChars = 50;
  const afterChars = 50;
  
  const start = Math.max(0, linkPosition - beforeChars);
  const end = Math.min(parentText.length, linkPosition + linkText.length + afterChars);
  
  let context = parentText.substring(start, end).trim();
  
  // Add ellipsis if we truncated
  if (start > 0) {
    context = '...' + context;
  }
  if (end < parentText.length) {
    context = context + '...';
  }

  return context;
}
