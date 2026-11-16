# Implementation Plan: Phase 2 - Markdown Link Extraction

**Workflow ID**: wf_df6017fe32bfe9bd  
**Created**: 2026-11-13  
**Phase**: 2 of 7 (from spec 01-link-extraction.md)

---

## Context

This plan implements Phase 2 (tasks 2.1–2.3) from `.kiro/specs/01-link-extraction.md`.

**Dependencies verified**:
- ✅ `unified@11.0.5` installed
- ✅ `remark-parse@11.0.0` installed  
- ✅ `unist-util-visit@5.2.0` installed
- ✅ Phase 1 complete: `url-normalizer.ts` with property tests passing
- ✅ Types defined: `src/types/link.ts` with `Link`, `Position`, `ExtractionResult` interfaces
- ✅ Vitest configured: `vitest.config.ts` with jsdom environment

**Key patterns from existing code**:
- URL normalization: `normalizeUrl()` is idempotent, removes tracking params, lowercases hostname
- Property tests: Use `fast-check` with 500-1000 runs, document bugs found
- Type safety: Strict TypeScript, no `any` types, explicit return types
- Error handling: Try/catch with fallback returns, never crash on malformed input

**Testing approach**:
- Property-based tests in `tests/property/` using fast-check
- Unit tests in `tests/unit/` using Vitest
- Fixtures in `tests/fixtures/`
- Test command: `npm test` (runs Vitest)

---

## Implementation Tasks

- [ ] 1. **Create the Markdown extractor implementation**
      
      File: `src/lib/extractors/markdown.ts`
      
      Implement `extractLinksFromMarkdown(content: string): Promise<ExtractedLink[]>` with:
      - Parse markdown to AST using `unified().use(remarkParse).parse(content)`
      - Use `visit(tree, 'link', callback)` from `unist-util-visit` to traverse link nodes
      - Handle three link types:
        - Inline links: `[text](url)`
        - Reference links: `[text][ref]` (need to resolve reference to URL)
        - Autolinks: `<https://example.com>`
      - Extract for each link:
        - `url`: call `normalizeUrl()` from `../url-normalizer`
        - `originalUrl`: preserve as found in markdown
        - `text`: link text content (or URL itself for autolinks)
        - `position.line`: from `node.position.start.line`
        - `position.offset`: from `node.position.start.offset`
        - `context`: extract 50 characters before and after the link from source
        - `id`: generate stable ID using `${normalizeUrl(url)}_${position.offset}`
      - Return array of objects matching the shape: `{ id, url, originalUrl, text, position: { line, offset }, context }`
      - Handle edge cases: empty text, malformed URLs (log and skip), duplicate URLs (keep all occurrences with different positions)
      
      Reference implementation pattern from spec (lines 210-234 in `01-link-extraction.md`).
      
      **Verify**: Run `npm test src/lib/extractors/markdown.test.ts` (will be created in step 2) and confirm all unit tests pass.

- [ ] 2. **Create comprehensive unit tests for Markdown extraction**
      
      File: `tests/unit/markdown-extractor.test.ts`
      
      Write test cases covering:
      1. **Inline links**: `[Example](https://example.com)` → extracts URL, text, position
      2. **Reference links**: `[text][ref]` with `[ref]: https://example.com` at bottom → resolves and extracts
      3. **Autolinks**: `<https://example.com>` → extracts with URL as text
      4. **Position tracking**: verify `line` and `offset` match the actual markdown source positions
      5. **Context extraction**: verify 50 chars before/after are captured correctly
      6. **Multiple links**: markdown with 5+ links → extracts all with unique positions
      7. **Duplicate URLs**: same URL appears twice → both occurrences extracted with different positions
      8. **Empty content**: empty string → returns empty array
      9. **No links**: plain text with no links → returns empty array
      10. **Malformed URLs**: `[bad link](not a url)` → skips gracefully, doesn't crash
      11. **Special characters**: URLs with query params, fragments → normalized correctly
      12. **Multiline links**: link text spanning multiple lines → extracts correctly
      
      Follow the pattern from `tests/property/url-normalization.test.ts`:
      - Import from `@/lib/extractors/markdown` (using vitest path alias)
      - Use `describe()` and `test()` from Vitest (globals: true in config)
      - Use `expect()` assertions
      - Group related tests with nested `describe()` blocks
      
      **Verify**: Run `npm test tests/unit/markdown-extractor.test.ts` and confirm all tests pass. Each test should verify actual behavior, not mock implementations.

- [ ] 3. **Create test fixture with all Markdown link types**
      
      File: `tests/fixtures/sample.md`
      
      Create a sample markdown document containing:
      - 3-4 inline links `[text](url)` with different domains
      - 2-3 reference-style links `[text][ref]` with reference definitions at bottom
      - 1-2 autolinks `<https://example.com>`
      - Mix of HTTP and HTTPS URLs
      - At least one URL with query parameters (e.g., `?page=2&sort=date`)
      - At least one duplicate URL appearing in different contexts
      - Surrounding text with dates (e.g., "Retrieved 2023-06-15") for future date extraction
      - Total 10-15 links across multiple paragraphs
      
      This fixture will be used in unit tests via `readFile()` to test extraction on realistic markdown.
      
      **Verify**: Read the fixture in a unit test, extract links, and confirm the count matches expected (10-15 links). Verify specific URLs from the fixture are present in results.

