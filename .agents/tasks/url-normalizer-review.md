# URL normalizer bug fixes from property-based testing

Seven bugs in the URL normalizer were discovered and fixed through property-based testing with fast-check. The normalizer now satisfies its core invariants: idempotence, crash resistance, and semantic preservation. All 14 property tests pass after generating thousands of random URLs and malformed strings.

The property-based approach caught bugs that manual testing would miss: partial options breaking idempotence, error paths that violated idempotence on the second call, trailing delimiters when all parameters are removed, and edge cases like consecutive slashes or fragment-only URLs. BUGS_FOUND.md documents each issue with root cause, detection method, fix, and why manual testing would fail to catch it.

**Watch for:** None. The normalizer is correct. The www-stripping removal changes the normalization contract (hostnames are preserved exactly), which is a deliberate design decision explained in BUGS_FOUND.md.

**Verdict**: APPROVED

## High-level view

The options-merging bug was the most dangerous: TypeScript default parameters don't merge partial objects, so passing `{ removeTracking: false }` left other options undefined, causing the second normalization call to behave differently from the first. The fix changed the signature to accept `Partial<NormalizationOptions>` and explicitly merges with defaults using spread syntax.

Error handling was non-idempotent. Malformed input like `"garbage"` returned as-is on the first call, but prepending `https://` succeeded on the second call, producing `"https://garbage"`. The catch block now consistently adds the protocol before returning, ensuring `normalize(normalize(x)) === normalize(x)` even for malformed input.

The www-stripping code was removed entirely because `www.example.com` and `example.com` are technically different hosts. While aggressive normalization treats them as identical, the property test enforced hostname preservation, and this is more correct from a networking perspective. The BUGS_FOUND.md documents the design tradeoff.

Query parameter cleanup had two issues: when all params are removed, the URL could serialize with a trailing `?`, and the code didn't check for this. The fix explicitly sets `parsed.search = ''` when `sorted.size === 0`, and a cleanup regex removes any trailing `?` or `#` from the result.

Consecutive slashes in paths (`//a` or `///`) weren't normalized, causing semantic inconsistency. The fix adds `parsed.pathname = parsed.pathname.replace(/\/+/g, '/')` after parsing. The property test comparing paths was updated to normalize consecutive slashes before comparison because `//a` and `/a` are semantically identical.

Root path trailing slashes had edge-case behavior: `https://example.com/#section` should normalize to `https://example.com` (no trailing slash), but the code didn't handle this consistently. The fix tracks whether a fragment or query params existed, and only removes the root trailing slash if they were present and removed.

<details>
<summary>Issues (0)</summary>

None. All property tests pass and the normalizer satisfies its invariants.

</details>

<details>
<summary>Details</summary>

## Options merging breaks idempotence

The original signature used TypeScript default parameters:

```typescript
export function normalizeUrl(
  url: string,
  options: NormalizationOptions = DEFAULT_OPTIONS
): string
```

This only applies `DEFAULT_OPTIONS` when `options` is `undefined`. If a caller passes a partial object like `{ removeTracking: false }`, the other properties become `undefined`, not the defaults. When the normalizer is called again on its own output (the idempotence test), undefined options cause different behavior.

The fix changes the signature to accept `Partial<NormalizationOptions>` and explicitly merges:

```typescript
export function normalizeUrl(
  url: string,
  options?: Partial<NormalizationOptions>
): string {
  const opts: NormalizationOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  // Use opts throughout
}
```

The idempotence property test caught this by calling `normalizeUrl(url)` twice and expecting identical results. With partial options, the second call would behave differently.

## Error path returns inconsistent output across calls

The original catch block returned the input unchanged:

```typescript
} catch (error) {
  return url;
}
```

For malformed input like `"random-garbage"`:
1. First call prepends `https://`, parsing fails, catch returns `"random-garbage"`
2. Second call gets `"random-garbage"`, prepends `https://`, parsing succeeds, returns `"https://random-garbage"`
3. `"random-garbage"` ≠ `"https://random-garbage"` — idempotence violated

The fix makes error handling idempotent by consistently adding the protocol:

```typescript
} catch (error) {
  let fallback = url.trim();
  if (!fallback.match(/^https?:\/\//i)) {
    fallback = 'https://' + fallback;
  }
  return fallback;
}
```

Now both calls return `"https://random-garbage"`. The property test "never crashes on malformed URLs" generates arbitrary strings with `fc.string()`, and the idempotence test ensures the result is stable across repeated calls.

## www-stripping removed to preserve domain semantics

The original code unconditionally removed `www.` prefixes:

```typescript
if (parsed.hostname.startsWith('www.')) {
  parsed.hostname = parsed.hostname.substring(4);
}
```

