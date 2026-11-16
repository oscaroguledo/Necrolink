# Necrolink API

## `POST /api/extract`

Upload a document and get back every web link in it, with where it appears, the
text around it, and the date it was cited (when one can be found).

Supported files: **PDF**, **Markdown** (`.md`, `.markdown`) and **HTML** (`.html`, `.htm`), up to **10 MB**.

### Request

`multipart/form-data` with these fields:

| Field | Required | Description |
|---|---|---|
| `file` | yes | The document. |
| `type` | no | `pdf`, `markdown` or `html`. Detected automatically if omitted: a file starting with `%PDF-` is always a PDF, otherwise the extension, then the MIME type. |
| `options` | no | JSON object: `{ "deduplicateUrls": boolean, "extractDates": boolean }`. Defaults: `false`, `true`. |
| `baseUrl` | no | `http(s)` URL used to resolve relative links in HTML (`/about` → `https://site/about`). An HTML `<base>` tag is used if this is omitted. Relative links with no base are skipped. |

```bash
curl -F file=@paper.pdf http://localhost:3000/api/extract

curl -F file=@notes.md \
     -F 'options={"deduplicateUrls":true}' \
     http://localhost:3000/api/extract
```

### Success: `200`

```json
{
  "success": true,
  "data": {
    "documentId": "9b1c7c1e-2f0e-4a0b-9c55-0b6f3f6b8e21",
    "filename": "paper.pdf",
    "type": "pdf",
    "links": [
      {
        "id": "link_4",
        "url": "https://journal.example.org/articles/link-rot",
        "originalUrl": "https://journal.example.org/articles/link-rot",
        "text": "https://journal.example.org/articles/link-rot",
        "position": { "page": 2, "offset": 53 },
        "context": "th, J. (2023). Link Rot in Academic Publications. https://journal.example.org/articles/link-rot. Retrieved 2023-06-15. See",
        "citationDate": "2023-06-15T00:00:00.000Z"
      }
    ],
    "stats": { "total": 7, "unique": 7, "withDates": 2 }
  }
}
```

**Link fields**

| Field | Meaning |
|---|---|
| `id` | `link_N`, unique within this response. |
| `url` | Normalized URL: lowercase host, no tracking parameters (`utm_*`, `fbclid`, …), no `#fragment`, sorted query, no trailing slash. Use this for checking and de-duplication. |
| `originalUrl` | The URL exactly as written in the document. |
| `text` | Anchor text (e.g. "the Internet Archive"), or the URL itself for bare URLs. |
| `position` | PDF: `page` (1-based) and `offset` within that page's text. Markdown: `line` and character `offset`. HTML: `offset` is the link's index among `<a>` elements. |
| `context` | About 50 characters either side of the link, on one line. |
| `citationDate` | ISO date at UTC midnight, if the context contains one. An access date ("Retrieved…", "Accessed…") is preferred over a publication date, then any date, then an APA year like `(2023)`. Omitted when none is found or when `extractDates` is `false`. |

**Stats** describe the whole document, before de-duplication: `total` links,
`unique` URLs, and how many links have a citation date (`withDates`).

**What is skipped:** `mailto:`, `tel:`, `javascript:`, `data:`, `ftp:` and
fragment-only (`#top`) links. A URL that is both printed and clickable in a PDF
is reported once.

### Errors

Every error has the same shape, and `message` is written for end users:

