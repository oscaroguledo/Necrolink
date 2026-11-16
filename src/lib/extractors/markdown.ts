/**
 * Markdown link extraction using unified and remark-parse.
 * Handles inline links, reference links, and autolinks.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Root, Link as LinkNode, Definition, Html, LinkReference } from 'mdast';
import type { Node } from 'unist';
import { normalizeUrl } from './url-normalizer';
import { extractCitationDate } from './date-parser';

export interface ExtractedLink {
  id: string; // stable unique ID
  url: string; // normalized URL
  originalUrl: string; // URL as found in markdown
  text: string; // link anchor text
  position: {
    line?: number; // 1-based line number
    offset: number; // character offset in source
  };
  context: string; // 50 chars of surrounding text
  citationDate?: Date;
}

/**
 * Extract all links from markdown content
 * 
 * @param content - Markdown source text
 * @returns Array of extracted links with metadata
 * 
 * @example
 * ```typescript
 * const links = await extractLinksFromMarkdown(`
 *   See [Example](https://example.com) for details.
 * `);
 * // => [{ id: 'link_1', url: 'https://example.com', ... }]
 * ```
 */
export async function extractLinksFromMarkdown(
  content: string
): Promise<ExtractedLink[]> {
  if (!content || content.trim() === '') {
    return [];
  }

  try {
    // Parse markdown to AST
    const tree = unified().use(remarkParse).parse(content) as Root;

    const links: ExtractedLink[] = [];
    const definitions = new Map<string, string>();
    let linkIndex = 1;

    // First pass: collect reference definitions
    visit(tree, 'definition', (node: Definition) => {
      if (node.identifier && node.url) {
        definitions.set(node.identifier.toLowerCase(), node.url);
      }
    });

    // Second pass: extract links and HTML nodes
    visit(tree, (node) => {
      // Handle markdown link nodes
      if (node.type === 'link') {
        const linkNode = node as LinkNode;
        const url = linkNode.url;

        // Skip empty URLs, fragments, and mailto links
        if (!url || url.startsWith('#') || url.startsWith('mailto:')) {
          return;
        }

        // Extract link text
        const text = extractTextFromNode(linkNode);

        // Get position
        const position = node.position;
        if (!position || !position.start) {
          return;
        }

        const line = position.start.line;
        const offset = position.start.offset ?? 0;

        // Extract context
        const context = extractContext(content, position.start.offset ?? 0, position.end?.offset ?? offset);

        // Normalize URL
        const normalizedUrl = normalizeUrl(url);

        links.push({
          id: `link_${linkIndex++}`,
          url: normalizedUrl,
          originalUrl: url,
          text: text || url,
          position: {
            line,
            offset,
          },
          context,
          citationDate: extractCitationDate(context),
        });
      }

      // Handle HTML autolinks like <https://example.com>
      if (node.type === 'html') {
        const htmlContent = (node as Html).value;
        const autolinkMatch = htmlContent.match(/^<(https?:\/\/[^>]+)>$/);

        if (autolinkMatch) {
          const url = autolinkMatch[1];
          if (!url) {
            return;
          }

          // Skip fragments and mailto
          if (url.startsWith('#') || url.startsWith('mailto:')) {
            return;
          }

          const position = node.position;
          if (!position || !position.start) {
            return;
          }

          const line = position.start.line;
          const offset = position.start.offset ?? 0;

          // Extract context
          const context = extractContext(content, position.start.offset ?? 0, position.end?.offset ?? offset);

          // Normalize URL
          const normalizedUrl = normalizeUrl(url);

          links.push({
            id: `link_${linkIndex++}`,
            url: normalizedUrl,
            originalUrl: url,
            text: url, // for autolinks, text is the URL itself
            position: {
              line,
              offset,
            },
            context,
            citationDate: extractCitationDate(context),
          });
        }
      }

      // Handle linkReference nodes (reference-style links)
      if (node.type === 'linkReference') {
        const linkRef = node as LinkReference;
        const identifier = linkRef.identifier?.toLowerCase();

        if (!identifier || !definitions.has(identifier)) {
          return;
        }

        const url = definitions.get(identifier)!;

        // Skip empty URLs, fragments, and mailto links
        if (!url || url.startsWith('#') || url.startsWith('mailto:')) {
          return;
        }

        // Extract link text
        const text = extractTextFromNode(linkRef);

        // Get position
        const position = node.position;
        if (!position || !position.start) {
          return;
        }

        const line = position.start.line;
        const offset = position.start.offset ?? 0;

        // Extract context
        const context = extractContext(content, position.start.offset ?? 0, position.end?.offset ?? offset);

        // Normalize URL
        const normalizedUrl = normalizeUrl(url);

        links.push({
          id: `link_${linkIndex++}`,
          url: normalizedUrl,
          originalUrl: url,
          text: text || url,
          position: {
            line,
            offset,
          },
          context,
          citationDate: extractCitationDate(context),
        });
      }
    });

    return links;
  } catch (error) {
    console.warn('Failed to extract links from markdown:', error);
    return [];
  }
}

/**
 * Extract text content from a node recursively
 */
function extractTextFromNode(node: Node | undefined): string {
  if (!node) return '';

  if (node.type === 'text' && 'value' in node) {
    return String(node.value ?? '');
  }

  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as Node[]).map(extractTextFromNode).join('');
  }

  return '';
}

/**
 * Extract surrounding context from markdown content
 * 
 * @param content - Full markdown content
 * @param startOffset - Start character offset
 * @param endOffset - End character offset
 * @returns 50 chars before and after the link
 */
function extractContext(
  content: string,
  startOffset: number,
  endOffset: number
): string {
  const beforeStart = Math.max(0, startOffset - 50);
  const afterEnd = Math.min(content.length, endOffset + 50);

  const before = content.slice(beforeStart, startOffset);
  const link = content.slice(startOffset, endOffset);
  const after = content.slice(endOffset, afterEnd);

  return (before + link + after).trim();
}
