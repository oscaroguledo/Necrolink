# Implementation Plan: Spec 04 - Document Export

## Overview
Implement document reconstruction and export functionality to regenerate documents with resurrected links. This includes replacing ghost links with Wayback Machine URLs, annotating zombie links with warnings, marking lost souls with footnotes, and preserving document structure.

## Project Context

**Build System**: Next.js 14 with TypeScript (strict mode)
**Test Framework**: Vitest with fast-check for property tests
**Build Command**: `npm run build`
**Test Command**: `npm test` (runs all), `npm run test:property` (property tests only)
**Key Dependencies**: unified, remark-parse, cheerio (all installed); remark-stringify (NOT installed, must add)
**Code Pattern**: Result<T,E> for error handling, structured logging, Zod validation for API routes
**Path Alias**: `@/` maps to `src/`

**Critical Requirements**:
- Ghost links: Replace URL with archive URL, prepend `👻→⏮️` to link text
- Zombie links: Keep original URL, add `🧟` prefix, add `[^N]` footnote reference
- Lost soul links: **NEVER change the URL**, prepend `🪦`, add `[^N]` footnote warning
- Footnote numbering is sequential across zombies AND lost souls (shared counter)
- Code blocks in markdown must NOT have URLs replaced
- TypeScript strict mode: no `any` types, use Result<T,E> pattern
- All API routes use Zod validation and standard response shape

## Implementation Tasks

---

### Phase 1: Install Dependencies and Setup Types

- [ ] 1. Install remark-stringify for markdown reconstruction.
      Run `npm install remark-stringify` to add the missing dependency for converting markdown AST back to text.
      Files: package.json, package-lock.json
      Verify: `npm list remark-stringify` shows version ^11.0.0

- [ ] 2. Create type definitions for replacement rules and export options.
      Define `ReplacementRule`, `ReplacementType`, `ExportOptions`, `ExportResult` in a new file following the Result<T,E> pattern used throughout the codebase.
      Files: src/types/export.ts
      Verify: `npm run build` compiles without errors

---

### Phase 2: Build Replacement Map

- [ ] 3. Implement buildReplacementMap() function.
      Create the core logic that maps Link[] and CheckResult[] to ReplacementRule[]. Handle ghost (replace URL), zombie (keep URL + footnote), lost (keep URL + footnote), and living (no change). Assign sequential footnote numbers across zombies and lost souls. Use the Result<T,E> pattern for error handling.
      Files: src/lib/exporters/replacement-map.ts
      Verify: `npm test tests/unit/replacement-map.test.ts` passes

- [ ] 4. Write unit tests for replacement map builder.
      Test ghost link replacement (URL changes), zombie link annotation (URL unchanged), lost soul handling (URL unchanged, marked 🪦), living links (no change), footnote numbering (sequential across zombies+lost), same URL appearing multiple times, and empty input.
      Files: tests/unit/replacement-map.test.ts
      Verify: `npm test tests/unit/replacement-map.test.ts` shows all tests passing

---

### Phase 3: Markdown Reconstruction

- [ ] 5. Implement reconstructMarkdown() function.
      Parse markdown with unified().use(remarkParse), visit link nodes with unist-util-visit, apply replacement rules (ghost: change URL + prepend 👻→⏮️; zombie: keep URL + prepend 🧟 + add [^N]; lost: keep URL + prepend 🪦 + add [^N]), skip links inside code blocks (node.type === 'code' or 'inlineCode'), generate footnotes section with ## 🪦 Necrolink Notes, add metadata footer with stats, convert back with unified().use(remarkStringify). Return Result<string, Error>.
      Files: src/lib/exporters/markdown.ts
      Verify: `npm test tests/unit/markdown-exporter.test.ts` passes

- [ ] 6. Write unit tests for markdown exporter.
      Test ghost link URL replacement and emoji, zombie link keeps original URL with 🧟 and footnote, lost soul keeps original URL with 🪦 and footnote, footnotes section generation, metadata footer with counts, links in code blocks are NOT replaced, empty replacement rules returns original + footer, and idempotence (running twice produces same result).
      Files: tests/unit/markdown-exporter.test.ts
      Verify: `npm test tests/unit/markdown-exporter.test.ts` shows all tests passing

---

### Phase 4: HTML Reconstruction

