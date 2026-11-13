---
name: Product Vision and Theme
description: The spooky graveyard metaphor and user experience principles for Necrolink
inclusion: always
---

# 👻 Necrolink Product Vision

## The Graveyard Metaphor

Necrolink uses a **spooky resurrection theme** throughout the experience. This isn't just decoration — it makes the results easier to scan and understand at a glance.

### Visual Language

- **👻 Ghosts (Dead Links)**: Tombstones, gravestones, 404 errors
- **🪦 Lost Souls (Unrecoverable Links)**: Dead with no archived copy; an empty grave, honest that it can't be fixed
- **🧟 Zombies (Changed Links)**: Shambling across the page, infected, mutated
- **🕯️ Living Links**: Candles still burning, healthy, alive
- **⚰️ The Graveyard**: Your results dashboard showing all the deceased URLs
- **🪦 Resurrection**: Bringing links back from the dead via the Wayback Machine

### Tone and Voice

**Do:**
- Use playful spooky language: "summoning," "resurrection," "the digital graveyard"
- Make scary concepts friendly (Tim Burton, not horror film)
- Keep the interface fun but functional
- Use clear status indicators with emoji + text

**Don't:**
- Make it so silly that academics won't use it
- Obscure important information behind metaphors
- Use gratuitous horror imagery
- Let the theme slow down the workflow

## Target Users

1. **Researchers and Academics**: Fixing citations in papers, theses, and bibliographies
2. **Librarians**: Maintaining digital collections and course materials
3. **Journalists**: Preserving source links in articles
4. **Wikipedia Editors**: Fighting link rot in citations
5. **Content Creators**: Maintaining blog post references
6. **Students**: Ensuring thesis bibliographies stay valid

## User Experience Principles

### 1. Speed First
Users should be able to:
- Upload a document in under 3 seconds
- See preliminary results within 10 seconds
- Download the fixed version immediately after scanning completes

### 2. Clear Classification
Every link status should be immediately obvious:
- Color coding (red = ghost, grey = lost soul, yellow = zombie, green = living)
- Icons that work without color (accessibility)
- One-line explanations for zombies ("now redirects to casino site")

### 3. Trust Through Transparency
- Show the original URL and the archived URL side by side
- Link to both so users can verify
- Timestamp the archived snapshot
- Explain why we flagged a zombie

### 4. Non-Destructive by Default
- Never automatically replace links without user confirmation
- Provide a preview of changes
- Allow selective resurrection (fix only the ones you want)
- Keep the original file untouched until export

### 5. Batch-Friendly
- Support multiple document uploads
- Show progress for large documents
- Allow background processing
- Export results as a single zip

## The Graveyard Interface

The results screen is organized as a **cemetery view**:

```
┌─────────────────────────────────────┐
│  🪦 Your Digital Graveyard          │
│                                     │
│  📄 document.pdf                    │
│  ⏱️  Scanned: 2 minutes ago         │
│                                     │
│  👻 9 Ghosts (dead, resurrectable)  │
│  🪦 2 Lost Souls (dead, no archive) │
│  🧟 3 Zombies (changed)             │
│  🕯️ 26 Living (healthy)             │
│                                     │
│  [Resurrect All] [Download Fixed]  │
└─────────────────────────────────────┘
```

Each section expands to show:
- The link text from the document
- The original URL
- The problem (404, timeout, content mismatch)
- The proposed fix (archive URL with date)
- Actions (keep, replace, inspect)

## Success Metrics

A good demo shows:
1. **Real impact**: "This published paper has 40 citations. 11 are dead."
2. **The zombie catch**: "3 links still load but point to different content. One is now a gambling site."
3. **Live resurrection**: Replace dead links with archive URLs in real-time
4. **Before/after**: Show the broken document, then the fixed version

## Edge Cases to Handle Gracefully

1. **No archived snapshot exists**: Classify as a 🪦 Lost Soul; keep the URL, list it separately, never pretend it was fixed
2. **Multiple snapshots available**: Pick the closest to the original citation date
3. **Paywalled content**: Can't verify zombie status; mark as "uncertain"
4. **Redirects**: Follow up to 3 redirects before checking content
5. **Non-HTML links**: PDFs, images, etc. — check availability only, skip zombie detection

## The Resurrection Process

When a user clicks "Resurrect":
1. Show a progress overlay with spooky animations
2. For each dead link, query the Wayback Machine
3. Replace the URL in the document structure
4. Add a footnote or citation noting the archived date
5. Generate the fixed document
6. Provide a summary report

## Accessibility Requirements

- All status indicators must work without color
- Screen reader friendly labels for all emoji
- Keyboard navigation for the entire graveyard interface
- High contrast mode support
- Text descriptions for all zombie explanations

## Privacy and Ethics

- Never store uploaded documents longer than 24 hours
- Don't send document content to third parties (only extracted URLs)
- Clear privacy policy about what we check and what we keep
- Option to delete results immediately after download

---

**Remember**: The spooky theme serves the function. It makes a tedious task (checking dozens of citations) feel engaging, and it makes the status of each link instantly recognizable. But clarity always wins over cuteness.