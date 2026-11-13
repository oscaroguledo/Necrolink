# Spec: Link Extraction from Documents

**Status**: Draft  
**Created**: 2024-11-12  
**Owner**: Core Team

## Goal

Extract all URLs from uploaded documents (PDF, Markdown, HTML) with their surrounding context, preserving enough information to reconstruct the document with fixed links later.

## Success Criteria

1. Extract every clickable URL from a document
2. Capture the link text, position, and surrounding context
3. Handle relative URLs and normalize them to absolute form
4. Parse citation dates when available (for finding closest archived snapshot)
5. Return structured data that can be fed to the link checker

## Scope

### In Scope
- PDF files (via pdf-parse or similar)
- Markdown files (via remark ecosystem)
- HTML documents (via cheerio)
- Plain text URLs (as fallback)

### Out of Scope (for MVP)
- Word documents (.docx) — stretch goal
- BibTeX files — stretch goal
- PowerPoint/slides
- Images with embedded URLs

## Technical Approach

### PDF Extraction
```typescript
// src/lib/extractors/pdf.ts
import pdf from 'pdf-parse';

interface ExtractedLink {
  url: string;
  text: string;
  position: {
    page: number;
    offset: number;
  };
  context: string; // surrounding text
  date?: Date; // citation date if parseable
}

export async function extractLinksFromPDF(
  buffer: Buffer
): Promise<ExtractedLink[]> {
  const data = await pdf(buffer);
  
  // Strategy:
  // 1. Parse the PDF text content
  // 2. Find URL patterns with regex
  // 3. Extract surrounding context (50 chars before/after)
  // 4. Try to parse dates near each URL
  // 5. Track page numbers
  
  const links: ExtractedLink[] = [];
  const urlRegex = /https?:\/\/[^\s\)]+/gi;
  
  // TODO: Implement full extraction logic
  
  return links;
}
```

### Markdown Extraction
```typescript
// src/lib/extractors/markdown.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

export async function extractLinksFromMarkdown(
  content: string
): Promise<ExtractedLink[]> {
  const tree = unified()
    .use(remarkParse)
    .parse(content);
    
  const links: ExtractedLink[] = [];
  
  visit(tree, 'link', (node) => {
    links.push({
      url: node.url,
      text: extractText(node),
      position: {
        line: node.position?.start.line,
        offset: node.position?.start.offset
      },
      context: extractContext(content, node.position)
    });
  });
  
  return links;
}
```

### HTML Extraction
```typescript
// src/lib/extractors/html.ts
import * as cheerio from 'cheerio';

export async function extractLinksFromHTML(
  html: string
): Promise<ExtractedLink[]> {
  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];
  
  $('a[href]').each((i, elem) => {
    const $elem = $(elem);
    const href = $elem.attr('href');
    
    if (href && isAbsoluteUrl(href)) {
      links.push({
        url: href,
        text: $elem.text().trim(),
        position: { offset: i }, // approximate
        context: extractSurroundingText($elem)
      });
    }
  });
  
  return links;
}
```

### URL Normalization
```typescript
// src/lib/extractors/url-normalizer.ts

/**
 * Normalize URLs to a canonical form for comparison and deduplication.
 * Must be idempotent: normalize(normalize(url)) === normalize(url)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // 1. Lowercase protocol and domain
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // 2. Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }
    
    // 3. Remove trailing slash from path (except root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    // 4. Sort query parameters alphabetically
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(
      Array.from(params.entries()).sort()
    );
    parsed.search = sortedParams.toString();
    
    // 5. Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid'];
    trackingParams.forEach(param => sortedParams.delete(param));
    parsed.search = sortedParams.toString();
    
    // 6. Remove fragment (hash)
    parsed.hash = '';
    
    return parsed.toString();
  } catch (error) {
    // If parsing fails, return original
    return url;
  }
}
```

### Date Extraction
```typescript
// src/lib/extractors/date-parser.ts

/**
 * Try to extract a citation date from surrounding context.
 * Common patterns:
 * - "Retrieved June 15, 2023"
 * - "Accessed 2023-06-15"
 * - "(2023)"
 * - "Published: June 2023"
 */
export function extractCitationDate(context: string): Date | undefined {
  // Try ISO format first
  const isoMatch = context.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return new Date(isoMatch[0]);
  }
  
  // Try common citation formats
  const monthYear = context.match(/(?:Retrieved|Accessed|Published).*?(\w+ \d{1,2},? \d{4})/i);
  if (monthYear) {
    return new Date(monthYear[1]);
  }
  
  // Just a year in parentheses
  const yearMatch = context.match(/\((\d{4})\)/);
  if (yearMatch) {
    return new Date(`${yearMatch[1]}-01-01`);
  }
  
  return undefined;
}
```

