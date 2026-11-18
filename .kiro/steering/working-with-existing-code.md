---
name: Working With Existing Code
description: Rules for changing modules that are already implemented and tested
inclusion: always
---

# 🧱 Working With Existing Code

Most of Necrolink is implemented and tested. Earlier rewrites silently removed
security settings and broke link ids, and replaced tests with weaker ones that
hid it (see BUGS_FOUND.md). These rules prevent that.

## Extend, never rewrite

- Before changing a file, read the whole file and its tests.
- Make the smallest change that does the task. Never regenerate a working module
  from scratch, and never replace a file wholesale.
- Keep comments that explain *why* (security settings, CVE notes, timeouts,
  yields to the event loop). They are there because something broke without them.

## Never weaken a test

- Do not delete, skip or loosen an existing test or assertion to make it pass.
  A failing test means the code is wrong until proven otherwise.
- If a test really is wrong, say why in the task notes and change only that test.
- New behaviour gets new tests; old tests keep passing.

## Do not remove these

- `isEvalSupported: false` in the PDF extractor (CVE-2024-4367).
- Deterministic `link_N` ids in every extractor: check results and export match on them.
- The http(s)-only filter on extracted links.
- SSRF checks in `safe-fetch.ts`, on every redirect.
- Internet Archive pacing (`TokenBucketLimiter`) and the circuit breaker.
- Logs never contain filenames, document text or cited URLs.

## Before saying a task is done

```bash
npx tsc --noEmit && npx tsc --noEmit -p tests && npx eslint src tests --max-warnings 0 && npx vitest run && npm run build
```

All five must pass. Report failures as they are; do not hide them.
