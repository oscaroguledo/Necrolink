# Implementation Plan: Spec 02 (Final Tasks) + Spec 03 (Complete)

**Created**: 2024-12-21  
**Status**: Ready for implementation  
**Context**: Spec 01 (extraction) is 100% complete (366 tests passing). Spec 02 is 93% complete (28/30 tasks). This plan covers the remaining 2 tasks from Spec 02 and all remaining work for Spec 03.

---

## Current State

### Spec 02: Link Checking (93% Complete)
✅ Phases 1-4: Fetch, classify, Wayback integration, caching - ALL DONE  
✅ Phase 5: Streaming API endpoint (/api/check) - DONE  
✅ Phase 6: Error handling & structured logging - MOSTLY DONE  
✅ Phase 7: Testing - ALL UNIT/INTEGRATION/PROPERTY TESTS PASSING  

**Remaining:**
- **Task 5.3**: Client-side SSE stream reader (for UI, uses `fetch` + `getReader`, NOT `EventSource` which cannot POST)
- **Task 6.3**: Enhanced monitoring metrics (percentiles, Wayback latency tracking, cache hit rate logging)

### Spec 03: Zombie Detection
✅ Core logic implemented:
  - `src/lib/zombie/content.ts` (Readability-based extraction)
  - `src/lib/zombie/similarity.ts` (Jaccard + cosine similarity)
  - `src/lib/zombie/ai.ts` (Kiro API client)
  - `src/lib/zombie/detector.ts` (two-stage detection pipeline)
  - Integration in `check-link.ts` (already wired)

**Remaining:**
- **Missing files**: Tests are already written but missing unit tests for similarity
- **Missing API endpoint**: `/api/zombie` route (though zombie detection already works through `/api/check`)
- **Missing client integration**: The stream reader from Task 5.3 will consume zombie results

---

## Implementation Order (Dependency-Driven)

### Phase 1: Spec 02 Final Tasks (Client + Monitoring)

#### Task A: Client-side SSE stream reader utility
**File**: `src/lib/client/stream-check-results.ts`

**What**: TypeScript function that POSTs to `/api/check` and yields each `CheckResult` as it arrives. Uses `fetch()` + `getReader()` (NOT `EventSource` which cannot POST with a body). Handles network errors, server errors, JSON parse errors, and provides retry logic.

**Signature**:
```typescript
export interface StreamOptions {
  signal?: AbortSignal;
  onResult: (result: CheckResult) => void;
  onDone?: (summary: CheckSummary) => void;
  onError: (error: Error) => void;
}

export async function streamCheckResults(
  links: LinkToCheck[],
  options: StreamOptions
): Promise<void>
```

**Implementation details**:
- POST to `/api/check` with `{ links }` as JSON body
- Set `Accept: text/event-stream`
- Use `response.body.getReader()` to read SSE chunks
- Parse SSE format: `data: <json>\n\n` and `event: done\ndata: <json>\n\n`
- Call `onResult(result)` for each parsed `CheckResult`
- Call `onDone(summary)` when `event: done` arrives
- Call `onError(error)` on fetch failures, JSON parse errors, or server errors
- Handle `signal.abort()` by calling `reader.cancel()`
- Export types: `LinkToCheck` (re-export from check-handler), `CheckSummary` (re-export)

**Files**:
- Create: `src/lib/client/stream-check-results.ts`

**Verification**: 
```bash
npm run test tests/unit/stream-check-results.test.ts
```
Expected: All new tests pass (mock fetch, test normal flow, parse errors, abort signal, event: done)

---

#### Task B: Enhanced monitoring metrics in check-handler.ts and cdx.ts
**Files**: 
- `src/lib/checker/check-handler.ts`
- `src/lib/wayback/cdx.ts`

**What**: Add detailed metrics logging for production monitoring:

1. **In `check-handler.ts`** (`check.finished` log):
   - Already logs: `{ total, living, ghost, lost, zombie, error, ms, cancelled }`
   - Add duration percentiles: `{ p50, p95, p99 }` (per-link check times)
   - Implementation: Track start/end time for each link check in a `Map<linkId, startTime>`, compute percentiles from the durations array before logging

