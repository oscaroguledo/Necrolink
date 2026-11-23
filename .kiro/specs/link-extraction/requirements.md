# Link Extraction from Documents: Requirements

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

## Open Questions

- [ ] Should we extract URLs from footnotes/endnotes separately?
- [ ] How to handle anchor links within the same document?
- [ ] Should we preserve URL fragments for external links?
- [ ] What's the max document size we'll accept? (suggest 10MB)

---

**Key for the write-up**: The property-based tests on URL normalization will catch edge cases that manual testing would miss. Document every bug they find — that's great content for the blog post.
