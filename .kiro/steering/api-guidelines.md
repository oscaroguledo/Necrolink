---
name: API Usage Guidelines
description: Rate limits, caching strategies, and best practices for external APIs (Wayback Machine, kiro)
inclusion: always
---

# 🌐 API Usage Guidelines

## Internet Archive Wayback Machine

The Wayback Machine is a public resource. We must use it respectfully.

### CDX Server API

**Endpoint**: `http://web.archive.org/cdx/search/cdx`

The CDX (Capture Index) API returns metadata about archived snapshots without fetching full pages.

#### Query Parameters
```typescript
interface CDXQuery {
  url: string;           // URL to search (supports wildcards)
  matchType?: 'exact' | 'prefix' | 'host' | 'domain';
  limit?: number;        // Max results (default: unlimited)
  from?: string;         // Start timestamp (YYYYMMDDhhmmss)
  to?: string;           // End timestamp (YYYYMMDDhhmmss)
  filter?: string;       // Filter by status code, mimetype, etc.
  output?: 'json';       // Response format
  fl?: string;           // Fields to return (comma-separated)
}
```

#### Example Request
```typescript
const cdxUrl = new URL('http://web.archive.org/cdx/search/cdx');
cdxUrl.searchParams.set('url', 'example.com/page.html');
cdxUrl.searchParams.set('matchType', 'exact');
cdxUrl.searchParams.set('output', 'json');
cdxUrl.searchParams.set('fl', 'timestamp,original,statuscode,mimetype');
cdxUrl.searchParams.set('limit', '10');

const response = await fetch(cdxUrl.toString());
const snapshots = await response.json();
```

#### Example Response
```json
[
  ["timestamp", "original", "statuscode", "mimetype"],
  ["20230615120000", "http://example.com/page.html", "200", "text/html"],
  ["20230501080000", "http://example.com/page.html", "200", "text/html"],
  ["20221215160000", "http://example.com/page.html", "200", "text/html"]
]
```

#### Constructing Wayback URLs
Once you have a timestamp, construct the archived page URL:
```typescript
function getWaybackUrl(originalUrl: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

// Example
getWaybackUrl('example.com/page.html', '20230615120000')
// => 'https://web.archive.org/web/20230615120000/example.com/page.html'
```

### Rate Limits

The Internet Archive doesn't publish official rate limits, but community guidelines suggest:

- **Maximum 5 requests per second** per IP
- **Burst allowance**: Up to 10 concurrent connections
- **Backoff required**: If you receive 429 or 503 responses

#### Implementation
```typescript
// src/lib/wayback/rate-limiter.ts
export class WaybackRateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private readonly maxConcurrent = 5;
  private readonly minInterval = 200; // 200ms = 5 req/sec
  private lastRequestTime = 0;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (
          this.activeRequests < this.maxConcurrent &&
          timeSinceLastRequest >= this.minInterval
        ) {
          this.activeRequests++;
          this.lastRequestTime = now;
          resolve();
        } else {
          const delay = Math.max(
            this.minInterval - timeSinceLastRequest,
            0
          );
          setTimeout(tryAcquire, delay);
        }
      };
      
      tryAcquire();
    });
  }

  release(): void {
    this.activeRequests--;
  }
}
```

### Caching Strategy

**Cache CDX lookups aggressively** — archived snapshots don't change.

#### Cache Keys
```typescript
function getCacheKey(url: string, date?: string): string {
  const normalized = normalizeUrl(url);
  return date 
    ? `cdx:${normalized}:${date}`
    : `cdx:${normalized}:latest`;
}
```

