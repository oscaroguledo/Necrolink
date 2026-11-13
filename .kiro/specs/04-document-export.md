# Spec: Document Reconstruction and Export

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Requirements

### Must Have
- Reconstruct original document with fixed links
- Replace ghost links with Wayback Machine URLs
- Add footnotes/annotations for zombie links explaining what changed
- Preserve original document structure (paragraphs, headings, lists)
- Support export for Markdown files
- Support export for HTML files
- Add metadata footer: "Fixed by Necrolink on [date]"
- Return downloadable file

### Should Have
- Support PDF export (generate new PDF with fixed links)
- Preserve document formatting (bold, italic, code blocks in MD)
- Add visual indicators (emoji) for fixed links: 👻→⏮️
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

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Input: Original Document + Check Results   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Build Replacement Map                       │
│  ghost → Wayback URL                         │
│  zombie → annotation with explanation        │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Reconstruct Document                        │
│  - Parse original document                   │
│  - Replace URLs at correct positions         │
│  - Add footnotes for zombies                 │
│  - Preserve structure                        │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Add Metadata Footer                         │
│  "Fixed by Necrolink on [date]"              │
│  "X ghosts resurrected, Y zombies flagged"   │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Export to File Format                       │
│  - Markdown → .md                            │
│  - HTML → .html                              │
│  - PDF → .pdf (generate)                     │
└──────────────┬───────────────────────────────┘
               │
               ▼
        ┌──────────────┐
        │  Download    │
        └──────────────┘
```

### Replacement Strategy

```typescript
interface ReplacementRule {
  linkId: string;
  originalUrl: string;
  position: Position;
  replacement: {
    type: 'ghost' | 'zombie' | 'none';
    newUrl?: string;           // for ghosts
    annotation?: string;        // for zombies
    footnoteId?: number;        // for zombies
  };
}

function buildReplacementMap(
  links: Link[],
  checkResults: CheckResult[]
): ReplacementRule[] {
  const rules: ReplacementRule[] = [];
  
  for (const link of links) {
    const result = checkResults.find(r => r.linkId === link.id);
    if (!result) continue;
    
    if (result.status === 'ghost' && result.archived) {
      // Replace with Wayback URL
      rules.push({
        linkId: link.id,
        originalUrl: link.url,
        position: link.position,
        replacement: {
          type: 'ghost',
          newUrl: result.archived.url,
        },
      });
    } else if (result.status === 'zombie' && result.zombie) {
      // Add footnote annotation
      rules.push({
        linkId: link.id,
        originalUrl: link.url,
        position: link.position,
        replacement: {
          type: 'zombie',
          annotation: result.zombie.reason,
          footnoteId: rules.filter(r => r.replacement.type === 'zombie').length + 1,
        },
      });
    }
  }
  
  return rules;
}
```

### Markdown Reconstruction

```typescript
// src/lib/exporters/markdown.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

export async function reconstructMarkdown(
  originalContent: string,
  replacements: ReplacementRule[]
): Promise<string> {
  const tree = unified().use(remarkParse).parse(originalContent);
  
  const footnotes: string[] = [];
  
  // Visit all link nodes and replace if needed
  visit(tree, 'link', (node) => {
    const rule = replacements.find(
      r => r.originalUrl === node.url
    );
    
    if (!rule) return;
    
    if (rule.replacement.type === 'ghost') {
      // Replace URL with Wayback link
      node.url = rule.replacement.newUrl!;
      
      // Add visual indicator
      if (node.children[0]?.type === 'text') {
        node.children[0].value = `👻→⏮️ ${node.children[0].value}`;
      }
    } else if (rule.replacement.type === 'zombie') {
      // Add footnote reference
      const footnoteId = rule.replacement.footnoteId!;
      
      if (node.children[0]?.type === 'text') {
        node.children[0].value = `🧟 ${node.children[0].value}[^${footnoteId}]`;
      }
      
      footnotes.push(
        `[^${footnoteId}]: ⚠️ This link may have changed: ${rule.replacement.annotation}`
      );
    }
  });
  
  // Convert back to markdown
  let result = unified().use(remarkStringify).stringify(tree);
  
  // Add footnotes section
  if (footnotes.length > 0) {
    result += '\n\n---\n\n## 🪦 Necrolink Notes\n\n';
    result += footnotes.join('\n\n');
  }
  
  // Add metadata footer
  result += `\n\n---\n\n*Fixed by [Necrolink](https://necrolink.dev) on ${new Date().toLocaleDateString()}*\n`;
  result += `*${replacements.filter(r => r.replacement.type === 'ghost').length} ghosts resurrected, `;
  result += `${replacements.filter(r => r.replacement.type === 'zombie').length} zombies flagged*\n`;
  
  return result;
}
```

### HTML Reconstruction

```typescript
// src/lib/exporters/html.ts
import * as cheerio from 'cheerio';

