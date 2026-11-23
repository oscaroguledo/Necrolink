# Link Health Checking (Ghost/Lost Soul/Zombie/Living): Requirements

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
- **Security:** never connect to private, loopback, link-local (incl. 169.254.169.254) or other non-public addresses, checked at connect time and on every redirect (SSRF; links come from uploaded documents)

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

## Edge Cases

1. **Redirects to login page**: Flag as suspicious zombie
2. **Soft 404s** (200 but "page not found" content): Need content analysis
3. **Paywalls**: Mark as "uncertain" status
4. **Rate limiting from target site**: Back off and retry
5. **No archived snapshots**: Mark as "permanently lost"
6. **Multiple snapshots on same day**: Pick closest by time
7. **Wayback API timeout**: Fall back to "unknown" status

---
