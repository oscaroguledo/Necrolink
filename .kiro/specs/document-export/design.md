# Document Reconstruction and Export: Design

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Implementation Notes (Nov 2026)

Implemented in `src/lib/exporters/` and `POST /api/export` (see docs/API.md).
Deliberate changes from the sketches below:

- **Markdown is edited in place** at remark's positions instead of
  re-serialized with remark-stringify (which reformats the whole document).
  Non-link content stays byte-for-byte identical; this is property-tested.
- **Footnotes are `[^necrolink-N]`**, so they never collide with the author's `[^1]`.
- **Notes are escaped.** Zombie reasons quote titles from arbitrary pages; the
  HTML sketch interpolated them raw (stored XSS in the exported file).
- **HTML footnote refs go after the link**, not inside it (no nested `<a>`).
- **The footer links the GitHub repo, not necrolink.dev.** That domain is not
  owned; whoever registers it would turn every exported footer into a zombie link.
- **PDFs get a Markdown resurrection report** instead of a regenerated PDF.
- Matching uses original URL + occurrence, so one URL cited on different dates
  can get different archive copies.

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
│  lost   → unchanged URL + 🪦 footnote         │
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
│  "X resurrected, Y zombies, Z lost souls"    │
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
    type: 'ghost' | 'zombie' | 'lost' | 'none';
    newUrl?: string;           // for ghosts
    annotation?: string;        // for zombies and lost souls
    footnoteId?: number;        // for zombies and lost souls (shared numbering)
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
          footnoteId: rules.filter(r => r.replacement.footnoteId).length + 1,
        },
      });
    } else if (result.status === 'lost') {
      // Dead with no archived copy: keep the URL, add a note
      rules.push({
        linkId: link.id,
        originalUrl: link.url,
        position: link.position,
        replacement: {
          type: 'lost',
          annotation: 'This link is dead and no archived copy exists. Find another source.',
          footnoteId: rules.filter(r => r.replacement.footnoteId).length + 1,
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
    } else if (rule.replacement.type === 'lost') {
      // Keep the URL; there is nothing to resurrect it from
      const footnoteId = rule.replacement.footnoteId!;

      if (node.children[0]?.type === 'text') {
        node.children[0].value = `🪦 ${node.children[0].value}[^${footnoteId}]`;
      }

      footnotes.push(`[^${footnoteId}]: 🪦 Lost soul: ${rule.replacement.annotation}`);
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
  result += `${replacements.filter(r => r.replacement.type === 'zombie').length} zombies flagged, `;
  result += `${replacements.filter(r => r.replacement.type === 'lost').length} lost souls*\n`;
  
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
      $elem.append(`<sup><a href="#note-${footnoteId}">[${footnoteId}]</a></sup>`);
      
      footnotes.push(`
        <li id="note-${footnoteId}">
          ⚠️ This link may have changed: ${rule.replacement.annotation}
        </li>
      `);
    } else if (rule.replacement.type === 'lost') {
      const footnoteId = rule.replacement.footnoteId!;

      $elem.attr('data-necrolink-lost', 'true');
      $elem.prepend('<span title="Dead, no archived copy">🪦</span> ');
      $elem.append(`<sup><a href="#note-${footnoteId}">[${footnoteId}]</a></sup>`);

      footnotes.push(`
        <li id="note-${footnoteId}">
          🪦 Lost soul: ${rule.replacement.annotation}
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
  const lostCount = replacements.filter(r => r.replacement.type === 'lost').length;
  
  $('body').append(`
    <hr>
    <footer id="necrolink-footer">
      <p><em>
        Fixed by <a href="https://necrolink.dev">Necrolink</a> on ${new Date().toLocaleDateString()}
      </em></p>
      <p><em>${ghostCount} ghosts resurrected, ${zombieCount} zombies flagged, ${lostCount} lost souls</em></p>
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
[this reference](https://oldsite.com/ref). See also [the dataset](https://gone.example.org/data).
```

**Output** (after fixing):
```markdown
# My Research Paper

Check out 👻→⏮️ [this study](https://web.archive.org/web/20230101/https://example.com/study) and 
🧟 [this reference](https://oldsite.com/ref)[^1]. See also 🪦 [the dataset](https://gone.example.org/data)[^2].

---

## 🪦 Necrolink Notes

[^1]: ⚠️ This link may have changed: Domain was taken over by a parking page

[^2]: 🪦 Lost soul: This link is dead and no archived copy exists. Find another source.

---

*Fixed by [Necrolink](https://necrolink.dev) on 11/12/2026*
*1 ghost resurrected, 1 zombie flagged, 1 lost soul*
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
    this reference<sup><a href="#note-1">[1]</a></sup>
  </a>.
  See also
  <a href="https://gone.example.org/data" data-necrolink-lost="true">
    <span title="Dead, no archived copy">🪦</span> the dataset<sup><a href="#note-2">[2]</a></sup>
  </a>.
</p>

<hr>
<section id="necrolink-notes">
  <h2>🪦 Necrolink Notes</h2>
  <ol>
    <li id="note-1">
      ⚠️ This link may have changed: Domain was taken over by a parking page
    </li>
    <li id="note-2">
      🪦 Lost soul: This link is dead and no archived copy exists. Find another source.
    </li>
  </ol>
</section>

<hr>
<footer id="necrolink-footer">
  <p><em>Fixed by <a href="https://necrolink.dev">Necrolink</a> on 11/12/2026</em></p>
  <p><em>1 ghost resurrected, 1 zombie flagged, 1 lost soul</em></p>
</footer>
```

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