export function reconstructHTML(
  originalHtml: string,
  replacements: ReplacementRule[]
): string {
  const $ = cheerio.load(originalHtml);
  const footnotes: string[] = [];
  
  // Find and replace links
  $('a[href]').each((i, elem) => {
    const $elem = $(elem);
    const href = $elem.attr('href');
    
    const rule = replacements.find(r => r.originalUrl === href);
    if (!rule) return;
    
    if (rule.replacement.type === 'ghost') {
      // Replace href with Wayback link
      $elem.attr('href', rule.replacement.newUrl!);
      $elem.attr('data-necrolink-ghost', 'true');
      
      // Add visual indicator
      $elem.prepend('<span title="Resurrected from archive">👻→⏮️</span> ');
    } else if (rule.replacement.type === 'zombie') {
      const footnoteId = rule.replacement.footnoteId!;
      
      $elem.attr('data-necrolink-zombie', 'true');
      $elem.append(`<sup><a href="#zombie-${footnoteId}">[${footnoteId}]</a></sup>`);
      
      footnotes.push(`
        <li id="zombie-${footnoteId}">
          ⚠️ This link may have changed: ${rule.replacement.annotation}
        </li>
      `);
    }
  });
  
  // Add footnotes section if any
  if (footnotes.length > 0) {
    $('body').append(`
      <hr>
      <section id="necrolink-notes">
        <h2>🪦 Necrolink Notes</h2>
        <ol>${footnotes.join('')}</ol>
      </section>
    `);
  }
  
  // Add metadata footer
  const ghostCount = replacements.filter(r => r.replacement.type === 'ghost').length;
  const zombieCount = replacements.filter(r => r.replacement.type === 'zombie').length;
  
  $('body').append(`
    <hr>
    <footer id="necrolink-footer">
      <p><em>
        Fixed by <a href="https://necrolink.dev">Necrolink</a> on ${new Date().toLocaleDateString()}
      </em></p>
      <p><em>${ghostCount} ghosts resurrected, ${zombieCount} zombies flagged</em></p>
    </footer>
  `);
  
  return $.html();
}
```

### PDF Export (Generate New PDF)

```typescript
// src/lib/exporters/pdf.ts
// Note: This is complex - consider stretch goal
import PDFDocument from 'pdfkit';

export async function generatePDF(
  markdownContent: string,
  replacements: ReplacementRule[]
): Promise<Buffer> {
  // Convert markdown to structured format
  // Generate PDF with pdfkit
  // This is complex - may want to use a service like Puppeteer
  
  // For MVP, might skip and just export as Markdown/HTML
  throw new Error('PDF export not yet implemented - use Markdown or HTML');
}
```

### Property-Based Testing for Reconstruction

```typescript
// tests/property/reconstruction.test.ts
import fc from 'fast-check';
import { reconstructMarkdown } from '@/lib/exporters/markdown';