#### Cache Duration
- **CDX metadata**: 7 days (snapshots don't disappear)
- **Link availability checks**: 1 hour (pages may become available)
- **Content comparisons**: 24 hours (zombie status may change)

#### Storage
```typescript
// Local dev: in-memory cache
const cache = new Map<string, { data: any; expires: number }>();

// Production: Redis
import { Redis } from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function getCached<T>(key: string): Promise<T | null> {
  if (process.env.NODE_ENV === 'development') {
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }
    return null;
  }
  
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}
```

### Error Handling

#### Common Errors
- **404**: No snapshots found for this URL
- **429**: Rate limit exceeded
- **503**: Service temporarily unavailable
- **Timeout**: CDX query took too long

#### Retry Strategy
```typescript
async function fetchWithRetry(
  url: string,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(10000) // 10s timeout
      });
      
      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.pow(2, attempt) * 1000; // exponential backoff
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### Finding the Closest Snapshot

When a citation includes a date, find the snapshot closest to that date:

```typescript
interface Snapshot {
  timestamp: string; // YYYYMMDDhhmmss
  url: string;
  statusCode: string;
  mimeType: string;
}

function findClosestSnapshot(
  snapshots: Snapshot[],
  citationDate: Date
): Snapshot | null {
  if (snapshots.length === 0) return null;
  
  const targetTimestamp = formatDate(citationDate); // to YYYYMMDDhhmmss
  
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

## kiro kiro API

Used for zombie detection — comparing archived and current page content.

### Usage Guidelines

- **One comparison per suspicious link** (not every link)
- **Batch requests when possible** (future optimization)
- **Cache results** for 24 hours (content drift is slow)

### Prompt Template

```typescript
const zombieDetectionPrompt = `
Compare these two versions of the same web page:

ARCHIVED VERSION (from ${archivedDate}):
Title: ${archivedTitle}
Content: ${archivedContent.substring(0, 2000)}

CURRENT VERSION:
Title: ${currentTitle}
Content: ${currentContent.substring(0, 2000)}

Determine if this is a "zombie link" — a URL that still loads but no longer shows the same content.

Respond with JSON:
{
  "isZombie": boolean,
  "confidence": number (0-1),
  "reason": string (one sentence),
  "changes": {
    "titleChanged": boolean,
    "contentDrift": "none" | "minor" | "major" | "complete",
    "possibleTakeover": boolean
  }
}

A link is a zombie if:
- The title changed completely (not just minor edits)
- The content topic is different (a research paper → an ad)
- The domain appears to have been taken over (now shows spam/casino/parking page)

A link is NOT a zombie if:
- The content was updated but still covers the same topic
- The page was redesigned but the information remains
- Minor corrections or additions were made
`;
```

### Rate Limits

kiro API limits (as of Dec 2024):
- **kiro 3.5 Sonnet**: 50 requests/min, 100,000 tokens/min
- **kiro 3 Opus**: 20 requests/min, 80,000 tokens/min

For our use case:
- Use **kiro 3.5 Sonnet** (faster, cheaper, sufficient accuracy)
- Limit to **40 requests/min** to stay under limits
- Queue zombie checks and process in batches

### Cost Optimization

- Only check links that are **suspicious** (redirects, different domain, changed title tag)
- Truncate content to 2000 characters per version (4000 tokens total)
- Cache results by URL + content hash
- Estimated cost: **$0.003 per comparison** (well within hackathon budget)

## Content Fetching Best Practices

### User-Agent

Always identify yourself when scraping:
```typescript
const headers = {
  'User-Agent': 'Necrolink/0.1.0 (Link checker; https://github.com/yourusername/necrolink)'
};
```

### Respect robots.txt

```typescript
import { isAllowed } from 'robots-txt-guard';

async function canFetch(url: string): Promise<boolean> {
  const robotsTxt = await fetchRobotsTxt(url);
  return isAllowed(robotsTxt, 'Necrolink', url);
}
```

### Timeout All Requests

Never wait forever for a dead page:
```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(8000), // 8 seconds max
  headers: {
    'User-Agent': USER_AGENT
  }
});
```

### Handle Redirects

```typescript
const response = await fetch(url, {
  redirect: 'follow', // follow up to 20 redirects
  signal: AbortSignal.timeout(8000)
});

const finalUrl = response.url; // where we ended up
const wasRedirected = finalUrl !== url;
```

## Monitoring and Logging

### Log API Calls
```typescript
logger.info('wayback_query', {
  url: originalUrl,
  from: fromDate,
  to: toDate,
  found: snapshots.length,
  cached: fromCache,
  duration_ms: elapsed
});
```

### Track Failures
```typescript
logger.warn('wayback_failure', {
  url: originalUrl,
  error: error.message,
  statusCode: response?.status,
  retries: attempt
});
```

### Alert on Rate Limits
If we hit rate limits repeatedly, we're checking too fast:
```typescript
if (response.status === 429) {
  logger.error('rate_limit_exceeded', {
    api: 'wayback',
    url: originalUrl,
    retryAfter: response.headers.get('Retry-After')
  });
}
```

---

**Remember**: These are public APIs. Be respectful with request rates, cache aggressively, and always identify yourself with a proper User-Agent. The Internet Archive is doing humanity a service — don't abuse it.