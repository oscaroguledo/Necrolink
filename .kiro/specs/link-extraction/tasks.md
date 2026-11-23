# Link Extraction from Documents: Implementation Tasks

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

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
- [x] **Task 7.1**: Error handling
  - Graceful failures for malformed files
  - Clear error messages for users
  - Logging for debugging

- [x] **Task 7.2**: Performance optimization
  - Stream large files: not needed under the 10 MB cap; oversized uploads are rejected from Content-Length before the body is read
  - Limit memory usage: 10 MB cap, 1000-page PDF cap
  - Add timeout for slow parses: 30 s (PARSE_TIMEOUT); PDF parsing yields per page so the timeout can fire

- [x] **Task 7.3**: Documentation
  - Add JSDoc comments
  - Update API docs
  - Document bugs found by property tests

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

## Next Steps

1. Implement PDF extractor with property tests
2. Implement Markdown extractor
3. Implement HTML extractor
4. Build URL normalization with comprehensive property tests
5. Create the /api/extract endpoint
6. Test with real academic papers and blog posts