describe('Document Reconstruction Properties', () => {
  test('reconstruction preserves non-link content', () => {
    fc.assert(
      fc.property(
        fc.lorem({ maxCount: 100 }),
        async (text) => {
          // Text with no links should be unchanged (except footer)
          const result = await reconstructMarkdown(text, []);
          expect(result).toContain(text);
        }
      )
    );
  });
  
  test('all ghost links are replaced', () => {
    // Generate markdown with links
    // Apply replacements
    // Verify all original URLs are gone and replaced
  });
  
  test('replacement is idempotent', async () => {
    const original = '[Link](https://example.com)';
    const replacements: ReplacementRule[] = [{
      linkId: '1',
      originalUrl: 'https://example.com',
      position: { offset: 0 },
      replacement: {
        type: 'ghost',
        newUrl: 'https://web.archive.org/web/20230101/https://example.com',
      },
    }];
    
    const once = await reconstructMarkdown(original, replacements);
    const twice = await reconstructMarkdown(once, replacements);
    
    // Second pass should not change anything
    // (except might add duplicate footer - need to handle)
    expect(once).toContain('web.archive.org');
  });
});
```

---

## Tasks

### Phase 1: Markdown Export
- [ ] **Task 1.1**: Set up remark stringify
  - Install dependencies
  - Configure options
  - Test basic parsing and stringifying

- [ ] **Task 1.2**: Implement `reconstructMarkdown()`
  - Parse original markdown to AST
  - Visit link nodes
  - Replace ghost links
  - Add zombie footnotes
  - Add metadata footer

- [ ] **Task 1.3**: Add visual indicators
  - 👻→⏮️ for resurrected links
  - 🧟 for zombie links
  - Footnote references [^1]

- [ ] **Task 1.4**: Unit tests
  - Test ghost link replacement
  - Test zombie footnote addition
  - Test footer generation
  - Test with no fixes (should just add footer)

### Phase 2: HTML Export
- [ ] **Task 2.1**: Implement `reconstructHTML()`
  - Parse HTML with cheerio
  - Select all `<a>` elements
  - Replace ghost links
  - Add zombie footnotes

- [ ] **Task 2.2**: Add CSS styling
  - Style resurrected links (different color)
  - Style zombie warnings
  - Style footnotes section
  - Responsive design

- [ ] **Task 2.3**: Unit tests
  - Test link replacement in HTML
  - Test footnote section generation
  - Test with complex nested HTML

### Phase 3: Replacement Map Builder
- [ ] **Task 3.1**: Implement `buildReplacementMap()`
  - Match links with check results
  - Create replacement rules for ghosts
  - Create footnotes for zombies
  - Assign footnote numbers

- [ ] **Task 3.2**: Handle edge cases
  - Same URL appears multiple times
  - Link has both ghost and zombie status (prioritize ghost)
  - No fixes needed

### Phase 4: API Endpoint
- [ ] **Task 4.1**: Create `/api/export` route
  - Accept document ID + check results
  - Build replacement map
  - Reconstruct document
  - Return file download

- [ ] **Task 4.2**: Handle different formats
  - Detect input format
  - Call appropriate reconstructor
  - Set correct Content-Type
  - Set download filename

- [ ] **Task 4.3**: Add selective fixing
  - Accept array of link IDs to fix
  - Build replacement map for selected only
  - Return summary of what was fixed

### Phase 5: Summary Report
- [ ] **Task 5.1**: Generate change summary
  - Count ghosts resurrected
  - Count zombies flagged
  - List links that couldn't be fixed
  - Format as markdown

- [ ] **Task 5.2**: Add to document footer
  - Statistics summary
  - Link to Necrolink
  - Timestamp

### Phase 6: Property-Based Testing
- [ ] **Task 6.1**: Test content preservation
  - Non-link content unchanged
  - Document structure preserved
  - Formatting preserved (bold, italic)

- [ ] **Task 6.2**: Test replacement correctness
  - All ghosts replaced
  - All zombies annotated
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

## Success Criteria

### Functional
1. ✅ Correctly replaces all ghost links with archive URLs
2. ✅ Adds footnotes for all zombie links
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

## API Design

### Endpoint: POST /api/export

**Request Body**:
```json
{
  "documentId": "abc123",
  "format": "markdown" | "html" | "pdf",
  "checkResults": [...],
  "selectedLinks": ["link_1", "link_2"],  // optional
  "options": {
    "addFooter": true,
    "addVisualIndicators": true,
    "generateSummary": true
  }
}
```

**Response** (file download):
```
Content-Type: text/markdown (or text/html)
Content-Disposition: attachment; filename="fixed-document.md"

[Fixed document content]
```

---

## Example Output

### Markdown Example

**Input**:
```markdown
# My Research Paper

Check out [this study](https://example.com/study) and 
[this reference](https://oldsite.com/ref).
```

**Output** (after fixing):
```markdown
# My Research Paper

Check out 👻→⏮️ [this study](https://web.archive.org/web/20230101/https://example.com/study) and 
🧟 [this reference](https://oldsite.com/ref)[^1].

---

## 🪦 Necrolink Notes

[^1]: ⚠️ This link may have changed: Domain was taken over by a parking page

---

*Fixed by [Necrolink](https://necrolink.dev) on 11/12/2026*
*1 ghost resurrected, 1 zombie flagged*
```

### HTML Example

```html
<p>
  Check out 
  <a href="https://web.archive.org/web/20230101/https://example.com/study" 
     data-necrolink-ghost="true">
    <span title="Resurrected from archive">👻→⏮️</span> this study
  </a> 
  and 
  <a href="https://oldsite.com/ref" data-necrolink-zombie="true">
    this reference<sup><a href="#zombie-1">[1]</a></sup>
  </a>.
</p>

<hr>
<section id="necrolink-notes">
  <h2>🪦 Necrolink Notes</h2>
  <ol>
    <li id="zombie-1">
      ⚠️ This link may have changed: Domain was taken over by a parking page
    </li>
  </ol>
</section>

<hr>
<footer id="necrolink-footer">
  <p><em>Fixed by <a href="https://necrolink.dev">Necrolink</a> on 11/12/2026</em></p>
  <p><em>1 ghost resurrected, 1 zombie flagged</em></p>
</footer>
```

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

## Dependencies

```json
{
  "unified": "^11.0.0",
  "remark-parse": "^11.0.0",
  "remark-stringify": "^11.0.0",
  "cheerio": "^1.0.0-rc.12"
}
```

**Stretch (PDF generation)**:
```json
{
  "pdfkit": "^0.14.0",
  "puppeteer": "^21.0.0"
}
```

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