- [ ] 7. Implement reconstructHTML() function.
      Parse HTML with cheerio, select all `<a[href]>` elements, apply replacement rules (ghost: change href + prepend `<span title="Resurrected from archive">👻→⏮️</span>` + add data-necrolink-ghost="true"; zombie: keep href + add 🧟 + add `<sup><a href="#note-N">[N]</a></sup>` + add data-necrolink-zombie="true"; lost: keep href + prepend `<span title="Dead, no archived copy">🪦</span>` + add footnote sup + add data-necrolink-lost="true"), generate footnotes `<section id="necrolink-notes">` with `<ol>` of footnotes, add metadata footer with stats, return cheerio.html(). Return Result<string, Error>.
      Files: src/lib/exporters/html.ts
      Verify: `npm test tests/unit/html-exporter.test.ts` passes

- [ ] 8. Write unit tests for HTML exporter.
      Test ghost link replacement with data-necrolink-ghost attribute, zombie link keeps URL with data-necrolink-zombie and footnote, lost soul keeps URL with data-necrolink-lost and footnote, footnotes section with numbered list, metadata footer, complex nested HTML, empty replacement rules, and cheerio parses result without errors.
      Files: tests/unit/html-exporter.test.ts
      Verify: `npm test tests/unit/html-exporter.test.ts` shows all tests passing

---

### Phase 5: API Endpoint

- [ ] 9. Create POST /api/export endpoint with Zod validation.
      Define Zod schema for request body: { documentId: string, documentType: 'markdown' | 'html', originalContent: string, links: Link[], checkResults: CheckResult[], options?: { addFooter?: boolean, addVisualIndicators?: boolean } }. Build replacement map, call appropriate reconstructor (markdown/html), set Content-Type and Content-Disposition headers for download, return file. Handle errors with standard { success: false, error: { code, message } } shape. Follow the pattern from src/app/api/extract/route.ts.
      Files: src/app/api/export/route.ts
      Verify: `npm test tests/integration/export-api.test.ts` passes

- [ ] 10. Write integration tests for export API.
      Test POST with valid markdown document returns 200 with reconstructed content, POST with valid HTML document, validation errors return 400, unsupported document type returns 400, Content-Disposition header includes filename, and Content-Type is correct (text/markdown or text/html). Mock the reconstruction functions to test error handling.
      Files: tests/integration/export-api.test.ts
      Verify: `npm test tests/integration/export-api.test.ts` shows all tests passing

---

### Phase 6: Property-Based Testing

- [ ] 11. Write property tests for content preservation and replacement correctness.
      Use fast-check to test: non-link markdown content is preserved after reconstruction (fc.lorem), all ghost links have new URLs (no original URL remains), all lost-soul URLs are NEVER changed (critical invariant), footnote numbering has no gaps or duplicates, reconstruction is idempotent (running twice produces identical output except footer duplication - handle by checking for existing Necrolink footer before adding), and formatting (bold, italic, lists) is preserved in markdown.
      Files: tests/property/reconstruction.test.ts
      Verify: `npm run test:property` shows all property tests passing with 1000+ runs

---

### Phase 7: End-to-End Verification

- [ ] 12. Create integration test with real fixture data.
      Use tests/fixtures/sample.md: run extraction, mock check results (mix of ghost/zombie/lost/living), call export API, verify reconstructed document has correct replacements, footnotes, and footer. Test the full pipeline from file upload to fixed document download.
      Files: tests/integration/export-e2e.test.ts
      Verify: `npm test tests/integration/export-e2e.test.ts` passes

- [ ] 13. Add export functionality to existing API documentation.
      Document POST /api/export request body schema, response headers, success/error codes, and example request/response in docs/API.md following the existing format.
      Files: docs/API.md
      Verify: Read docs/API.md and confirm export endpoint is documented with examples

---

### Phase 8: Final Verification

- [ ] 14. Run full test suite and ensure all tests pass.
      Execute `npm test` to run all unit, integration, and property tests. Fix any failures.
      Files: All test files
      Verify: `npm test` shows 0 failures across all test suites

- [ ] 15. Build the application and verify TypeScript compilation.
      Execute `npm run build` to ensure no TypeScript errors and Next.js builds successfully.
      Files: All TypeScript files
      Verify: `npm run build` completes with exit code 0

---

## Key Design Decisions

### Why install remark-stringify instead of alternative?
The project already uses unified and remark-parse for extraction. Using remark-stringify maintains consistency and allows round-tripping through the AST without losing markdown semantics. Alternative approaches (regex-based replacement) would be fragile and fail to preserve structure.

### Why shared footnote numbering for zombies and lost souls?
Both represent links that need human attention. Sequential numbering (footnotes 1, 2, 3...) is clearer for readers than separate zombie notes [^Z1] and lost notes [^L1]. The spec explicitly requires this.

### Why keep lost-soul URLs unchanged?
A lost soul is a dead link with no archived copy. Changing the URL would be dishonest - there's nothing to resurrect it from. The 🪦 marker and footnote tell the reader to find another source, but preserve the citation's original URL for reference.