## Testing Strategy

### Property-Based Tests

These are critical for the write-up. We want to catch bugs that manual tests would miss.

```typescript
// tests/property/url-normalization.test.ts
import fc from 'fast-check';
import { normalizeUrl } from '@/lib/extractors/url-normalizer';

describe('URL normalization properties', () => {
  test('is idempotent', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const once = normalizeUrl(url);
        const twice = normalizeUrl(once);
        expect(once).toBe(twice);
      })
    );
  });
  
  test('preserves domain and path semantics', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const normalized = normalizeUrl(url);
        const original = new URL(url);
        const result = new URL(normalized);
        
        expect(result.hostname).toBe(original.hostname);
        expect(result.pathname).toBe(original.pathname);
      })
    );
  });
  
  test('removes tracking parameters', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.constantFrom('utm_source', 'utm_medium', 'fbclid'),
        fc.string(),
        (url, param, value) => {
          const withTracking = `${url}${url.includes('?') ? '&' : '?'}${param}=${value}`;
          const normalized = normalizeUrl(withTracking);
          expect(normalized).not.toContain(param);
        }
      )
    );
  });
});
```

### Unit Tests
```typescript
// tests/unit/pdf-extractor.test.ts
describe('PDF extraction', () => {
  test('extracts URLs from academic paper', async () => {
    const buffer = await readFile('./fixtures/academic-paper.pdf');
    const links = await extractLinksFromPDF(buffer);
    
    expect(links.length).toBeGreaterThan(0);
    expect(links.every(l => l.url.startsWith('http'))).toBe(true);
  });
  
  test('captures page numbers', async () => {
    const buffer = await readFile('./fixtures/multi-page.pdf');
    const links = await extractLinksFromPDF(buffer);
    
    expect(links.some(l => l.position.page === 1)).toBe(true);
    expect(links.some(l => l.position.page === 2)).toBe(true);
  });
});
```

## API Design

### Endpoint: POST /api/extract

**Request:**
```json
{
  "file": "<base64 or multipart upload>",
  "type": "pdf" | "markdown" | "html",
  "options": {
    "deduplicateUrls": true,
    "extractDates": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "abc123",
    "filename": "paper.pdf",
    "links": [
      {
        "url": "https://example.com/page",
        "text": "Example Website",
        "position": { "page": 3, "offset": 1250 },
        "context": "...as described in Example Website (2023)...",
        "citationDate": "2023-01-15T00:00:00Z"
      }
    ],
    "stats": {
      "total": 42,
      "unique": 38,
      "withDates": 15
    }
  }
}
```

## Edge Cases

1. **Malformed URLs**: Try to fix common issues (missing protocol, spaces)
2. **Duplicate URLs**: Keep first occurrence, track all positions
3. **Relative URLs**: Resolve against document base URL if available
4. **URL fragments**: Preserve for same-page links, remove for external
5. **Very long URLs**: Truncate at 2048 characters (URL spec limit)
6. **Non-ASCII domains**: Handle IDN (internationalized domain names)
7. **Encrypted PDFs**: Return error with clear message

## Performance Requirements

- Extract from a 50-page academic paper: < 5 seconds
- Extract from a 10KB markdown file: < 500ms
- Extract from a 100KB HTML page: < 1 second

## Dependencies

```json
{
  "pdf-parse": "^1.1.1",
  "unified": "^11.0.0",
  "remark-parse": "^11.0.0",
  "unist-util-visit": "^5.0.0",
  "cheerio": "^1.0.0-rc.12",
  "fast-check": "^3.14.0"
}
```

## Next Steps

1. Implement PDF extractor with property tests
2. Implement Markdown extractor
3. Implement HTML extractor
4. Build URL normalization with comprehensive property tests
5. Create the /api/extract endpoint
6. Test with real academic papers and blog posts

## Open Questions

- [ ] Should we extract URLs from footnotes/endnotes separately?
- [ ] How to handle anchor links within the same document?
- [ ] Should we preserve URL fragments for external links?
- [ ] What's the max document size we'll accept? (suggest 10MB)

---

**Key for the write-up**: The property-based tests on URL normalization will catch edge cases that manual testing would miss. Document every bug they find — that's great content for the blog post.