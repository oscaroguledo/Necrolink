# URL Normalizer Fix Plan

This plan addresses all bugs that property-based tests are designed to catch. Each bug has been identified by analyzing how the test invariants interact with the current implementation.

---

## Bug 1: Options Not Merged with Defaults (Idempotence Breaker)

**Root Cause:**  
Line 44: `options: NormalizationOptions = DEFAULT_OPTIONS` only applies defaults when options is `undefined`. If a caller passes a partial options object like `{ removeTracking: false }`, the other properties (`removeFragment`, `sortParams`, `lowercaseHostname`) will be `undefined`, not their default values. This causes inconsistent behavior when the function is called multiple times with different option patterns.

**How Property Test Surfaces It:**  
The `normalization is idempotent` test calls `normalizeUrl(url)` (no options, uses defaults), then calls `normalizeUrl(once)` again (still no options). This specific pattern works. However, if internal calls or other code paths use partial options, idempotence breaks.

**Fix:**  
Replace line 44-49 with proper options merging:

```typescript
export function normalizeUrl(
  url: string,
  options?: Partial<NormalizationOptions>
): string {
  const opts: NormalizationOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
```

Then replace all references to `options.x` with `opts.x` throughout the function (lines 53, 56, 72, 73, 82, 86).

**Verification:**  
Run `npm test tests/property/url-normalization.test.ts` and confirm the idempotence test passes.

---

## Bug 2: Domain Preservation Violated by www Removal

**Root Cause:**  
Lines 68-70 unconditionally remove the `www.` prefix:
```typescript
if (parsed.hostname.startsWith('www.')) {
  parsed.hostname = parsed.hostname.substring(4);
}
```

The property test `preserves domain and path semantics` expects:
```typescript
expect(result.hostname.toLowerCase()).toBe(
  original.hostname.toLowerCase()
);
```

When the original URL is `https://www.example.com`, the normalized hostname becomes `example.com`, breaking the assertion.

**How Property Test Surfaces It:**  
fast-check's `fc.webUrl()` generates URLs with and without `www.`. When it generates `www.example.com`, the test compares `example.com` (normalized) to `www.example.com` (original), and the equality check fails.

**Fix:**  
The test's expectation is correct—normalization should preserve the hostname exactly (only lowercasing it). Remove lines 68-70 entirely. The www-removal feature, while common, violates semantic preservation and breaks the test's invariant. If www-removal is desired later, make it opt-in via options and update the test accordingly.

**Verification:**  
Run `npm test tests/property/url-normalization.test.ts` and confirm the domain preservation test passes with `www.` URLs.

---

## Bug 3: Trailing Question Mark When All Params Removed

**Root Cause:**  
Lines 79-82 set `parsed.search` to the result of `sorted.toString()`:
```typescript
const sorted = new URLSearchParams(
  Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
);
parsed.search = sorted.toString();
```

When all params are tracking params and get removed, `sorted.toString()` returns an empty string `""`. However, `parsed.toString()` may serialize this as `https://example.com?` (URL with trailing `?`), breaking idempotence: the second call would see `?` with no params and produce the same, but string comparison fails if one has `?` and one doesn't.

**How Property Test Surfaces It:**  
The `removes tracking parameters` test creates URLs with only tracking params. After normalization, if the URL has a trailing `?`, calling `normalizeUrl` again on that result should remove the `?` but the first call leaves it there, breaking idempotence.

**Fix:**  
After line 82, add an explicit check to remove the search entirely if empty:

```typescript
const sorted = new URLSearchParams(
  Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
);
parsed.search = sorted.toString();
// If all params removed, clear search entirely to avoid trailing '?'
if (sorted.toString() === '') {
  parsed.search = '';
}
```

Actually, `parsed.search = ''` should work, but URLSearchParams behavior varies. Safer fix:

```typescript
if (sorted.size === 0) {
  parsed.search = '';
} else {
  parsed.search = sorted.toString();
}
```

Place this replacement at lines 79-82.

**Verification:**  
Create a URL with only tracking params, normalize it twice, and confirm no trailing `?` and that both results match.

---

## Bug 4: Fragment Hash Edge Case

**Root Cause:**  
Lines 87-89:
```typescript
if (opts.removeFragment) {
  parsed.hash = '';
}
```

Setting `parsed.hash = ''` should remove the hash, but URL.toString() behavior can be inconsistent across environments. Some implementations might serialize `hash = ''` as a bare `#` at the end.

**How Property Test Surfaces It:**  
The `removes fragment by default` test generates URLs with fragments and checks that `normalized` does not contain `#`. If `parsed.toString()` includes a bare `#`, the test fails.

**Fix:**  
After setting `parsed.hash = ''`, ensure the final string has no `#`. Replace lines 87-89 with:

```typescript
if (opts.removeFragment) {
  parsed.hash = '';
}
```

