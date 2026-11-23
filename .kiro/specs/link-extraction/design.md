# Link Extraction from Documents: Design

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  POST /api/extract                          │
│  (multipart/form-data upload)               │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Document Type Detection                     │
│  (by file extension & MIME type)             │
└──────────────┬───────────────────────────────┘
               │
       ┌───────┴───────┬───────────┐
       │               │           │
       ▼               ▼           ▼
   ┌──────┐       ┌────────┐  ┌──────┐
   │ PDF  │       │  MD    │  │ HTML │
   │Parser│       │ Parser │  │Parser│
   └──┬───┘       └───┬────┘  └──┬───┘
      │               │           │
      └───────┬───────┴───────────┘
              │
              ▼
    ┌────────────────────┐
    │ URL Normalization  │
    │ & Deduplication    │
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │ Date Extraction    │
    │ from Context       │
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │ Return JSON with   │
    │ ExtractedLink[]    │
    └────────────────────┘
```

### Data Flow

**Input**: 
- Multipart form upload with file buffer
- Document type (pdf/markdown/html)
- Options (deduplicateUrls, extractDates)

**Output**:
```typescript
{
  success: true,
  data: {
    documentId: "abc123",
    filename: "paper.pdf",
    links: [
      {
        id: "link_1",
        url: "https://example.com/page",          // normalized
        originalUrl: "https://example.com/page/", // as found
        text: "Example Website",
        position: { page: 3, offset: 1250 },
        context: "...as described in Example Website (2023)...",
        citationDate: "2023-01-15T00:00:00Z"
      }
    ],
    stats: {
      total: 42,
      unique: 38,
      withDates: 15
    }
  }
}
```

### Component Design

#### 1. PDF Extractor (`src/lib/extractors/pdf.ts`)
- Uses `pdfjs-dist` to parse PDF structure
- Extracts both visible URLs and link annotations
- Tracks page numbers for each link
- Handles malformed PDFs gracefully

#### 2. Markdown Extractor (`src/lib/extractors/markdown.ts`)
- Uses `unified` + `remark-parse` for AST parsing
- Visits link nodes to extract URLs
- Preserves line numbers and offsets
- Handles reference-style links

#### 3. HTML Extractor (`src/lib/extractors/html.ts`)
- Uses `cheerio` for DOM parsing
- Selects all `<a href="...">` elements
- Extracts surrounding text for context
- Resolves relative URLs against base

#### 4. URL Normalizer (`src/lib/extractors/url-normalizer.ts`)
- Lowercase protocol and hostname
- Remove default ports (80, 443)
- Remove trailing slashes (except root)
- Sort query parameters alphabetically
- Remove tracking parameters (utm_*, fbclid, etc.)
- Remove URL fragments
- **Must be idempotent**: `normalize(normalize(x)) === normalize(x)`

#### 5. Date Parser (`src/lib/extractors/date-parser.ts`)
- Regex patterns for common citation formats
- Handles "Retrieved", "Accessed", "Published" dates
- Parses ISO dates (YYYY-MM-DD)
- Extracts year from parentheses (2023)
- Returns undefined if no date found

### API Endpoint

**Route**: `POST /api/extract`

**Request Body** (multipart/form-data):
```typescript
{
  file: File,
  type?: 'pdf' | 'markdown' | 'html',  // auto-detected if omitted
  options?: {
    deduplicateUrls?: boolean,
    extractDates?: boolean
  }
}
```

**Response** (streaming for large files):
```typescript
{
  success: boolean,
  data?: ExtractionResult,
  error?: {
    code: string,
    message: string
  }
}
```

**Error Codes**:
- `FILE_TOO_LARGE`: File exceeds 10MB limit
- `UNSUPPORTED_FORMAT`: File type not supported
- `PARSE_ERROR`: Failed to parse document
- `NO_LINKS_FOUND`: Document has no URLs
- `INVALID_REQUEST`: Missing file, bad `type` / `options` / `baseUrl`, or not multipart (400)
- `ENCRYPTED_PDF`: PDF is password-protected (422)

HTTP status: FILE_TOO_LARGE 413, UNSUPPORTED_FORMAT 415, PARSE_ERROR /
NO_LINKS_FOUND / ENCRYPTED_PDF 422. Implemented in `src/app/api/extract/route.ts`
and `src/lib/extractors/index.ts`.

### Property-Based Testing Strategy

Critical for the hackathon write-up. Test these invariants:

1. **Idempotence**: `normalize(normalize(url)) === normalize(url)`
2. **Domain preservation**: Normalized URL has same domain
3. **Path preservation**: Normalized URL has same path (minus trailing slash)
4. **Tracking removal**: utm_* parameters always removed
5. **Never crashes**: Normalization handles any string input
6. **Symmetry**: `isSameUrl(a, b) === isSameUrl(b, a)`

---

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
  // Implemented in src/lib/extractors/pdf.ts with pdfjs-dist
  // (link annotations + plain-text URLs; eval disabled for CVE-2024-4367)
  
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
  // Sketch only: implemented in src/lib/extractors/date-parser.ts, which also
  // rejects impossible days (new Date('2023-02-31') silently rolls over to
  // March 3), works in UTC, and prefers access dates over publication dates.
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

## Dependencies

```json
{
  "pdfjs-dist": "^3.11.0",
  "unified": "^11.0.0",
  "remark-parse": "^11.0.0",
  "unist-util-visit": "^5.0.0",
  "cheerio": "^1.0.0-rc.12",
  "fast-check": "^3.14.0"
}
```
