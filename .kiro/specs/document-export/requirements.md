# Document Reconstruction and Export: Requirements

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Requirements

### Must Have
- Reconstruct original document with fixed links
- Replace ghost links with Wayback Machine URLs
- Add footnotes/annotations for zombie links explaining what changed
- Leave lost-soul links (dead, no archived copy) unchanged, marked 🪦 with a footnote telling the reader to find another source
- Preserve original document structure (paragraphs, headings, lists)
- Support export for Markdown files
- Support export for HTML files
- Add metadata footer: "Fixed by Necrolink on [date]"
- Return downloadable file

### Should Have
- Support PDF export (generate new PDF with fixed links)
- Preserve document formatting (bold, italic, code blocks in MD)
- Add visual indicators (emoji): 👻→⏮️ resurrected, 🧟 zombie, 🪦 lost soul
- Generate summary report of changes made
- Allow selective fixing (user chooses which links to fix)

### Could Have (Stretch Goals)
- Side-by-side diff view
- DOCX export
- Batch export (zip multiple fixed documents)
- Export to different format than input

### Won't Have (Out of Scope)
- Editing document content (only fix links)
- Format conversion (PDF to Word, etc.)
- Cloud storage integration
- Version history

---

## Success Criteria

### Functional
1. ✅ Correctly replaces all ghost links with archive URLs
2. ✅ Adds footnotes for all zombie links
2b. ✅ Leaves lost-soul URLs unchanged and marks them 🪦 with a note
3. ✅ Preserves original document structure
4. ✅ Exports to correct file format
5. ✅ Downloadable file works in viewer/editor

### Quality
1. ✅ Property tests verify content preservation
2. ✅ Property tests verify all links replaced
3. ✅ Unit test coverage >80%
4. ✅ No data loss during reconstruction

### Performance
1. ✅ Reconstructs 50-link document in <1 second
2. ✅ Large documents (500+ links) in <5 seconds
3. ✅ Minimal memory usage

### User Experience
1. ✅ Clear visual indicators for fixed links
2. ✅ Footnotes explain zombie changes
3. ✅ Summary shows what was fixed
4. ✅ Download happens immediately

---

## Edge Cases

1. **Same URL multiple times**: Replace all occurrences
2. **Nested links**: HTML doesn't allow this, but handle gracefully
3. **Link in code block**: Don't replace (it's an example)
4. **Relative links**: Don't try to fix (internal navigation)
5. **Email/tel links**: Don't touch (not web URLs)
6. **Already archived links**: Don't re-archive
7. **Footnote numbering**: Sequential, no gaps

---