- [ ] 4. **Add property-based tests for Markdown extraction invariants**
      
      File: `tests/property/markdown-extraction.test.ts`
      
      Write property tests to verify:
      1. **Never crashes on random input**: `fc.string()` → `extractLinksFromMarkdown()` always returns array, never throws
      2. **Position monotonicity**: positions increase monotonically through the document (later links have higher offsets)
      3. **URL normalization consistency**: extracted URLs match `normalizeUrl(originalUrl)`
      4. **Context boundaries**: context strings are never longer than 100 chars (50 before + 50 after)
      5. **No duplicates in single extraction**: same URL at same position never appears twice in results
      
      Use fast-check with 500-1000 runs per property. Follow pattern from `tests/property/url-normalization.test.ts`.
      
      Document any bugs found with comments explaining:
      - The input that caused failure
      - Expected vs actual behavior  
      - How it was fixed
      
      **Verify**: Run `npm run test:property` and confirm all property tests pass with 0 failures across 500+ runs each.

- [ ] 5. **Integration verification: Extract links from real markdown file**
      
      Run end-to-end test:
      1. Create a test that reads `tests/fixtures/sample.md`
      2. Call `extractLinksFromMarkdown()` on the file content
      3. Verify results:
         - At least 10 links extracted
         - All have non-empty `url`, `text`, `id` fields
         - All positions have `line` and `offset` > 0
         - At least one context string contains date-like text (for future date extraction phase)
         - No TypeScript errors, all types match `Link` interface from `src/types/link.ts`
      
      This can be a test case in `tests/unit/markdown-extractor.test.ts` in a `describe('Integration')` block.
      
      **Verify**: Run `npm test` and confirm the integration test passes. Then run `npm run build` to ensure TypeScript compilation succeeds with no type errors.

---

## Success Criteria

All tasks checked off, and:

1. ✅ `extractLinksFromMarkdown()` handles inline, reference, and autolinks
2. ✅ All unit tests pass (`npm test tests/unit/markdown-extractor.test.ts`)
3. ✅ All property tests pass (`npm run test:property`)
4. ✅ Integration test with real fixture passes
5. ✅ TypeScript compiles with no errors (`npm run build`)
6. ✅ Extracted links match `Link` interface shape from `src/types/link.ts`
7. ✅ Code follows conventions: JSDoc comments, explicit types, error handling

---

## Notes for Implementation

### Interface to Implement

Based on `src/types/link.ts`, the extractor should return objects with this shape:

```typescript
interface ExtractedLink {
  id: string;              // stable, unique identifier
  url: string;             // normalized URL
  originalUrl: string;     // URL as found in markdown
  text: string;            // link text
  position: {
    line?: number;         // line number in source
    offset: number;        // character offset
  };
  context: string;         // 50 chars before + after
}
```

### Unified/Remark AST Structure

Link nodes from `remark-parse` have this structure:

```typescript
{
  type: 'link',
  url: string,
  children: [{ type: 'text', value: string }],
  position: {
    start: { line: number, column: number, offset: number },
    end: { line: number, column: number, offset: number }
  }
}
```

Reference definitions have type `'definition'` with `url` and `identifier`.

### Context Extraction Pattern

```typescript
function extractContext(content: string, position: Position): string {
  const { start, end } = position;
  const beforeStart = Math.max(0, start.offset - 50);
  const afterEnd = Math.min(content.length, end.offset + 50);
  return content.slice(beforeStart, afterEnd);
}
```

### ID Generation

Generate stable IDs for deduplication across multiple extractions:

```typescript
function generateLinkId(normalizedUrl: string, offset: number): string {
  return `link_${Buffer.from(normalizedUrl).toString('base64').slice(0, 12)}_${offset}`;
}
```

### Error Handling Pattern

Follow the pattern from `url-normalizer.ts`:

```typescript
try {
  // extraction logic
} catch (error) {
  // Log error but don't crash
  console.warn('Failed to extract link:', error);
  return []; // or skip this link and continue
}
```

---

## Dependencies

**Already installed** (verified in package.json):
- unified@11.0.5
- remark-parse@11.0.0
- unist-util-visit@5.2.0
- fast-check@3.14.0
- vitest@1.0.0

**Imports needed**:
```typescript
// In markdown.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { normalizeUrl } from './url-normalizer';

// In tests
import fc from 'fast-check';
import { describe, test, expect } from 'vitest';
import { readFile } from 'fs/promises';
```

---

## Next Steps After This Phase

Phase 2 ✅ → Phase 3: HTML extraction → Phase 4: PDF extraction → Phase 5: Date extraction → Phase 6: API endpoint

This plan implements only Phase 2 (Markdown extraction). The implementer should focus on completing these 5 tasks before moving to HTML extraction.