2. **In `cdx.ts`** (new `wayback.query` log):
   - Log every CDX query with: `{ url, cached: boolean, found: boolean, snapshots: number, latencyMs: number }`
   - Add this log at the end of `findArchivedSnapshot()` before returning
   - `cached` = whether result came from cache
   - `found` = whether a usable snapshot was returned
   - `snapshots` = number of snapshots in CDX response (before filtering to 200-only)
   - `latencyMs` = time from API call start to response parsed (skip if cached)

3. **Cache hit rate** (periodic log in check-handler):
   - After the `check.finished` log, add: `log.info('cache.stats', { healthHits, healthMisses, healthHitRate, cdxHits, cdxMisses, cdxHitRate })`
   - Read from `sharedHealthCache.hits/misses` and `sharedCache.hits/misses` (both are TtlCache instances with public hit/miss counters)
   - Hit rate = `hits / (hits + misses)` (guard against division by zero)

**Implementation**:
- In `check-handler.ts`:
  - Before the `limit()` call, add `const checkStartTimes = new Map<string, number>()`
  - Inside the `limit()` callback, record `checkStartTimes.set(link.id, performance.now())` before `checkLink()`
  - After `checkLink()`, compute `const duration = performance.now() - checkStartTimes.get(link.id)!` and store in `const durations: number[] = []`
  - After `Promise.all()`, compute percentiles: sort durations, take `durations[Math.floor(durations.length * 0.5)]` for p50, etc.
  - Add to `summary` object: `{ ...summary, p50, p95, p99 }`
  - After `log.info('check.finished', ...)`, add the cache stats log (see above)

- In `cdx.ts`:
  - At the top of `findArchivedSnapshot()`, add `const startedAt = performance.now()`
  - After cache check, if cache hit: `log.info('wayback.query', { url, cached: true, found: result !== null })` and return
  - After CDX API call and parsing, before cache.set(): `log.info('wayback.query', { url, cached: false, found: result !== null, snapshots: rows.length - 1, latencyMs: Math.round(performance.now() - startedAt) })`

**Files**:
- Modify: `src/lib/checker/check-handler.ts` (add percentiles + cache stats to `check.finished` log)
- Modify: `src/lib/wayback/cdx.ts` (add `wayback.query` log with latency)

**Verification**:
```bash
npm run test tests/integration/check-api.test.ts
```
Expected: All existing tests still pass, logs now include new fields (check the test output or add a test that verifies the log structure)

---

### Phase 2: Spec 03 Remaining Work (Tests + API Endpoint)

#### Task C: Unit test for similarity.ts
**File**: `tests/unit/similarity.test.ts`

**What**: The property-based tests for similarity are already in `tests/unit/zombie-content.test.ts` (the "similarity properties" describe block). Extract those and add pure unit tests for edge cases.

**Tests to add**:
1. `jaccard()`: identical strings → 1, no overlap → 0, symmetric
2. `contentSimilarity()`: identical → 1, one empty → 0, two empty → 1, insensitive to repetition
3. `tokenize()`: removes stopwords, lowercases, keeps unicode, drops 1-char tokens
4. `wordCount()`: returns correct count

**Implementation**: The property tests already exist in `zombie-content.test.ts`. Create a new file that imports the functions and adds focused unit tests for specific inputs (not property-based).

**Files**:
- Create: `tests/unit/similarity.test.ts`

**Verification**:
```bash
npm run test tests/unit/similarity.test.ts
```
Expected: All new tests pass

---

#### Task D: POST /api/zombie endpoint
**File**: `src/app/api/zombie/route.ts`

**What**: Standalone endpoint for zombie detection (though the main flow goes through `/api/check`). Useful for debugging and testing individual suspicious links.

