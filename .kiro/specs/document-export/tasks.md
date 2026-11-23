# Document Reconstruction and Export: Implementation Tasks

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Tasks

### Phase 1: Markdown Export
- [x] **Task 1.1**: Set up remark stringify
  - Install dependencies
  - Configure options
  - Test basic parsing and stringifying

- [x] **Task 1.2**: Implement `reconstructMarkdown()`
  - Parse original markdown to AST
  - Visit link nodes
  - Replace ghost links
  - Add zombie footnotes
  - Add metadata footer

- [x] **Task 1.3**: Add visual indicators
  - 👻→⏮️ for resurrected links
  - 🧟 for zombie links
  - 🪦 for lost souls (URL unchanged)
  - Footnote references [^1], numbered across zombies and lost souls

- [x] **Task 1.4**: Unit tests
  - Test ghost link replacement
  - Test zombie footnote addition
  - Test lost soul keeps original URL and gets a 🪦 footnote
  - Test footer generation
  - Test with no fixes (should just add footer)

### Phase 2: HTML Export
- [x] **Task 2.1**: Implement `reconstructHTML()`
  - Parse HTML with cheerio
  - Select all `<a>` elements
  - Replace ghost links
  - Add zombie footnotes

- [ ] **Task 2.2**: Add CSS styling
  - Style resurrected links (different color)
  - Style zombie warnings
  - Style footnotes section
  - Responsive design

- [x] **Task 2.3**: Unit tests
  - Test link replacement in HTML
  - Test footnote section generation
  - Test with complex nested HTML

### Phase 3: Replacement Map Builder
- [x] **Task 3.1**: Implement `buildReplacementMap()`
  - Match links with check results
  - Create replacement rules for ghosts
  - Create footnotes for zombies
  - Create footnotes for lost souls
  - Assign footnote numbers

- [x] **Task 3.2**: Handle edge cases
  - Same URL appears multiple times
  - Link has both ghost and zombie status (prioritize ghost)
  - No fixes needed

### Phase 4: API Endpoint
- [x] **Task 4.1**: Create `/api/export` route
  - Accept document ID + check results
  - Build replacement map
  - Reconstruct document
  - Return file download

- [x] **Task 4.2**: Handle different formats
  - Detect input format
  - Call appropriate reconstructor
  - Set correct Content-Type
  - Set download filename

- [ ] **Task 4.3**: Add selective fixing
  - Accept array of link IDs to fix
  - Build replacement map for selected only
  - Return summary of what was fixed

### Phase 5: Summary Report
- [x] **Task 5.1**: Generate change summary
  - Count ghosts resurrected
  - Count zombies flagged
  - Count lost souls and list them (links that couldn't be fixed)
  - Format as markdown

- [x] **Task 5.2**: Add to document footer
  - Statistics summary
  - Link to Necrolink
  - Timestamp

### Phase 6: Property-Based Testing
- [x] **Task 6.1**: Test content preservation
  - Non-link content unchanged
  - Document structure preserved
  - Formatting preserved (bold, italic)

- [x] **Task 6.2**: Test replacement correctness
  - All ghosts replaced
  - All zombies annotated
  - Lost-soul URLs are never changed
  - No links missed
  - No incorrect replacements

- [ ] **Task 6.3**: Test idempotence
  - Running export twice produces same result
  - (Except footer duplication - need to handle)

### Phase 7: UI Integration
- [ ] **Task 7.1**: Download button
  - "Download Fixed Document" button
  - Show format selector (MD/HTML)
  - Trigger download

- [ ] **Task 7.2**: Preview before download
  - Show diff view
  - Highlight changes
  - Allow deselecting links

- [ ] **Task 7.3**: Batch export
  - Export multiple documents as zip
  - Include summary report

---

## Testing Notes

**Test Documents to Try**:
1. Simple markdown with 5 links
2. Academic paper with 40+ citations
3. HTML blog post with images and links
4. Document with no fixes needed
5. Document where all links are dead

**Manual Testing Checklist**:
- [ ] Download opens in text editor
- [ ] Links are clickable in viewer
- [ ] Footnotes are numbered correctly
- [ ] Footer appears at bottom
- [ ] Visual indicators show up
- [ ] No content lost
- [ ] Formatting preserved