```json
{ "success": false, "error": { "code": "ENCRYPTED_PDF", "message": "This PDF is password-protected. Remove the password and upload it again." } }
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Not `multipart/form-data`, no `file` field, empty file, or an invalid `type`, `options` or `baseUrl`. |
| 413 | `FILE_TOO_LARGE` | Over 10 MB, or a PDF with more than 1000 pages. |
| 415 | `UNSUPPORTED_FORMAT` | Not a PDF, Markdown or HTML file. |
| 422 | `ENCRYPTED_PDF` | Password-protected PDF. |
| 422 | `PARSE_ERROR` | Corrupt PDF, or a text file that is not valid UTF-8. |
| 422 | `PARSE_TIMEOUT` | Parsing took longer than 30 seconds. |
| 422 | `NO_LINKS_FOUND` | The document contains no web links. |
| 500 | `INTERNAL_ERROR` | Unexpected failure (logged as `extract.failed`). |

### Limits and behavior

- Uploads with a `Content-Length` over 10 MB are rejected before the body is read.
- PDFs are parsed with pdf.js with `eval` disabled (mitigates CVE-2024-4367), and
  parsing yields to the event loop between pages so one large PDF does not block
  other requests.
- Performance (spec 01): a 50-page PDF with 300 links extracts in about 0.2 s;
  tested in `tests/integration/performance.test.ts`.

### Logging

Each request writes one JSON line to the server log: `extract.success`
(type, bytes, link counts, ms), `extract.rejected` (code, status) or
`extract.failed` (unexpected error). Filenames, document contents and URLs are
never logged.

---

## `POST /api/check`

Check links and stream back each one's status as soon as it is known. Send the
`links` from `/api/extract` (only `id`, `url` and `citationDate` are needed).

### Request

`application/json`, at most 500 links and 1 MB:

```json
{
  "links": [
    { "id": "link_1", "url": "https://example.com/paper", "citationDate": "2023-06-15T00:00:00.000Z" }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique within the request, max 100 characters. Echoed back as `linkId`. |
| `url` | yes | `http(s)` URL, max 2048 characters. |
| `citationDate` | no | ISO date. Used to pick the archived copy closest to when the source was cited; without it the newest copy is used. |

### Response: Server-Sent Events

`200` with `Content-Type: text/event-stream`. One event per link, in the order
the checks finish, then a final `done` event:

```
data: {"linkId":"link_2","url":"https://no-such-domain.example/paper","status":"lost","reason":"The domain no longer exists, and the Internet Archive has no copy","checkedAt":"2026-11-16T16:06:06.217Z"}

data: {"linkId":"link_1","url":"http://www.geocities.com/SiliconValley/","httpStatus":200,"finalUrl":"https://www.yahoo.com/","status":"zombie","suspicious":true,"reason":"Redirects to a different site (www.yahoo.com)","archived":{"url":"https://web.archive.org/web/19991009015113/http://www.geocities.com/SiliconValley/","timestamp":"1999-10-09T01:51:13.000Z","originalTimestamp":"19991009015113","statusCode":"200","mimeType":"text/html"},"checkedAt":"2026-11-16T16:06:09.100Z"}

event: done
data: {"total":2,"living":0,"ghost":0,"lost":1,"zombie":1,"error":0,"ms":3463}
```

The browser's `EventSource` cannot send a POST body, so read the stream with
`fetch()` and `response.body.getReader()`, splitting on blank lines.

**Statuses**

| Status | Meaning | Extra fields |
|---|---|---|
| `living` 🕯️ | The page loads. | `httpStatus`, `finalUrl` if it redirected within the same site |
| `ghost` 👻 | Dead, and the Internet Archive has a copy. | `archived`: the 200-status capture closest to `citationDate` |
| `lost` 🪦 | Dead, and the Internet Archive has no copy. Find another source. | |
| `zombie` 🧟 | Loads, but looks wrong: redirects to another site, a login page, or the homepage; long redirect chain; 401/403. Tentative until content is compared (spec 03). | `suspicious: true`, `finalUrl`, `archived` when available |
| `error` | Could not be checked: private/internal address, invalid URL, still rate limited, or the Internet Archive was unreachable for a dead link (`error: "WAYBACK_UNAVAILABLE"`). | `error` |

Every result has a one-sentence `reason` written for end users.

**Dead** means 404, 410, 5xx, another 4xx, a domain that no longer exists, a
refused or dropped connection, no response within 8 s, or a broken TLS
certificate.

### How links are checked

- `HEAD` first, then `GET` if `HEAD` fails or is rejected; bodies are never downloaded.
- Up to 3 redirects, 8 s timeout per request, up to 3 retries on 429 / 503 /
  transient network errors (1 s, 2 s, 4 s, or `Retry-After` up to 10 s).
- At most 10 links in flight; each distinct URL is checked once per request.
- User-Agent: `Necrolink/0.1.0 (link rot checker; +https://github.com/oscaroguledo/Necrolink)`.
- Wayback Machine lookups are limited to 5 per second across the server.
- Caches: link health 1 hour, archive lookups 24 hours (including "no copy").
- Disconnecting cancels in-flight checks.

### Security: server-side request forgery

Links come from uploaded documents, so the server refuses to connect to
private, loopback, link-local (including the cloud metadata address
`169.254.169.254`), carrier-grade NAT, multicast, documentation and
IPv4-mapped IPv6 addresses. The address is checked at connection time, on
every redirect hop, and a host is refused if any of its DNS records is
non-public, which also blocks DNS rebinding. Such links get status `error`
with `error: "BLOCKED_ADDRESS"`.

### Errors (before streaming starts)

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Not JSON, no `links`, more than 500, or an invalid `id`, `url` or `citationDate`. |
| 413 | `BODY_TOO_LARGE` | Body over 1 MB. |

### Logging

`check.started` (link count) and `check.finished` (counts per status, ms,
whether the client cancelled). URLs are not logged.
