# Spec: Zombie Detection (AI-Powered Content Comparison)

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Requirements

### Must Have
- Compare archived snapshot with current live page
- Use AI (Kiro API) to determine if content has changed significantly
- Extract main text content from both versions (strip ads, nav, footer)
- Detect domain takeovers (now spam/casino/parking page)
- Detect complete topic changes (research paper → unrelated content)
- Return confidence score (0-1) for zombie classification
- Provide human-readable explanation of what changed
- Only check suspicious links (not every link) to save API costs
- Cache zombie detection results for 24 hours

### Should Have
- Two-stage filtering to minimize AI calls:
  - Stage 1: Quick similarity check (word overlap or embeddings)
  - Stage 2: AI analysis only for suspicious cases
- Compare title tags first (cheap check)
- Detect redirect chains and domain changes
- Handle paywalled content gracefully
- Batch multiple checks to same API call (if possible)

### Could Have (Stretch Goals)
- Visual diff showing what changed
- Screenshot comparison for visual changes
- Detect soft paywalls vs. content changes
- Multi-language support for non-English pages

### Won't Have (Out of Scope)
- Real-time monitoring of changes
- Historical trend analysis
- Browser automation for JavaScript-heavy sites
- Login to check authenticated content

---

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Input: Suspicious Link from Check          │
│  (redirected, title changed, etc.)          │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Stage 1: Quick Similarity Check             │
│  - Compare title tags                        │
│  - Compare domains                           │
│  - Word overlap or embedding similarity      │
└──────────────┬───────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
   ┌────────┐      ┌─────────────┐
   │ Clearly│      │ Suspicious  │
   │ Living │      │ (proceed to │
   │ (skip) │      │  Stage 2)   │
   └────────┘      └──────┬──────┘
                          │
                          ▼
              ┌────────────────────────┐
              │ Fetch Both Pages:      │
              │ 1. Archived (Wayback)  │
              │ 2. Current (live)      │
              └──────────┬─────────────┘
                         │
                         ▼
              ┌────────────────────────┐
              │ Extract Main Content   │
              │ (@mozilla/readability) │
              │ Strip ads, nav, footer │
              └──────────┬─────────────┘
                         │
                         ▼
              ┌────────────────────────┐
              │ Stage 2: AI Analysis   │
              │ (Kiro API)             │
              │ Compare content        │
              └──────────┬─────────────┘
                         │
                 ┌───────┴────────┐
                 │                │
                 ▼                ▼
            ┌─────────┐      ┌─────────┐
            │ Living  │      │ Zombie  │
            │ (minor  │      │ (major  │
            │ changes)│      │ changes)│
            └─────────┘      └─────────┘
```

### Stage 1: Quick Similarity Check

**Goal**: Filter out obvious living links to avoid expensive AI calls

```typescript
interface QuickCheckResult {
  isLikelySame: boolean;
  reason: string;
  confidence: number;
}

async function quickSimilarityCheck(
  originalUrl: string,
  currentUrl: string,
  archivedTitle: string,
  currentTitle: string
): Promise<QuickCheckResult> {
  // 1. Domain changed?
  const origDomain = new URL(originalUrl).hostname;
  const currDomain = new URL(currentUrl).hostname;
  
  if (origDomain !== currDomain) {
    return {
      isLikelySame: false,
      reason: 'Domain changed',
      confidence: 0.9
    };
  }
  
  // 2. Title completely different?
  const titleSimilarity = calculateStringSimilarity(
    archivedTitle,
    currentTitle
  );
  
  if (titleSimilarity < 0.3) {
    return {
      isLikelySame: false,
      reason: 'Title drastically changed',
      confidence: 0.8
    };
  }
  
  // 3. Title mostly the same?
  if (titleSimilarity > 0.8) {
    return {
      isLikelySame: true,
      reason: 'Title similar',
      confidence: 0.7
    };
  }
  
  // Uncertain - needs AI analysis
  return {
    isLikelySame: false,
    reason: 'Uncertain, needs deeper check',
    confidence: 0.5
  };
}

// Simple string similarity (Jaccard index on words)
function calculateStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  
  const intersection = new Set(
    [...wordsA].filter(word => wordsB.has(word))
  );
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}
```

### Stage 2: AI-Powered Analysis

**Goal**: Determine if content topic/purpose has changed

```typescript
interface ZombieAnalysis {
  isZombie: boolean;
  confidence: number;
  reason: string;
  changes: {
    titleChanged: boolean;
    contentDrift: 'none' | 'minor' | 'major' | 'complete';
    possibleTakeover: boolean;
  };
}