### Why Result<T,E> pattern instead of throwing?
The codebase uses Result<T,E> throughout (see src/lib/utils.ts, used in checker and wayback modules). This makes error handling explicit and type-safe, following the existing architectural pattern.

### Why separate markdown and HTML exporters?
Different AST structures and output requirements. Markdown uses remark (unified) and text-based footnotes `[^N]`. HTML uses cheerio and `<sup>` elements. Attempting to unify them would create complexity without benefit.

---

## Testing Strategy

### Unit Tests (80%+ coverage target)
- Test each function in isolation
- Mock dependencies (no real file I/O or API calls)
- Cover edge cases: empty input, no fixes needed, all links dead, duplicate URLs
- Follow existing test patterns in tests/unit/markdown-extractor.test.ts

### Integration Tests
- Test full API request/response cycle
- Use real fixture files from tests/fixtures/
- Verify headers, status codes, error responses
- Follow pattern from existing integration tests

### Property Tests
- Generate random markdown with fast-check
- Verify invariants: content preservation, no lost-soul URL changes, idempotence
- Run 1000+ iterations per property
- Document bugs found (for hackathon write-up)

### E2E Test
- Full pipeline: extract → check (mocked) → export
- Verify the complete user journey
- Use sample.md fixture with known link types

---

## Success Criteria

**Functional**:
- [ ] Ghost links replaced with archive URLs and marked 👻→⏮️
- [ ] Zombie links keep original URL, marked 🧟, have footnotes explaining changes
- [ ] Lost soul links NEVER have URL changed, marked 🪦, have footnotes
- [ ] Footnote numbering is sequential across zombies and lost souls
- [ ] Links in markdown code blocks are NOT replaced
- [ ] Metadata footer shows correct counts
- [ ] Downloaded files are valid markdown/HTML

**Quality**:
- [ ] Unit test coverage >80% on src/lib/exporters/
- [ ] Property tests pass 1000+ runs
- [ ] No TypeScript errors (strict mode)
- [ ] Integration tests pass with real fixtures

**Performance**:
- [ ] Reconstructs 50-link document in <1 second
- [ ] Large documents (500+ links) in <5 seconds

---

## Files Created/Modified

**New Files** (9):
1. src/types/export.ts
2. src/lib/exporters/replacement-map.ts
3. src/lib/exporters/markdown.ts
4. src/lib/exporters/html.ts
5. src/app/api/export/route.ts
6. tests/unit/replacement-map.test.ts
7. tests/unit/markdown-exporter.test.ts
8. tests/unit/html-exporter.test.ts
9. tests/integration/export-api.test.ts
10. tests/property/reconstruction.test.ts
11. tests/integration/export-e2e.test.ts

**Modified Files** (2):
1. package.json (add remark-stringify)
2. docs/API.md (document export endpoint)

---

## Dependencies

**Already Installed**:
- unified ^11.0.0
- remark-parse ^11.0.0
- unist-util-visit ^5.0.0
- cheerio ^1.0.0-rc.12
- fast-check ^3.14.0 (for property tests)

**To Install**:
- remark-stringify ^11.0.0 (for markdown AST to string conversion)

---

## Risk Mitigation

**Risk**: Markdown reconstruction loses formatting (bold, italic, lists)
**Mitigation**: Use remark-stringify which preserves markdown AST structure. Property tests verify formatting preservation.

**Risk**: Footnote numbering gets out of sync
**Mitigation**: Single pass through replacements assigns numbers sequentially. Unit tests verify no gaps or duplicates.

**Risk**: Links in code blocks get replaced incorrectly
**Mitigation**: Check node.type before replacement. Skip 'code' and 'inlineCode' nodes. Unit test specifically covers this case.

**Risk**: Idempotence fails due to duplicate footers
**Mitigation**: Check for existing "🪦 Necrolink Notes" section before adding. Remove old footer if present.

**Risk**: Lost-soul URLs accidentally get changed
**Mitigation**: Property test explicitly checks that lost-soul original URLs appear unchanged in output. Critical invariant.

---

## Notes

- This plan follows the existing codebase patterns (Result<T,E>, structured logging, Zod validation)
- Test files follow vitest patterns from tests/unit/markdown-extractor.test.ts
- API route follows pattern from src/app/api/extract/route.ts
- Property tests follow pattern from tests/property/url-normalization.test.ts
- All verification commands use the actual build/test commands from package.json
- The spec's requirement that lost-soul URLs NEVER change is enforced in multiple places (code, tests, property tests)
