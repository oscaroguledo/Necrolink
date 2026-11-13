# Spec: Link Health Checking (Ghost/Lost Soul/Zombie/Living)

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Requirements

### Must Have
- Check if a URL returns 404 (ghost - dead link)
- Check if a URL redirects to different domain (potential zombie)
- Check if a URL times out or DNS fails (ghost)
- Query Wayback Machine CDX API for archived snapshots
- Find closest archived snapshot to citation date
- Classify links as: ghost, lost, zombie, living, or error
- A dead link with no usable archived snapshot is a **lost soul** (`lost`), never a ghost
- A snapshot is only usable if its archived status code is 200 (no archived 404 pages)
- Lost souls are listed separately in results and left unchanged in the exported document
- Handle rate limits on Wayback Machine API (5 req/sec)
- Cache CDX lookups for 24 hours
- Support concurrent checking (max 10 links at once)
- Stream results back as each link completes (SSE)

### Should Have
- Try HEAD request first (faster), fall back to GET
- Follow redirects (up to 3) before checking content
- Detect domain takeovers (now parking page/spam)
- Handle robots.txt restrictions gracefully
- Retry failed requests with exponential backoff
- Log all rate limit hits for monitoring

### Could Have (Stretch Goals)
- Check SSL certificate validity
- Detect paywall pages (special handling)
- Integration with other archives (archive.today, Memento)
- Batch optimization for same-domain URLs