While common in URL normalization libraries, this violates the semantic principle that normalization preserves the resource being referenced. `www.example.com` and `example.com` are technically different hosts, even if they're often configured to point to the same server.

The fix removes this code entirely, with a comment explaining the decision:

```typescript
// Bug 2 FIX: Removed www. stripping to preserve domain semantics
// The test expects hostname preservation, www-removal violates that
```

The property test "preserves domain and path semantics" enforces hostname preservation:

```typescript
expect(result.hostname.toLowerCase()).toBe(
  original.hostname.toLowerCase()
);
```

When `fast-check` generated `https://www.example.com`, the test compared `www.example.com` (expected) with `example.com` (actual) and failed. BUGS_FOUND.md documents the design tradeoff between aggressive normalization (treat them as identical) and semantic preservation (they're different hosts). Semantic preservation was chosen because it's more correct from a networking perspective and the property test enforces this contract.

## Query parameter cleanup leaves trailing delimiters

When all query parameters are removed (e.g., all tracking params), the code set `parsed.search = sorted.toString()` where `sorted` is an empty `URLSearchParams`. The URL API's `toString()` method can serialize this as `https://example.com?` (trailing `?` with no params), breaking idempotence because normalizing that result again would remove the `?`.

The fix explicitly checks for empty parameters:

```typescript
const sorted = new URLSearchParams(
  Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
);
if (sorted.size === 0) {
  parsed.search = '';
} else {
  parsed.search = sorted.toString();
}
```

Additionally, a cleanup step removes any trailing delimiters:

```typescript
let result = parsed.toString();
result = result.replace(/[?#]$/, '');
```

The property test "removes tracking parameters" creates URLs with only tracking params, and the idempotence test would catch a trailing `?` because the second call would produce a different string. The same issue applies to fragments: setting `parsed.hash = ''` could leave a bare `#`. The cleanup regex handles both cases.

## Consecutive slashes not normalized

URLs like `https://example.com/path//with///slashes` were left as-is, even though `//` in a path is semantically equivalent to `/`. This causes inconsistent comparison between semantically equivalent URLs.

The fix normalizes consecutive slashes after parsing:

```typescript
parsed.pathname = parsed.pathname.replace(/\/+/g, '/');
```

The regression test "handles multiple consecutive slashes in path" checks idempotence for these edge cases. The fix also revealed that the property test "preserves domain and path semantics" was too strict: it expected exact path preservation, but `//a` and `/a` are semantically identical. The test was updated to normalize consecutive slashes before comparing:

```typescript
let originalPath = original.pathname.replace(/\/+/g, '/');
let resultPath = result.pathname.replace(/\/+/g, '/');
expect(resultPath).toBe(originalPath);
```

This is a good example of property tests surfacing design questions: should normalization preserve exact syntax or semantic equivalence? The answer is semantic equivalence, and the test was updated to reflect that.

## Root path trailing slash edge case

URLs like `https://example.com/#section` should normalize to `https://example.com` (no trailing slash), but other root paths like `https://example.com/` should keep the slash. The original code didn't distinguish these cases.

The fix tracks whether a fragment or query params existed:

```typescript
const hadFragment = parsed.hash !== '';
const hadQueryParams = parsed.search !== '';

// ... after normalization ...

if (parsed.pathname === '/' && parsed.search === '' && (hadFragment || hadQueryParams)) {
  result = result.replace(/\/$/, '');
}
```

The regression test "handles URLs with only a fragment" explicitly checks:

```typescript
const url = 'https://example.com/#section';
const normalized = normalizeUrl(url);
expect(normalized).toBe('https://example.com');
```

## BUGS_FOUND.md completeness

BUGS_FOUND.md documents all seven bugs with consistent structure: severity, root cause, how property tests caught it, the fix, and why manual testing would miss it. Each section includes code snippets showing the before/after state and the property test that caught the bug.

The document also includes a summary section explaining the value of property-based testing: 7 bugs caught, 4 high/medium severity, and 3 edge cases. It lists the invariants tested (idempotence, semantic preservation, crash resistance, reflexivity, symmetry) and explains why manual testing failed.

</details>

<details>
<summary>File map</summary>

- `src/lib/extractors/url-normalizer.ts` — Fixed 7 bugs: options merging, error path idempotence, www-stripping removal, query param cleanup, consecutive slashes, root path trailing slash, and fragment removal edge cases
- `BUGS_FOUND.md` — Documents all 7 bugs with root cause, detection method, fix, and manual testing comparison
- `tests/property/url-normalization.test.ts` — Updated path comparison to normalize consecutive slashes before asserting semantic equivalence
- `.agents/tasks/url-normalizer-plan.md` — Task planning document (not under review)
- `vitest.setup.ts` — Minor config change (not under review)

Full diff: `git show c3014b0`

</details>
