/**
 * PDF link extraction using pdfjs-dist.
 * Extracts URLs from PDF text content with page number tracking.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { normalizeUrl } from './url-normalizer';
import { generateId } from '../utils';

// Configure PDF.js worker for Node.js environment
if (typeof window === 'undefined') {
  // In Node.js/test environment, use the legacy build which doesn't require a separate worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');
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
  buffer: ArrayBuffer | Uint8Array
): Promise<ExtractedLink[]> {
  if (!buffer || buffer.byteLength === 0) {
    return [];
  }

  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    const links: ExtractedLink[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
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
        });
      }
    }
    
    // Clean up
    await pdf.destroy();
    
    return links;
  } catch (error) {
    console.error('Error extracting links from PDF:', error);
    return [];
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
