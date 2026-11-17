/**
 * PDF link extraction using pdfjs-dist.
 * Extracts URLs from PDF text content with page number tracking.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { normalizeUrl } from './url-normalizer';
import { generateId } from '../utils';
import { extractCitationDate } from './date-parser';

// Configure PDF.js worker for Node.js environment
if (typeof window === 'undefined') {
  // In Node.js/test environment, use the legacy build which doesn't require a separate worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');
}

export type PdfErrorCode = 'ENCRYPTED' | 'PARSE_ERROR' | 'TIMEOUT' | 'TOO_MANY_PAGES';

export interface PdfExtractOptions {
  maxPages?: number;
  signal?: AbortSignal;
}

export class PdfExtractionError extends Error {
  constructor(
    public code: PdfErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

export interface ExtractedLink {
  id: string;
  url: string;
  originalUrl: string;
  text: string;
  position: {
    page?: number;
    offset: number;
  };
  context: string;
  citationDate?: Date;
}

// Comprehensive URL regex pattern
const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

/**
 * Extract all links from PDF content
 * 
 * @param buffer - PDF file buffer
 * @param options - Extraction options
 * @returns Array of extracted links with metadata
 * 
 * @example
 * ```typescript
 * const buffer = await readFile('paper.pdf');
 * const links = await extractLinksFromPDF(buffer);
 * // => [{ id: 'link_1', url: 'https://...', page: 3, ... }]
 * ```
 */
export async function extractLinksFromPDF(
  buffer: ArrayBuffer | Uint8Array,
  options: PdfExtractOptions = {}
): Promise<ExtractedLink[]> {
  if (!buffer || buffer.byteLength === 0) {
    return [];
  }

  const maxPages = options.maxPages ?? 1000;

  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    
    // Check for too many pages
    if (pdf.numPages > maxPages) {
      await pdf.destroy();
      throw new PdfExtractionError(
        'TOO_MANY_PAGES',
        `This PDF has ${pdf.numPages} pages. Maximum allowed is ${maxPages}.`
      );
    }
    
    const links: ExtractedLink[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      // Check for abort signal
      if (options.signal?.aborted) {
        await pdf.destroy();
        throw new PdfExtractionError('TIMEOUT', 'PDF processing was cancelled.');
      }
      
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine all text items into page text
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      // Find all URLs in the page text
      const matches = pageText.matchAll(URL_REGEX);
      
      for (const match of matches) {
        const url = match[0];
        const offset = match.index || 0;
        
        // Extract context (50 chars before and after)
        const contextStart = Math.max(0, offset - 50);
        const contextEnd = Math.min(pageText.length, offset + url.length + 50);
        let context = pageText.substring(contextStart, contextEnd).trim();
        
        // Add ellipsis if truncated
        if (contextStart > 0) context = '...' + context;
        if (contextEnd < pageText.length) context = context + '...';
        
        // Extract link text (use URL itself as text for PDFs)
        const text = url;
        
        links.push({
          id: generateId(),
          url: normalizeUrl(url),
          originalUrl: url,
          text,
          position: {
            page: pageNum,
            offset,
          },
          context,
          citationDate: extractCitationDate(context),
        });
      }
    }
    
    // Clean up
    await pdf.destroy();
    
    return links;
  } catch (error) {
    // Re-throw PdfExtractionError as-is
    if (error instanceof PdfExtractionError) {
      throw error;
    }
    
    // Handle pdfjs-dist specific errors
    if (error && typeof error === 'object' && 'name' in error) {
      const pdfError = error as { name: string; message?: string };
      
      // Password-protected PDFs
      if (pdfError.name === 'PasswordException') {
        throw new PdfExtractionError('ENCRYPTED', 'This PDF is password-protected.');
      }
      
      // Invalid PDF structure
      if (pdfError.name === 'InvalidPDFException' || pdfError.name === 'UnknownErrorException') {
        throw new PdfExtractionError('PARSE_ERROR', 'This PDF is corrupted or invalid.');
      }
    }
    
    // Generic error
    console.error('Error extracting links from PDF:', error);
    throw new PdfExtractionError('PARSE_ERROR', 'Failed to extract links from PDF.');
  }
}

/**
 * Extract links from PDF with annotation support
 * 
 * This version also extracts link annotations (clickable links embedded in PDF)
 * in addition to visible URLs in the text.
 * 
 * @param buffer - PDF file buffer
 * @returns Array of extracted links including annotations
 */
export async function extractLinksFromPDFWithAnnotations(
  buffer: ArrayBuffer | Uint8Array
): Promise<ExtractedLink[]> {
  const textLinks = await extractLinksFromPDF(buffer);
  
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    const annotationLinks: ExtractedLink[] = [];
    
    // Extract link annotations from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const annotations = await page.getAnnotations();
      
      for (const annotation of annotations) {
        // Check if it's a link annotation
        if (annotation.subtype === 'Link' && annotation.url) {
          const url = annotation.url;
          
          // Skip if it's not an http(s) URL
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            continue;
          }
          
          annotationLinks.push({
            id: generateId(),
            url: normalizeUrl(url),
            originalUrl: url,
            text: url, // Annotations don't have visible text
            position: {
              page: pageNum,
              offset: 0,
            },
            context: `Link annotation on page ${pageNum}`,
            citationDate: undefined, // Annotations don't have context for date extraction
          });
        }
      }
    }
    
    await pdf.destroy();
    
    // Merge text links and annotation links, removing duplicates
    const allLinks = [...textLinks, ...annotationLinks];
    const uniqueLinks = deduplicateLinks(allLinks);
    
    return uniqueLinks;
  } catch (error) {
    // If annotation extraction fails, return text links only
    console.warn('Could not extract PDF annotations:', error);
    return textLinks;
  }
}

/**
 * Remove duplicate links (same URL and page)
 */
function deduplicateLinks(links: ExtractedLink[]): ExtractedLink[] {
  const seen = new Set<string>();
  const unique: ExtractedLink[] = [];
  
  for (const link of links) {
    const key = `${link.url}:${link.position.page || 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(link);
    }
  }
  
  return unique;
}
