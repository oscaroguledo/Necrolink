# Zombie Detection (AI-Powered Content Comparison): Requirements

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

## Edge Cases

1. **Paywall pages**: Can't fetch content → mark as "uncertain"
2. **JavaScript-heavy SPAs**: Readability may fail → use raw text
3. **Non-English content**: AI can still compare, but may be less accurate
4. **Very short pages**: Hard to determine drift → lower confidence
5. **Redirects**: Compare final destination, not intermediate
6. **Soft 404s**: Page returns 200 but says "not found" → check content
7. **Archived page won't load**: Can't compare → return error

---