async function analyzeWithAI(
  archivedContent: string,
  currentContent: string,
  archivedTitle: string,
  currentTitle: string
): Promise<ZombieAnalysis> {
  const prompt = `Compare these two versions of the same web page:

ARCHIVED VERSION (from ${archivedDate}):
Title: ${archivedTitle}
Content (first 2000 chars): ${archivedContent.substring(0, 2000)}

CURRENT VERSION:
Title: ${currentTitle}
Content (first 2000 chars): ${currentContent.substring(0, 2000)}

Determine if this is a "zombie link" — a URL that still loads but no longer shows the same content.

A link IS a zombie if:
- The title changed completely (not just minor edits)
- The content topic is different (e.g., research paper → advertisement)
- The domain appears to have been taken over (now shows spam/casino/parking page)
- The original information is gone and replaced with unrelated content

A link is NOT a zombie if:
- The content was updated but still covers the same topic
- The page was redesigned but the information remains
- Minor corrections or additions were made
- It's the same site with a new template

Respond with JSON only:
{
  "isZombie": boolean,
  "confidence": number (0-1),
  "reason": string (one sentence explaining the decision),
  "changes": {
    "titleChanged": boolean,
    "contentDrift": "none" | "minor" | "major" | "complete",
    "possibleTakeover": boolean
  }
}`;

  // Kiro API: OpenAI-compatible chat completions endpoint
  const res = await fetch(`${process.env.KIRO_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.KIRO_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.KIRO_MODEL ?? 'kiro/auto',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Kiro API error ${res.status}`);

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### Content Extraction with Readability

**Goal**: Extract main article content, strip navigation/ads

```typescript
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

async function extractMainContent(
  html: string,
  url: string
): Promise<{ title: string; content: string }> {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article) {
    // Fallback: extract <body> text
    return {
      title: dom.window.document.title || '',
      content: dom.window.document.body.textContent || '',
    };
  }
  
  return {
    title: article.title,
    content: article.textContent,
  };
}
```

### Fetching Archived Pages

```typescript
async function fetchArchivedPage(
  waybackUrl: string
): Promise<string> {
  // Wayback returns page with their banner/toolbar
  // Need to extract the original content
  
  const response = await fetch(waybackUrl, {
    headers: {
      'User-Agent': 'Necrolink/0.1.0 (Link checker)',
    },
    signal: AbortSignal.timeout(10000),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch archived page: ${response.status}`);
  }
  
  let html = await response.text();
  
  // Remove Wayback Machine toolbar/banner
  html = removeWaybackToolbar(html);
  
  return html;
}