### Won't Have (Out of Scope)
- Deep content analysis (that's zombie detection spec)
- JavaScript rendering for SPAs
- Authentication for private URLs
- Distributed checking across multiple IPs

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

**Endpoint**: `http://web.archive.org/cdx/search/cdx`

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

## Tasks

### Phase 1: Basic Link Fetching
- [ ] **Task 1.1**: Implement `fetchWithRetry()`
  - Try HEAD request first (faster)
  - Fall back to GET if HEAD fails
  - Follow up to 3 redirects
  - Set 8-second timeout
  - Return: status code, final URL, headers

- [ ] **Task 1.2**: Implement retry logic with exponential backoff
  - Retry on 429 (rate limit)
  - Retry on 503 (service unavailable)
  - Retry on network errors
  - Max 3 retries
  - Exponential delay: 1s, 2s, 4s

- [ ] **Task 1.3**: Add proper User-Agent
  - Identify as Necrolink
  - Include contact URL
  - Follow web scraping etiquette

### Phase 2: Status Classification
- [ ] **Task 2.1**: Implement `isDeadStatus()`
  - 404: Not Found
  - 410: Gone
  - 5xx: Server errors (tentative ghost)
  - DNS resolution failures
  - Connection timeouts

- [ ] **Task 2.2**: Implement `isSuspicious()`
  - Redirects to different domain
  - Title tag changed dramatically
  - Status 403 (Forbidden) - may be alive but blocking
  - Redirect chains > 2

- [ ] **Task 2.3**: Unit tests for classification
  - Test all status codes
  - Test redirect scenarios
  - Test timeout handling

### Phase 3: Wayback Machine Integration
- [ ] **Task 3.1**: Implement CDX API client
  - Build query URL with parameters
  - Parse JSON response
  - Handle empty results
  - Handle API errors

- [ ] **Task 3.2**: Implement `findArchivedSnapshot()`
  - Query CDX for URL
  - Filter for status 200
  - Find closest to citation date
  - Return snapshot metadata, or `null` when no usable snapshot exists

- [ ] **Task 3.2b**: Lost soul classification
  - Dead link + `null` snapshot → status `lost`
  - Snapshots that are all non-200 (archived 404/redirect pages) → `lost`
  - Export leaves lost-soul URLs unchanged; results list them under "Lost Souls"
  - Unit tests: never-archived URL, archive with only 404 snapshots

- [ ] **Task 3.3**: Build rate limiter
  - Enforce 5 req/sec limit
  - Track last request time
  - Add configurable delay
  - Log rate limit hits

- [ ] **Task 3.4**: Integration tests with real Wayback API
  - Test known archived URL
  - Test URL with no snapshots
  - Test rate limiting behavior
  - Test timeout handling

### Phase 4: Caching Layer
- [ ] **Task 4.1**: Implement in-memory cache
  - Simple Map-based cache
  - TTL expiration
  - Cache key generation
  - LRU eviction (optional)

- [ ] **Task 4.2**: Add cache to CDX queries
  - Check cache before API call
  - Store results with 24h TTL
  - Cache misses too (empty results)

- [ ] **Task 4.3**: Add cache to link health checks
  - Check cache before fetching
  - Store results with 1h TTL
  - Invalidate on user request

### Phase 5: Streaming API Endpoint
- [ ] **Task 5.1**: Create `/api/check` route
  - Accept array of Link objects
  - Set up Server-Sent Events stream
  - Use p-limit for concurrency

- [ ] **Task 5.2**: Implement streaming logic
  - Process links in parallel (max 10)
  - Stream each result as it completes
  - Handle errors gracefully
  - Close stream when done

- [ ] **Task 5.3**: Client-side EventSource
  - Connect to SSE endpoint
  - Parse incoming results
  - Update UI incrementally
  - Handle connection errors

### Phase 6: Error Handling & Monitoring
- [ ] **Task 6.1**: Structured error logging
  - Log all API failures
  - Log rate limit hits
  - Log unexpected status codes
  - Include URL and context

- [ ] **Task 6.2**: Graceful degradation
  - Continue on individual link failures
  - Return partial results
  - Clear error messages for users

- [ ] **Task 6.3**: Monitoring metrics
  - Track check duration percentiles
  - Track ghost/lost/zombie/living ratio
  - Track Wayback API latency
  - Track cache hit rate

### Phase 7: Testing & Polish
- [ ] **Task 7.1**: Unit tests
  - Test fetchWithRetry with mocked responses
  - Test rate limiter timing
  - Test cache expiration
  - Test closest snapshot algorithm

- [ ] **Task 7.2**: Integration tests
  - Test full check flow end-to-end
  - Test with real dead link
  - Test with real archived link
  - Test streaming response

- [ ] **Task 7.3**: Property-based tests
  - Closest snapshot is always closest
  - A dead link is always exactly one of ghost or lost (ghost ⇔ snapshot exists)
  - Rate limiter never exceeds limit
  - Cache always returns same data within TTL

---

## Success Criteria

### Functional
1. ✅ Correctly classifies dead links (404, timeout, DNS fail)
2. ✅ Finds archived snapshots for dead links
2b. ✅ Labels dead links with no usable snapshot as lost souls (never a fake fix)
3. ✅ Finds closest snapshot to citation date
4. ✅ Flags suspicious links for zombie detection
5. ✅ Never exceeds Wayback rate limits

### Quality
1. ✅ Unit test coverage >80%
2. ✅ Integration tests with real Wayback API
3. ✅ Handles all error cases gracefully
4. ✅ Clear error messages for users

### Performance
1. ✅ Checks 50 links in < 30 seconds (with concurrency)
2. ✅ Respects 5 req/sec Wayback limit
3. ✅ Cache hit rate >60% on repeated checks
4. ✅ Streams first result within 2 seconds

### User Experience
1. ✅ Results appear incrementally (tombstones rise one by one)
2. ✅ Shows progress indicator
3. ✅ Handles connection interruptions
4. ✅ Can cancel in-progress check

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

## Edge Cases

1. **Redirects to login page**: Flag as suspicious zombie
2. **Soft 404s** (200 but "page not found" content): Need content analysis
3. **Paywalls**: Mark as "uncertain" status
4. **Rate limiting from target site**: Back off and retry
5. **No archived snapshots**: Mark as "permanently lost"
6. **Multiple snapshots on same day**: Pick closest by time
7. **Wayback API timeout**: Fall back to "unknown" status

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

## Testing Notes

**Integration Testing Checklist**:
- [ ] Test with known dead link (404)
- [ ] Test with archived dead link
- [ ] Test with redirect to different domain
- [ ] Test with very slow server (timeout)
- [ ] Test Wayback rate limiting (make 100 requests)
- [ ] Test cache hit/miss scenarios
- [ ] Test streaming with 50+ links

**Monitor These Metrics**:
- Average check duration
- Wayback API success rate
- Cache hit rate
- Rate limit hits per hour
- Ghost/zombie/living distribution