**API Design** (from spec 03):
```
POST /api/zombie
Body: {
  "linkId": "link_123",
  "url": "https://example.com/page",
  "finalUrl": "https://example.com/page",
  "archived": { "url": "https://web.archive.org/...", "timestamp": "...", ... },
  "suspicionReason": "Redirects to a different domain"
}

Response (200): {
  "success": true,
  "data": {
    "isZombie": true,
    "confidence": 0.95,
    "reason": "...",
    "method": "heuristic" | "ai" | "unverified",
    "changes": { "titleChanged": true, "contentDrift": "complete", "possibleTakeover": true },
    "archivedTitle": "...",
    "currentTitle": "...",
    "similarity": 0.05
  }
}

Response (400/500): {
  "success": false,
  "error": { "code": "...", "message": "..." }
}
```

**Implementation**:
- Validate request body (Zod schema or manual checks):
  - `linkId`: string, non-empty
  - `url`: string, valid http(s) URL
  - `finalUrl`: string, valid http(s) URL
  - `archived`: optional ArchivedSnapshot object
  - `suspicionReason`: string, non-empty
- Call `detectZombie({ url, finalUrl, archived, suspicionReason })` with a budget of 1 AI call
- Return the `ZombieReport` wrapped in the success envelope
- Handle errors: return 400 for validation, 500 for internal errors
- Set rate limit: max 20 requests per minute per IP (use a simple in-memory counter or skip for now)

**Files**:
- Create: `src/app/api/zombie/route.ts`

**Verification**:
```bash
npm run test tests/integration/zombie-api.test.ts
```
Expected: All new tests pass (POST with valid body, missing archived, invalid body, rate limit)

---

#### Task E: Integration test for zombie API
**File**: `tests/integration/zombie-api.test.ts`

**What**: End-to-end tests for the `/api/zombie` endpoint, using the same fake `fetchPage` pattern as `zombie-detector.test.ts`.

**Tests**:
1. Valid request with archived snapshot → returns zombie report
2. Valid request without archived snapshot → returns unverified or heuristic verdict
3. Invalid request body → 400 with error message
4. Link that is clearly parked → zombie with high confidence
5. Link that is clearly living → living with explanation

**Files**:
- Create: `tests/integration/zombie-api.test.ts`

**Verification**:
```bash
npm run test tests/integration/zombie-api.test.ts
```
Expected: All new tests pass

---

## Testing Strategy Summary

### What Each Test File Covers

**Existing (already passing):**
- `tests/unit/zombie-content.test.ts`: Content extraction, parked page detection, spam detection, similarity on fixtures, property tests for similarity
- `tests/unit/zombie-ai.test.ts`: Kiro API client, prompt building, reply parsing, error handling, retries
- `tests/unit/zombie-detector.test.ts`: Two-stage detection, known zombie/living cases, AI integration, budget tracking, caching
- `tests/integration/check-api.test.ts`: Full SSE streaming flow, validation, concurrency, client disconnect

**New (to be created):**
- `tests/unit/similarity.test.ts`: Focused unit tests for tokenize, jaccard, contentSimilarity, wordCount (edge cases beyond properties)
- `tests/unit/stream-check-results.test.ts`: Client-side stream reader (mock fetch, normal flow, errors, abort, done event)
- `tests/integration/zombie-api.test.ts`: POST /api/zombie endpoint (valid/invalid requests, error handling)

### Fixtures Used
All zombie fixtures already exist in `tests/fixtures/zombie/`:
- `research-archived.html` (original article)
- `research-updated.html` (redesigned, still same content)
- `parked.html` (domain for sale)
- `casino.html` (gambling spam takeover)
- `topic-change.html` (article → shoe shop)
- `script-trap.html` (security test: no script execution)

---

## Git Commit Plan

### Commit 1: Spec 02 Final Tasks (Client + Monitoring)
**Branch**: `feature/spec02-final`

**Files changed**:
- Create: `src/lib/client/stream-check-results.ts`
- Create: `tests/unit/stream-check-results.test.ts`
- Modify: `src/lib/checker/check-handler.ts` (add percentiles + cache stats)
- Modify: `src/lib/wayback/cdx.ts` (add wayback.query log with latency)