function removeWaybackToolbar(html: string): string {
  // Wayback injects toolbar - remove it
  return html
    .replace(/<!-- BEGIN WAYBACK TOOLBAR INSERT -->.*?<!-- END WAYBACK TOOLBAR INSERT -->/gs, '')
    .replace(/<script.*?src=".*?web\.archive\.org.*?<\/script>/gi, '');
}
```

---

## Tasks

### Phase 1: Content Extraction
- [ ] **Task 1.1**: Set up Readability + jsdom
  - Install dependencies
  - Test basic extraction
  - Handle extraction failures

- [ ] **Task 1.2**: Implement `extractMainContent()`
  - Parse HTML with jsdom
  - Run Readability algorithm
  - Fallback to body text if needed
  - Return title and content

- [ ] **Task 1.3**: Implement Wayback toolbar removal
  - Strip Wayback injected scripts
  - Remove toolbar HTML
  - Test with real Wayback URLs

- [ ] **Task 1.4**: Unit tests for extraction
  - Test with article page
  - Test with page that has ads/nav
  - Test with complex nested HTML
  - Test extraction failure fallback

### Phase 2: Quick Similarity Check
- [ ] **Task 2.1**: Implement string similarity function
  - Jaccard index on word sets
  - Or: Levenshtein distance
  - Or: Simple word overlap
  - Choose simplest that works

- [ ] **Task 2.2**: Implement `quickSimilarityCheck()`
  - Compare domains
  - Compare titles
  - Return confidence score
  - Short-circuit on obvious cases

- [ ] **Task 2.3**: Property-based tests
  - Identical strings have similarity 1.0
  - Completely different strings have similarity ~0
  - Symmetry: sim(a,b) === sim(b,a)

### Phase 3: AI Integration
- [ ] **Task 3.1**: Set up Kiro API client
  - Small fetch wrapper (no SDK needed)
  - Configure KIRO_API_KEY and KIRO_API_BASE_URL
  - Test basic completion

- [ ] **Task 3.2**: Implement zombie detection prompt
  - Craft clear prompt with examples
  - Truncate content to 2000 chars
  - Request structured JSON response
  - Handle parsing errors

- [ ] **Task 3.3**: Implement `analyzeWithAI()`
  - Call the Kiro API
  - Parse JSON response
  - Handle API errors
  - Retry on rate limit (with backoff)

- [ ] **Task 3.4**: Cost optimization
  - Track API calls per session
  - Log token usage
  - Estimate monthly cost
  - Set budget alerts

### Phase 4: End-to-End Zombie Detection
- [ ] **Task 4.1**: Implement `detectZombie()`
  - Fetch archived page
  - Fetch current page
  - Extract content from both
  - Run quick check
  - Run AI analysis if needed
  - Return zombie report

- [ ] **Task 4.2**: Add caching
  - Cache zombie results for 24h
  - Key by URL + content hash
  - Invalidate on user request

- [ ] **Task 4.3**: Error handling
  - Handle Wayback fetch failures
  - Handle current page fetch failures
  - Handle AI API errors
  - Return error status with details

### Phase 5: API Endpoint
- [ ] **Task 5.1**: Create `/api/zombie` route
  - Accept suspicious link
  - Run zombie detection
  - Return analysis result

- [ ] **Task 5.2**: Integrate with check endpoint
  - Call zombie detection for suspicious links
  - Update link status based on result
  - Stream zombie results back

- [ ] **Task 5.3**: Rate limiting
  - Limit AI calls per IP
  - Queue requests if needed
  - Return 429 if over limit

### Phase 6: Testing
- [ ] **Task 6.1**: Create test fixtures
  - Known zombie: domain takeover
  - Known zombie: topic change
  - Known living: minor update
  - Known living: redesign

- [ ] **Task 6.2**: Integration tests
  - Test with real zombie case
  - Test with real living case
  - Test with archived vs. current
  - Verify confidence scores

- [ ] **Task 6.3**: Test AI prompt quality
  - Does it catch obvious zombies?
  - Does it avoid false positives?
  - Are explanations clear?
  - Iterate on prompt if needed

### Phase 7: UI Integration
- [ ] **Task 7.1**: Display zombie report
  - Show reason in graveyard
  - Highlight changed sections
  - Link to both versions

- [ ] **Task 7.2**: Allow user override
  - "Mark as living" button
  - "Mark as zombie" button
  - Update cached result

---

## Success Criteria

### Functional
1. ✅ Correctly identifies zombies (domain takeover, topic change)
2. ✅ Avoids false positives (minor updates aren't zombies)
3. ✅ Quick check filters out 70%+ of links (saves AI costs)
4. ✅ AI analysis provides clear explanations
5. ✅ Handles errors gracefully

### Quality
1. ✅ Integration tests with known zombie/living cases
2. ✅ AI prompt catches >90% of real zombies
3. ✅ False positive rate <10%
4. ✅ Clear error messages

### Performance
1. ✅ Quick check takes <500ms
2. ✅ Full AI analysis takes <3s
3. ✅ AI calls kept to minimum (<20% of total links)
4. ✅ Costs <$1 for 1000 links checked

### User Experience
1. ✅ Zombie explanation is human-readable
2. ✅ Shows what changed
3. ✅ Links to both versions for verification
4. ✅ Allows manual override

---

## API Design

### Endpoint: POST /api/zombie

**Request Body**:
```json
{
  "linkId": "link_123",
  "originalUrl": "https://example.com/page",
  "currentUrl": "https://example.com/page",
  "archivedUrl": "https://web.archive.org/web/20230101/https://example.com/page",
  "archivedDate": "2023-01-01T00:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isZombie": true,
    "confidence": 0.95,
    "reason": "Domain was taken over by a parking page with ads",
    "changes": {
      "titleChanged": true,
      "contentDrift": "complete",
      "possibleTakeover": true
    },
    "archivedSnapshot": {
      "title": "Research Paper Title",
      "contentPreview": "Abstract: This paper discusses..."
    },
    "currentPage": {
      "title": "Domain For Sale",
      "contentPreview": "This domain is for sale. Buy now..."
    }
  }
}
```

---

## Edge Cases

1. **Paywall pages**: Can't fetch content → mark as "uncertain"
2. **JavaScript-heavy SPAs**: Readability may fail → use raw text
3. **Non-English content**: AI can still compare, but may be less accurate
4. **Very short pages**: Hard to determine drift → lower confidence
5. **Redirects**: Compare final destination, not intermediate
6. **Soft 404s**: Page returns 200 but says "not found" → check content
7. **Archived page won't load**: Can't compare → return error

---

## Cost Analysis

**Kiro API usage** (as of Nov 2026):
- Calls are billed against the Kiro account's credits (see the Kiro account/billing page)
- Hackathon participants can request extra Kiro credits (Kiroween Resources tab)

**Estimated usage**:
- Average prompt: ~4000 tokens (2000 archived + 2000 current + prompt)
- Average output: ~100 tokens (JSON response)
- 1000 links → ~1000 calls without filtering

**Optimization**:
- Quick check filters out 70%+ → only ~300 AI calls for 1000 links
- Well within hackathon budget ✅

---

## Testing Notes

**Known Zombie Cases** (for testing):
1. Domain takeover: old blog → parking page
2. Topic change: research site → commercial site
3. Complete replacement: original content gone

**Known Living Cases**:
1. Minor update: typo fixes, small edits
2. Redesign: same content, new template
3. Expansion: added sections, original content intact

**Test Prompt Quality**:
- Run 100 known cases through AI
- Measure accuracy, false positives, false negatives
- Iterate on prompt wording
- A/B test different prompt formats

---

## Dependencies

```json
{
  "@mozilla/readability": "^0.5.0",
  "jsdom": "^23.0.0"
}
```