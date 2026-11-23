# Link Health Checking (Ghost/Lost Soul/Zombie/Living): Design

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  POST /api/check (streaming SSE)            │
│  Input: Link[] from extraction              │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  Rate Limiter + Concurrency Control          │
│  (p-limit: max 10 concurrent)                │
└──────────────┬───────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  For Each Link:      │
    │  1. Try HEAD request │
    │  2. Follow redirects │
    │  3. Check status     │
    └──────────┬───────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
   ┌────────┐      ┌─────────┐
   │ Living │      │ Ghost?  │
   │ (200)  │      │ (404)   │
   └────────┘      └────┬────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Query Wayback    │
              │ CDX API          │
              └────────┬─────────┘
                       │
               ┌───────┴────────┐
               │                │
               ▼                ▼
         ┌──────────┐     ┌────────────┐
         │ Archived │     │ No usable  │
         │ Found    │     │ snapshot   │
         └────┬─────┘     └─────┬──────┘
              │                 │
              ▼                 ▼
       ┌─────────────┐   ┌─────────────┐
       │ Ghost       │   │ Lost soul   │
       │ (resurrect  │   │ (dead, no   │
       │  via archive│   │  archive)   │
       └─────────────┘   └─────────────┘

  Separately, pages that load but look suspicious
  (cross-domain redirect, title change) → Zombie? (see spec 03)
```

### Link Classification Logic

```typescript
type LinkStatus = 'living' | 'ghost' | 'lost' | 'zombie' | 'error';

async function classifyLink(link: Link): Promise<CheckResult> {
  // 1. Try to fetch the current page
  const fetchResult = await fetchWithRetry(link.url);
  
  if (fetchResult.ok) {
    // 2. Living: page loads successfully
    if (fetchResult.statusCode === 200) {
      return {
        status: 'living',
        finalUrl: fetchResult.finalUrl,
        redirected: fetchResult.wasRedirected
      };
    }
  }
  
  // 3. Ghost: 404, DNS fail, timeout, or other error
  if (isDeadStatus(fetchResult.statusCode) || fetchResult.error) {
    // 4. Query Wayback Machine for archived snapshot
    const archived = await findArchivedSnapshot(
      link.url, 
      link.citationDate
    );
    
    // 4a. Lost soul: dead, and no usable (status 200) snapshot exists
    if (!archived) {
      return {
        status: 'lost',
        error: fetchResult.error ?? 'No archived snapshot found'
      };
    }

    // 4b. Ghost: dead, but resurrectable from the archive
    return {
      status: 'ghost',
      archived,
      error: fetchResult.error
    };
  }
  
  // 5. Suspicious: needs zombie detection
  if (isSuspicious(fetchResult)) {
    return {
      status: 'zombie', // tentative, needs content check
      suspicious: true,
      reason: getSuspiciousReason(fetchResult)
    };
  }
  
  return { status: 'error', error: 'Unknown status' };
}
```

### Wayback Machine CDX API

**Endpoint**: `https://web.archive.org/cdx/search/cdx`

> **Verified against the live API (Nov 2026):** results are **oldest first** by
> default, not newest first. Use `limit=-N` for the newest N, and
> `sort=closest&closest=<timestamp>` for captures nearest a citation date. A URL
> that was never archived returns `[]`.

**Query Parameters**:
```typescript
interface CDXQuery {
  url: string;              // URL to search
  matchType: 'exact';       // exact match only
  limit: number;            // max results
  from?: string;            // start timestamp (YYYYMMDDhhmmss)
  to?: string;              // end timestamp
  filter: string;           // e.g., "statuscode:200"
  output: 'json';           // response format
  fl: string;               // fields: timestamp,original,statuscode,mimetype
}
```

**Example Request**:
```bash
curl "http://web.archive.org/cdx/search/cdx?\
url=example.com/page&\
matchType=exact&\
output=json&\
fl=timestamp,original,statuscode,mimetype&\
filter=statuscode:200&\
limit=100"
```

**Example Response**:
```json
[
  ["timestamp", "original", "statuscode", "mimetype"],
  ["20230615120000", "http://example.com/page", "200", "text/html"],
  ["20230501080000", "http://example.com/page", "200", "text/html"],
  ["20221215160000", "http://example.com/page", "200", "text/html"]
]
```

### Finding Closest Snapshot

```typescript
function findClosestSnapshot(
  snapshots: CDXSnapshot[],
  citationDate?: Date
): CDXSnapshot | null {
  if (snapshots.length === 0) return null;
  
  // Sketch only, with two bugs fixed in src/lib/wayback/cdx.ts:
  // CDX returns OLDEST first, and subtracting YYYYMMDDhhmmss as integers is
  // not a time difference (see BUGS_FOUND.md #9).
  // If no citation date, return most recent
  if (!citationDate) {
    return snapshots[0]; // CDX returns newest first
  }
  
  // Find snapshot closest to citation date
  const targetTimestamp = toWaybackTimestamp(citationDate);
  
  return snapshots
    .filter(s => s.statusCode === '200')
    .reduce((closest, current) => {
      const currentDiff = Math.abs(
        parseInt(current.timestamp) - parseInt(targetTimestamp)
      );
      const closestDiff = Math.abs(
        parseInt(closest.timestamp) - parseInt(targetTimestamp)
      );
      return currentDiff < closestDiff ? current : closest;
    });
}
```

### Rate Limiting

```typescript
// src/lib/wayback/rate-limiter.ts
import pLimit from 'p-limit';

// Sketch only: read-await-write races under concurrency (BUGS_FOUND.md #10).
// Implemented correctly in src/lib/wayback/rate-limiter.ts.
export class WaybackRateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 200; // 200ms = 5 req/sec
  
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const delay = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }
}

// Usage
const waybackLimiter = new WaybackRateLimiter();
const limit = pLimit(10); // max 10 concurrent checks

const results = await Promise.all(
  links.map(link => 
    limit(async () => {
      await waybackLimiter.waitForSlot();
      return await checkLink(link);
    })
  )
);
```

### Caching Strategy

```typescript
// Cache keys
function getCacheKey(url: string, type: 'cdx' | 'health'): string {
  const normalized = normalizeUrl(url);
  return `${type}:${normalized}`;
}

// Cache durations
const CACHE_DURATION = {
  cdx: 24 * 60 * 60 * 1000,      // 24 hours (snapshots don't change)
  health: 60 * 60 * 1000,         // 1 hour (pages may come back)
  zombie: 24 * 60 * 60 * 1000,    // 24 hours (content drift is slow)
};

// In-memory cache for development
const cache = new Map<string, { data: any; expires: number }>();

async function getCached<T>(key: string): Promise<T | null> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

async function setCache<T>(key: string, data: T, ttl: number): Promise<void> {
  cache.set(key, {
    data,
    expires: Date.now() + ttl,
  });
}
```

### Streaming Results (Server-Sent Events)

```typescript
// app/api/check/route.ts
export async function POST(request: Request) {
  const { links } = await request.json();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const limit = pLimit(10);
      const waybackLimiter = new WaybackRateLimiter();
      
      const promises = links.map((link) =>
        limit(async () => {
          try {
            await waybackLimiter.waitForSlot();
            const result = await checkLink(link);
            
            // Stream result back to client
            const chunk = encoder.encode(
              `data: ${JSON.stringify(result)}\n\n`
            );
            controller.enqueue(chunk);
          } catch (error) {
            const errorResult = {
              linkId: link.id,
              status: 'error',
              error: error.message,
            };
            const chunk = encoder.encode(
              `data: ${JSON.stringify(errorResult)}\n\n`
            );
            controller.enqueue(chunk);
          }
        })
      );
      
      await Promise.all(promises);
      controller.close();
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## API Design

### Endpoint: POST /api/check

**Request Body**:
```json
{
  "links": [
    {
      "id": "link_1",
      "url": "https://example.com/page",
      "citationDate": "2023-01-15T00:00:00Z"
    }
  ]
}
```

**Response** (Server-Sent Events):
```
data: {"linkId":"link_1","status":"living","checkedAt":"2026-11-12T..."}

data: {"linkId":"link_2","status":"ghost","archived":{"url":"...","timestamp":"..."},"checkedAt":"..."}

data: {"linkId":"link_3","status":"zombie","suspicious":true,"reason":"redirected to different domain"}
```

**Error Response**:
```
data: {"linkId":"link_4","status":"error","error":"Request timeout after 8s"}
```

---

## Dependencies

```json
{
  "p-limit": "^5.0.0",
  "@mozilla/readability": "^0.5.0",
  "jsdom": "^23.0.0"
}
```

---