**Commit message**:
```
feat(check): client-side SSE stream reader and enhanced metrics

Spec 02 tasks 5.3 and 6.3:
- Add streamCheckResults() client utility for reading SSE responses
- Track per-link check duration percentiles (p50, p95, p99)
- Log Wayback CDX query latency and cache hit rates
- All integration tests passing
```

**Verification before commit**:
```bash
npm run test
npm run lint
```

**Push**:
```bash
git add src/lib/client/ src/lib/checker/check-handler.ts src/lib/wayback/cdx.ts tests/unit/stream-check-results.test.ts
git commit -m "feat(check): client-side SSE stream reader and enhanced metrics"
git push -u origin feature/spec02-final
```

---

### Commit 2: Spec 03 Complete (Tests + API Endpoint)
**Branch**: `feature/spec03-complete` (branched from `feature/spec02-final`)

**Files changed**:
- Create: `tests/unit/similarity.test.ts`
- Create: `src/app/api/zombie/route.ts`
- Create: `tests/integration/zombie-api.test.ts`

**Commit message**:
```
feat(zombie): complete spec 03 with API endpoint and full test coverage

Spec 03 completion:
- Add unit tests for similarity functions (jaccard, cosine, tokenize)
- Implement POST /api/zombie endpoint for standalone zombie detection
- Integration tests for zombie API endpoint
- All 366+ tests passing (extraction + checking + zombie detection)
```

**Verification before commit**:
```bash
npm run test
npm run lint
```

**Push**:
```bash
git add tests/unit/similarity.test.ts src/app/api/zombie/ tests/integration/zombie-api.test.ts
git commit -m "feat(zombie): complete spec 03 with API endpoint and full test coverage"
git push -u origin feature/spec03-complete
```

---

## Verification Commands

After each phase, run:

```bash
# All tests (should be 366+ passing, 0 failing)
npm run test

# Specific test suites
npm run test tests/unit/stream-check-results.test.ts
npm run test tests/unit/similarity.test.ts
npm run test tests/integration/zombie-api.test.ts
npm run test tests/integration/check-api.test.ts

# Linting
npm run lint

# Type checking
npx tsc --noEmit

# Build (Next.js)
npm run build
```

---

## Implementation Checklist

### Phase 1: Spec 02 Final Tasks
- [ ] **Task A**: Create `src/lib/client/stream-check-results.ts`
  - Files: `src/lib/client/stream-check-results.ts`
  - Verify: `npm run test tests/unit/stream-check-results.test.ts`

- [ ] **Task B**: Enhanced monitoring in check-handler.ts and cdx.ts
  - Files: `src/lib/checker/check-handler.ts`, `src/lib/wayback/cdx.ts`
  - Verify: `npm run test tests/integration/check-api.test.ts` (existing tests still pass)

- [ ] **Commit 1**: feat(check): client-side SSE stream reader and enhanced metrics
  - Verify: `npm run test && npm run lint`
  - Push to `feature/spec02-final`

### Phase 2: Spec 03 Complete
- [ ] **Task C**: Create `tests/unit/similarity.test.ts`
  - Files: `tests/unit/similarity.test.ts`
  - Verify: `npm run test tests/unit/similarity.test.ts`

- [ ] **Task D**: Create `src/app/api/zombie/route.ts`
  - Files: `src/app/api/zombie/route.ts`
  - Verify: `npm run test tests/integration/zombie-api.test.ts`

- [ ] **Task E**: Create `tests/integration/zombie-api.test.ts`
  - Files: `tests/integration/zombie-api.test.ts`
  - Verify: `npm run test tests/integration/zombie-api.test.ts`

- [ ] **Commit 2**: feat(zombie): complete spec 03 with API endpoint and full test coverage
  - Verify: `npm run test && npm run lint`
  - Push to `feature/spec03-complete`

---

## Success Criteria

### Functional
1. ✅ Client can consume SSE stream from /api/check with error handling
2. ✅ Monitoring logs include percentiles, Wayback latency, cache hit rates
3. ✅ Zombie detection works end-to-end (already tested, just adding API endpoint)
4. ✅ All tests passing (366+ total)

