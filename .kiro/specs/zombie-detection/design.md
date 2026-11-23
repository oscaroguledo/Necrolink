# Zombie Detection (AI-Powered Content Comparison): Design

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

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

## Dependencies

```json
{
  "@mozilla/readability": "^0.5.0",
  "jsdom": "^23.0.0"
}
```
