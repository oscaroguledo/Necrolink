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