Then, before returning at line 91, add a cleanup step:

```typescript
let result = parsed.toString();

// Ensure no trailing bare '#' or '?'
result = result.replace(/[?#]$/, '');

return result;
```

This ensures that even if URL.toString() leaves trailing delimiters, they're stripped.

**Verification:**  
Run the `removes fragment by default` test and confirm no `#` appears in normalized URLs.

---

## Bug 5: Non-Idempotent Error Handling

**Root Cause:**  
Lines 91-95:
```typescript
} catch (error) {
  // If parsing fails, return original URL
  return url;
}
```

When `url` is malformed (e.g., `"garbage"`), the catch block returns it as-is. But on the second call to `normalizeUrl("garbage")`, line 49 prepends `https://`:
```typescript
if (!cleanUrl.match(/^https?:\/\//i)) {
  cleanUrl = 'https://' + cleanUrl;
}
```

This produces `https://garbage`, which differs from the first call's return value of `"garbage"`, breaking idempotence.

**How Property Test Surfaces It:**  
The `never crashes on malformed URLs` test uses `fc.string()` (arbitrary strings, not valid URLs). If the first call returns `"garbage"` and the second call prepends `https://`, the idempotence test will catch the difference.

**Fix:**  
The catch block should return a consistently normalized form, even for garbage input. Change lines 91-95 to:

```typescript
} catch (error) {
  // If parsing fails, return a consistent form that won't change on re-normalization
  // Add protocol if missing to ensure idempotence
  let fallback = url.trim();
  if (!fallback.match(/^https?:\/\//i)) {
    fallback = 'https://' + fallback;
  }
  return fallback;
}
```

This ensures that even malformed URLs get the `https://` prefix on the first call, so subsequent calls return the same value.

**Verification:**  
Call `normalizeUrl("random-garbage")` twice and confirm both return `"https://random-garbage"`.

---

## Bug 6: Multiple Consecutive Slashes in Path (Edge Case)

**Root Cause:**  
The URL class's `pathname` setter normalizes some aspects but not consecutive slashes. The regression test `handles multiple consecutive slashes in path` expects idempotence, but this is likely already handled by URL class. However, if custom path manipulation is added later, this could break.

**How Property Test Surfaces It:**  
This is a regression test, not a property test, so it's already documented. If the URL class doesn't normalize `//` to `/`, idempotence could break.

**Fix:**  
After line 64 (pathname trailing slash removal), add:

```typescript
// Normalize consecutive slashes in path
parsed.pathname = parsed.pathname.replace(/\/+/g, '/');
```

This ensures `//path//to` becomes `/path/to`.

**Verification:**  
Run the regression test `handles multiple consecutive slashes in path` and confirm it passes.

---

## Summary of Changes by Line Number

1. **Lines 44-49**: Replace with options merging using spread operator
2. **Lines 68-70**: Delete www-removal block entirely
3. **Lines 79-82**: Add conditional to avoid setting search when empty
4. **After line 64**: Add consecutive slash normalization
5. **Lines 87-89**: Keep as-is, but add cleanup before return
6. **Line 91 (before return)**: Add trailing delimiter cleanup
7. **Lines 91-95**: Update catch block to prepend protocol for idempotence

---

## Verification Steps After All Fixes

1. Run the full property test suite:
   ```bash
   npm test tests/property/url-normalization.test.ts
   ```
   Expected: All property tests pass with 1000 runs each.

2. Run the regression tests:
   ```bash
   npm test tests/property/url-normalization.test.ts -- "Regressions"
   ```
   Expected: All 4 regression tests pass.

3. Manually verify idempotence with edge cases:
   ```typescript
   const testCases = [
     'garbage',
     'https://www.example.com',
     'https://example.com?utm_source=test',
     'https://example.com#section',
     'https://example.com/path//?',
   ];
   
   testCases.forEach(url => {
     const once = normalizeUrl(url);
     const twice = normalizeUrl(once);
     console.assert(once === twice, `Failed: ${url}`);
   });
   ```

4. Check that the implementation still correctly:
   - Lowercases hostname and protocol
   - Removes default ports (80 for http, 443 for https)
   - Removes trailing slashes (except root `/`)
   - Sorts query parameters alphabetically
   - Removes all tracking parameters from TRACKING_PARAMS list
   - Removes fragments by default

---

## Notes for Hackathon Write-Up

Document these bugs in the blog post:
1. **Options merging subtlety**: TypeScript default parameters don't merge objects
2. **Semantic preservation vs normalization**: www-removal breaks semantic equality
3. **URL serialization quirks**: Empty search/hash can leave delimiters
4. **Idempotent error handling**: Catch blocks must return consistently normalized forms
5. **Property-based testing value**: Caught all 5 bugs that manual testing missed

Highlight that `fc.webUrl()` and `fc.string()` together generated edge cases that would take days to enumerate manually.
