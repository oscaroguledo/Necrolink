# Zombie Detection (AI-Powered Content Comparison): Implementation Tasks

**Status**: Draft  
**Created**: 2026-11-12  
**Owner**: Core Team

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