### Quality
1. ✅ Unit test coverage for all new code
2. ✅ Integration tests for API endpoints
3. ✅ Property-based tests for similarity (already exist)
4. ✅ TypeScript strict mode (already enforced)

### Performance
1. ✅ Client stream reader handles backpressure (getReader handles this)
2. ✅ Monitoring overhead is minimal (just percentile computation at the end)
3. ✅ Zombie detection already optimized (two-stage, AI budget)

### User Experience
1. ✅ Stream reader provides clear error messages
2. ✅ Zombie API returns human-readable explanations
3. ✅ Monitoring data enables production debugging

---

## Notes

### Why Task 5.3 Uses fetch() + getReader(), Not EventSource
- `EventSource` only supports GET requests
- `/api/check` is POST with a JSON body (list of links)
- Modern browsers support `ReadableStream` via `fetch().body.getReader()`
- This is the standard pattern for SSE with POST

### Why Task 6.3 Metrics Are Important
- **Percentiles** (not just averages) reveal tail latency issues
- **Wayback latency** helps detect Internet Archive slowdowns
- **Cache hit rate** validates the caching strategy effectiveness
- All metrics are JSON-structured for easy CloudWatch/Vercel log queries

### Why /api/zombie Endpoint Exists
Though zombie detection is already integrated into `/api/check`, a standalone endpoint is useful for:
- Debugging individual suspicious links
- Re-checking a link without re-uploading the document
- Future UI feature: "Re-check this zombie link"
- Testing and development

### Hackathon Compliance
- All commits after Oct 30, 2026 ✅
- `.kiro/` directory committed ✅
- Commit messages follow Conventional Commits ✅
- No secrets in repo ✅

---

## Dependencies

All dependencies already installed (from package.json):
- `@mozilla/readability`: ^0.5.0 ✅
- `jsdom`: ^23.0.0 ✅
- `cheerio`: ^1.0.0-rc.12 ✅
- `vitest`: ^1.0.0 ✅
- `fast-check`: ^3.14.0 ✅

No new dependencies needed.

---

## Risk Mitigation

### Risk: Client stream reader doesn't handle network errors gracefully
**Mitigation**: Comprehensive error handling in Task A, with tests for each error type

### Risk: Percentile computation is slow for large link sets
**Mitigation**: Computed only once at the end, after all checks complete. For 500 links (max per request), sorting 500 numbers is ~1ms.

### Risk: Cache stats log adds too much noise
**Mitigation**: Logged once per request, not per link. Easy to filter in production logs.

### Risk: /api/zombie endpoint could be abused
**Mitigation**: Rate limit to 20 req/min per IP (or implement after launch if needed)

---

## Timeline Estimate

**Task A** (Client stream reader): 2-3 hours  
**Task B** (Enhanced metrics): 1-2 hours  
**Commit 1 + push**: 30 minutes  

**Task C** (Similarity unit tests): 1 hour  
**Task D** (/api/zombie endpoint): 1-2 hours  
**Task E** (Zombie API integration tests): 1-2 hours  
**Commit 2 + push**: 30 minutes  

**Total**: 7-11 hours for both specs 100% complete

---

## Post-Implementation

After both commits are pushed:

1. Create PR for `feature/spec02-final` → `main`
2. After merge, create PR for `feature/spec03-complete` → `main`
3. Update `.kiro/specs/02-link-checking.md` status to "Complete"
4. Update `.kiro/specs/03-zombie-detection.md` status to "Complete"
5. Run full test suite: `npm run test` (expect 366+ tests passing)
6. Deploy to Vercel staging environment
7. Test end-to-end: upload document → stream results → see zombie detections

**Demo readiness**: After Phase 2 complete, Necrolink has:
- Full extraction (PDF, Markdown, HTML) ✅
- Full link checking (ghost, lost, zombie, living) ✅
- Full zombie detection (heuristic + AI) ✅
- Streaming results UI ✅
- All tests passing ✅
- Ready for Kiroween 2026 submission ✅

---

**END OF PLAN**
