# Implementation Plan: Phase 3 - HTML Link Extraction

## Context

Phase 1 (URL normalization) and Phase 2 (Markdown extraction) are complete with all tests passing. This plan covers Phase 3: implementing HTML link extraction using cheerio, following the patterns established in `markdown.ts`.

## Existing Patterns to Follow

From analysis of the codebase:
- **ExtractedLink interface** is defined in `src/types/link.ts` with fields: id, url, originalUrl, text, position (offset, line optional), context, citationDate (optional)
- **URL normalization** via `normalizeUrl()` from `url-normalizer.ts` removes tracking params, normalizes case, removes fragments
- **Relative URL resolution** via `resolveUrl(relativeUrl, baseUrl)` from `url-normalizer.ts`
- **Test patterns** from `markdown-extractor.test.ts`: describe blocks for different link types, edge cases, position tracking, context extraction, integration with fixtures
- **Unique ID generation**: use pattern `link_${index}` where index increments per link
- **Context extraction**: ~50 chars before and after the link, trimmed
- **Skip special schemes**: mailto:, tel:, javascript:, data:, and fragment-only hrefs (#anchor)
- **Cheerio** is already installed (v1.0.0-rc.12) per package.json

## Files to Create/Modify

1. `src/lib/extractors/html.ts` - main HTML extractor
2. `tests/unit/html-extractor.test.ts` - unit tests
3. `tests/fixtures/sample.html` - HTML fixture

## Implementation Plan

- [x] **1. Create HTML test fixture with comprehensive test cases**
  
  Files: `tests/fixtures/sample.html`
  
  Create an HTML document containing:
  - Absolute URLs (http and https)
  - Relative URLs (/path, ./path, ../path, path.html)
  - Anchor text with nested elements (`<a><strong>Bold</strong> text</a>`)
  - Links with query parameters and tracking params (utm_source, fbclid)
  - Links with fragments (#section)
  - Special scheme links to skip: mailto:, tel:, javascript:, data:
  - Fragment-only hrefs (#anchor)
  - Duplicate URLs in different positions
  - Citation-like text with dates ("Retrieved 2023-06-15")
  - Empty href attributes
  - Links without href attributes
  - Malformed HTML elements
  
  Verify: File exists and can be read with `cat tests/fixtures/sample.html`

- [x] **2. Implement extractLinksFromHTML() function**
  
  Files: `src/lib/extractors/html.ts`
  
  Implementation approach:
  - Import cheerio, normalizeUrl, resolveUrl from url-normalizer
  - Define ExtractedLink interface import from '@/types/link'
  - Function signature: `async function extractLinksFromHTML(html: string, baseUrl?: string): Promise<ExtractedLink[]>`
  - Handle empty/whitespace-only input by returning empty array
  - Use cheerio.load() to parse HTML
  - Select all `a[href]` elements with `$('a[href]')`
  - For each link:
    - Get href attribute with `.attr('href')`
    - Skip if href is falsy, starts with '#' only, or matches special schemes (mailto:, tel:, javascript:, data:)
    - Extract text using `.text().trim()` (cheerio handles nested elements automatically)
    - Use fallback to href if text is empty
    - Position: use element index as offset (cheerio doesn't provide character offsets)
    - Context: extract parent element text or surrounding paragraph, limit to ~100 chars around link
    - Resolve relative URLs: if baseUrl provided and href is relative, use resolveUrl(href, baseUrl)
    - Normalize the final URL with normalizeUrl()
    - Generate unique ID: `link_${linkIndex++}`
    - Push ExtractedLink object to results array
  - Wrap in try/catch, log warning and return empty array on error
  - Return links array
  
  Rationale: Cheerio's .text() method automatically handles nested elements (strong, em, span, etc.) and provides clean text extraction. Position tracking uses element index since cheerio operates on DOM, not character offsets.
  
  Verify: `npm run test -- src/lib/extractors/html` passes (after test implementation)

- [x] **3. Implement context extraction helper**
  
  Files: `src/lib/extractors/html.ts`
  
  Add private function `extractContext($: CheerioAPI, $elem: Cheerio<Element>): string`:
  - Get parent element or closest paragraph
  - Extract full parent text
  - Find the link text position within parent
  - Slice ~50 chars before link start and ~50 after link end
  - Join and trim to create context string
  - Fallback: if parent text too short, use full parent text
  
  Rationale: Follows same pattern as markdown.ts extractContext(), adapted for Cheerio's DOM API.
  
  Verify: Implicit verification via unit tests checking context field values

- [x] **4. Create comprehensive unit tests**
  
  Files: `tests/unit/html-extractor.test.ts`
  
  Follow markdown-extractor.test.ts structure with describe blocks for:
  - **Absolute URLs**: Extract http and https URLs correctly
  - **Relative URLs**: Test with baseUrl parameter for /path, ./path, ../path, path.html resolution
  - **Anchor Text Extraction**: Nested elements (strong, em, span), empty text handling
  - **Position Tracking**: Element index as offset, monotonically increasing
  - **Context Extraction**: Surrounding text extraction, length limits
  - **URL Normalization**: Tracking param removal, trailing slash removal, case normalization
  - **Special Schemes**: Skip mailto:, tel:, javascript:, data: links
  - **Fragment Handling**: Skip fragment-only (#anchor), keep fragments on full URLs
  - **Edge Cases**: Empty input, no links, malformed HTML, missing href, empty href, duplicate URLs
  - **Unique IDs**: Generate unique IDs following link_N pattern
  - **Integration Test**: Load and parse sample.html fixture, verify extraction count and specific URLs
  
  Each test should:
  - Create HTML string or use fixture
  - Call extractLinksFromHTML()
  - Assert expected number of links
  - Assert expected field values (url, originalUrl, text, position, context)
  - Use toMatchObject() for partial matching where appropriate
  
  Verify: `npm run test -- tests/unit/html-extractor.test.ts` passes all tests

- [x] **5. Add JSDoc documentation**
  
  Files: `src/lib/extractors/html.ts`
  
  Add JSDoc comments to:
  - Main extractLinksFromHTML() function with @param, @returns, @example
  - ExtractedLink interface (if defined locally, otherwise reference @/types/link)
  - Helper functions with brief descriptions
  
  Follow the documentation style from markdown.ts with clear examples showing expected input/output.
  
  Verify: TypeScript compiler accepts documentation, no errors from `npm run build`

- [x] **6. Run full test suite and verify integration**
  
  Files: N/A (verification step)
  
  Run complete test suite to ensure:
  - All new HTML extractor tests pass
  - No regressions in existing URL normalizer tests
  - No regressions in existing Markdown extractor tests
  - TypeScript compilation succeeds
  
  Commands to run:
  ```bash
  npm run test
  npm run build
  npm run lint
  ```
  
  Verify: All tests pass, build succeeds, no lint errors

## Success Criteria

1. ✅ `extractLinksFromHTML()` extracts all `<a href>` links from HTML
2. ✅ Relative URLs are resolved when baseUrl is provided
3. ✅ Special schemes (mailto:, tel:, javascript:, data:) are skipped
4. ✅ Fragment-only links (#anchor) are skipped
5. ✅ Anchor text from nested elements is extracted correctly
6. ✅ URLs are normalized using normalizeUrl()
7. ✅ Position tracking uses element index as offset
8. ✅ Context extraction captures ~50 chars before/after link
9. ✅ Malformed HTML is handled gracefully (returns empty array, no crashes)
10. ✅ All unit tests pass with >80% coverage
11. ✅ Integration test with sample.html fixture passes
12. ✅ Documentation is clear with JSDoc comments
13. ✅ No regressions in existing tests
14. ✅ TypeScript builds without errors

## Dependencies

- cheerio v1.0.0-rc.12 (already installed)
- Existing url-normalizer.ts functions (normalizeUrl, resolveUrl)
- Existing types from src/types/link.ts (ExtractedLink, Position)
- Vitest testing framework (already configured)

## Notes

- Cheerio operates on DOM structure, not raw character offsets, so position tracking uses element index as an approximation
- The .text() method in cheerio automatically concatenates nested text nodes, simplifying anchor text extraction
- Context extraction from DOM structure is more approximate than from raw text (as in markdown), but adequate for date detection
- Follow the same error handling pattern as markdown.ts: wrap in try/catch, log warnings, return empty array
- Keep implementation simple and focused; advanced features (link annotation metadata, aria-label extraction) can be added later

## Git Commit Strategy

Per user request and project conventions:
1. **Commit 1**: Add sample.html fixture (isolated, easy to review)
2. **Commit 2**: Implement extractLinksFromHTML() in html.ts with JSDoc
3. **Commit 3**: Add comprehensive unit tests in html-extractor.test.ts

Each commit should:
- Be atomic and focused on one concern
- Include descriptive commit message following conventional commits format
- Pass all tests at that point (or be marked as WIP if tests come after implementation)
