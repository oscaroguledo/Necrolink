# Spec: Link Extraction from Documents

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Requirements

### Must Have
- Extract all URLs from PDF documents
- Extract all URLs from Markdown files
- Extract all URLs from HTML files
- Capture link text (anchor text) for each URL
- Record position of each link in the document (page/line/offset)
- Extract surrounding context (50 chars before/after) for date detection
- Normalize URLs to canonical form for deduplication
- Parse citation dates from surrounding context when available
- Return structured JSON with all extracted data
- Handle files up to 10MB in size

### Should Have
- Resolve relative URLs to absolute URLs
- Deduplicate URLs while preserving all positions
- Extract link annotations from PDF (not just visible text)
- Handle internationalized domain names (IDN)
- Graceful error handling for malformed URLs

### Could Have (Stretch Goals)
- Extract URLs from DOCX files (using mammoth)
- Extract URLs from plain text files
- Support BibTeX files for academic citations
- OCR for scanned PDFs with embedded links

### Won't Have (Out of Scope)
- PowerPoint or slide files
- Image files (unless OCR stretch goal)
- Video/audio files
- Encrypted PDFs requiring passwords

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

## Tasks

### Phase 1: URL Normalization (Foundation)
- [x] **Task 1.1**: Implement `normalizeUrl()` function
  - Input: raw URL string
  - Output: canonical URL string
  - Handle: protocol, hostname, port, path, query, fragment
  - Acceptance: All property tests pass

- [x] **Task 1.2**: Write property-based tests with fast-check
  - Test idempotence (1000 runs)
  - Test domain/path preservation (1000 runs)
  - Test tracking parameter removal (500 runs)
  - Test crash resistance on random strings (1000 runs)
  - **Document every bug found** for write-up

- [x] **Task 1.3**: Create helper functions
  - `isAbsoluteUrl(url: string): boolean`
  - `resolveUrl(relative: string, base: string): string`
  - `extractDomain(url: string): string | null`
  - `isSameUrl(url1: string, url2: string): boolean`

### Phase 2: Markdown Extraction
- [x] **Task 2.1**: Set up unified + remark-parse
  - Install dependencies
  - Configure parser options
  - Test with simple markdown file

- [x] **Task 2.2**: Implement `extractLinksFromMarkdown()`
  - Parse markdown to AST
  - Visit link nodes
  - Extract URL, text, position
  - Extract surrounding context (50 chars)
  - Handle reference-style links

- [x] **Task 2.3**: Unit tests for Markdown extractor
  - Test inline links `[text](url)`
  - Test reference links `[text][ref]`
  - Test autolinks `<https://example.com>`
  - Test position tracking
  - Test context extraction

### Phase 3: HTML Extraction
- [x] **Task 3.1**: Implement `extractLinksFromHTML()`
  - Parse HTML with cheerio
  - Select all `<a[href]>` elements
  - Extract href, text, and position
  - Resolve relative URLs if base provided

- [x] **Task 3.2**: Unit tests for HTML extractor
  - Test absolute URLs
  - Test relative URLs (with base)
  - Test anchor text extraction
  - Test nested elements
  - Test malformed HTML

### Phase 4: PDF Extraction (Hardest)
- [x] **Task 4.1**: Set up pdfjs-dist
  - Configure worker
  - Handle canvas/node environment
  - Test with simple PDF

- [x] **Task 4.2**: Implement `extractLinksFromPDF()`
  - Extract text content page by page
  - Find URLs with regex patterns
  - Extract link annotations (bonus)
  - Track page numbers
  - Extract surrounding context

- [x] **Task 4.3**: Unit tests with real PDFs
  - Test academic paper (arXiv PDF): deferred; generated fixtures in tests/fixtures/generate-pdfs.py cover annotations, plain-text URLs, multi-page, encrypted and corrupt files
  - Test document with annotations
  - Test multi-page tracking
  - Test malformed PDFs (error handling)

### Phase 5: Date Extraction
- [x] **Task 5.1**: Implement `extractCitationDate()`
  - Regex for ISO dates (YYYY-MM-DD)
  - Regex for "Retrieved", "Accessed" formats
  - Regex for year in parentheses
  - Return Date or undefined

- [x] **Task 5.2**: Property tests for date parsing
  - Never crashes on random strings
  - Valid dates parse correctly
  - Invalid dates return undefined

### Phase 6: API Endpoint
- [x] **Task 6.1**: Create `/api/extract` route
  - Handle multipart/form-data
  - Detect document type
  - Call appropriate extractor
  - Return structured JSON

- [x] **Task 6.2**: Add file validation
  - Check file size (max 10MB)
  - Verify MIME type
  - Return clear error messages

- [x] **Task 6.3**: Integration tests
  - Upload real PDF and verify extraction
  - Upload Markdown and verify extraction
  - Test error cases (too large, wrong type)

### Phase 7: Polish
- [ ] **Task 7.1**: Error handling
  - Graceful failures for malformed files
  - Clear error messages for users
  - Logging for debugging

- [ ] **Task 7.2**: Performance optimization
  - Stream large files
  - Limit memory usage
  - Add timeout for slow parses

- [ ] **Task 7.3**: Documentation
  - Add JSDoc comments
  - Update API docs
  - Document bugs found by property tests

---

## Success Criteria

### Functional
1. ✅ Extracts every clickable URL from a document
2. ✅ Captures link text, position, and context
3. ✅ Handles relative URLs and normalizes them
4. ✅ Parses citation dates when available
5. ✅ Returns structured data for link checking

### Quality
1. ✅ Property-based tests pass with 1000+ runs
2. ✅ Unit test coverage >80% on extractors
3. ✅ Handles malformed inputs without crashing
4. ✅ Clear error messages for users

### Performance
1. ✅ 50-page PDF extracts in < 5 seconds
2. ✅ 10KB Markdown extracts in < 500ms
3. ✅ 100KB HTML extracts in < 1 second

### Documentation
1. ✅ Every bug found by property tests is documented
2. ✅ API endpoint has clear examples
3. ✅ Code has JSDoc comments

---

## Open Questions

- [ ] Should we extract URLs from footnotes/endnotes separately?
- [ ] How to handle anchor links within the same document?
- [ ] Should we preserve URL fragments for external links?
- [ ] What's the max document size we'll accept? (suggest 10MB)
- [ ] Do we need to handle password-protected PDFs?

---

## Testing Notes

**Keep a dev log of bugs found by property-based tests!**

This is critical for the hackathon write-up. Every time fast-check finds a bug, document:
1. What input caused the failure
2. What the expected behavior was
3. What actually happened
4. How you fixed it

Examples to watch for:
- URLs with multiple consecutive slashes
- IDN (internationalized) domains
- URLs with only fragments
- Malformed query parameters
- Edge cases in trailing slash handling

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
  "pdfjs-dist": "^3.11.0",
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