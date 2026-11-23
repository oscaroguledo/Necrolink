# Link Health Checking (Ghost/Lost Soul/Zombie/Living): Implementation Tasks

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

---

## Tasks

### Phase 1: Basic Link Fetching
- [x] **Task 1.1**: Implement `fetchWithRetry()`
  - Try HEAD request first (faster)
  - Fall back to GET if HEAD fails
  - Follow up to 3 redirects
  - Set 8-second timeout
  - Return: status code, final URL, headers

- [x] **Task 1.2**: Implement retry logic with exponential backoff
  - Retry on 429 (rate limit)
  - Retry on 503 (service unavailable)
  - Retry on network errors
  - Max 3 retries
  - Exponential delay: 1s, 2s, 4s

- [x] **Task 1.3**: Add proper User-Agent
  - Identify as Necrolink
  - Include contact URL
  - Follow web scraping etiquette

### Phase 2: Status Classification
- [x] **Task 2.1**: Implement `isDeadStatus()`
  - 404: Not Found
  - 410: Gone
  - 5xx: Server errors (tentative ghost)
  - DNS resolution failures
  - Connection timeouts

- [x] **Task 2.2**: Implement `isSuspicious()`
  - Redirects to different domain
  - Title tag changed dramatically
  - Status 403 (Forbidden) - may be alive but blocking
  - Redirect chains > 2

- [x] **Task 2.3**: Unit tests for classification
  - Test all status codes
  - Test redirect scenarios
  - Test timeout handling

### Phase 3: Wayback Machine Integration
- [x] **Task 3.1**: Implement CDX API client
  - Build query URL with parameters
  - Parse JSON response
  - Handle empty results
  - Handle API errors

- [x] **Task 3.2**: Implement `findArchivedSnapshot()`
  - Query CDX for URL
  - Filter for status 200
  - Find closest to citation date
  - Return snapshot metadata, or `null` when no usable snapshot exists

- [x] **Task 3.2b**: Lost soul classification
  - Dead link + `null` snapshot → status `lost`
  - Snapshots that are all non-200 (archived 404/redirect pages) → `lost`
  - Export leaves lost-soul URLs unchanged; results list them under "Lost Souls"
  - Unit tests: never-archived URL, archive with only 404 snapshots

- [x] **Task 3.3**: Build rate limiter
  - Enforce 5 req/sec limit
  - Track last request time
  - Add configurable delay
  - Log rate limit hits

- [x] **Task 3.4**: Integration tests with real Wayback API
  - Test known archived URL
  - Test URL with no snapshots
  - Test rate limiting behavior
  - Test timeout handling

### Phase 4: Caching Layer
- [x] **Task 4.1**: Implement in-memory cache
  - Simple Map-based cache
  - TTL expiration
  - Cache key generation
  - LRU eviction (optional)

- [x] **Task 4.2**: Add cache to CDX queries
  - Check cache before API call
  - Store results with 24h TTL
  - Cache misses too (empty results)

- [x] **Task 4.3**: Add cache to link health checks
  - Check cache before fetching
  - Store results with 1h TTL
  - Invalidate on user request

### Phase 5: Streaming API Endpoint
- [x] **Task 5.1**: Create `/api/check` route
  - Accept array of Link objects
  - Set up Server-Sent Events stream
  - Use p-limit for concurrency

- [x] **Task 5.2**: Implement streaming logic
  - Process links in parallel (max 10)
  - Stream each result as it completes
  - Handle errors gracefully
  - Close stream when done

- [ ] **Task 5.3**: Client-side EventSource (with the results UI; note `EventSource` cannot POST, so read the stream with `fetch()` + `getReader()`)
  - Connect to SSE endpoint
  - Parse incoming results
  - Update UI incrementally
  - Handle connection errors

### Phase 6: Error Handling & Monitoring
- [x] **Task 6.1**: Structured error logging
  - Log all API failures
  - Log rate limit hits
  - Log unexpected status codes
  - Include URL and context

- [x] **Task 6.2**: Graceful degradation
  - Continue on individual link failures
  - Return partial results
  - Clear error messages for users

- [ ] **Task 6.3**: Monitoring metrics (partial: `check.finished` logs counts per status and duration; percentiles, Wayback latency and cache hit rate not yet)
  - Track check duration percentiles
  - Track ghost/lost/zombie/living ratio
  - Track Wayback API latency
  - Track cache hit rate

### Phase 7: Testing & Polish
- [x] **Task 7.1**: Unit tests
  - Test fetchWithRetry with mocked responses
  - Test rate limiter timing
  - Test cache expiration
  - Test closest snapshot algorithm

- [x] **Task 7.2**: Integration tests
  - Test full check flow end-to-end
  - Test with real dead link
  - Test with real archived link
  - Test streaming response

- [x] **Task 7.3**: Property-based tests
  - Closest snapshot is always closest
  - A dead link is always exactly one of ghost or lost (ghost ⇔ snapshot exists)
  - Rate limiter never exceeds limit
  - Cache always returns same data within TTL

---

## Testing Notes

**Integration Testing Checklist**:
- [x] Test with known dead link (404)
- [x] Test with archived dead link
- [x] Test with redirect to different domain (GeoCities → Yahoo, live)
- [x] Test with very slow server (timeout)
- [x] Test Wayback rate limiting (property test with simulated bursts instead of 100 real requests)
- [x] Test cache hit/miss scenarios
- [x] Test streaming with 50+ links (100 links, incl. client disconnect)

**Monitor These Metrics**:
- Average check duration
- Wayback API success rate
- Cache hit rate
- Rate limit hits per hour
- Ghost/zombie/living distribution
