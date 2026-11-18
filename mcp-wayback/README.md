# 🔌 Necrolink Wayback MCP server

Gives Kiro (or any MCP client) the same Internet Archive tools the Necrolink web
app uses, so you can resurrect and inspect links while you write.

| Tool | What it does |
|---|---|
| `find_snapshot(url, date?)` | The Wayback Machine copy closest to the date the link was cited (`YYYY-MM-DD`), or the newest copy. Says "lost soul" if the URL was never archived. |
| `list_snapshots(url, from?, to?, limit?)` | The most recent distinct captures of a URL, oldest first. Identical consecutive captures are merged, so each entry is a version that changed. Useful for seeing when a page changed or died. |
| `check_link(url, cited?)` | Necrolink's full check: 🕯️ living, 👻 ghost, 🪦 lost soul or 🧟 zombie, with the reason and the archived copy. |

All three are read-only. They reuse the app's code, so the same protections
apply: private and internal addresses are never fetched, requests to the
Internet Archive are paced (12 per minute, bursts of 5) and stop for 5 minutes
if the Archive pushes back, and results are cached for the life of the process.

## Use it in Kiro

The workspace config is already in [`.kiro/settings/mcp.json`](../.kiro/settings/mcp.json).
After `npm install`, open the project in Kiro and enable **necrolink-wayback**
in the MCP panel. Then ask things like:

- "Is http://www.geocities.com/SiliconValley/ still the page I cited in 2005?"
- "Find an archived copy of every dead link in docs/sources.md, closest to the dates they were cited."
- "When did https://www.google.com/reader/ stop being archived as a working page?"

`find_snapshot` and `list_snapshots` are auto-approved. `check_link` asks first,
because it fetches the live URL.

## Run it yourself

```bash
npm run mcp:wayback        # MCP over stdio; logs go to stderr
```

Optional environment: `WAYBACK_MAX_PER_MINUTE`, `WAYBACK_BURST` (pacing),
`KIRO_API_KEY` / `KIRO_API_BASE_URL` / `KIRO_MODEL` (AI comparison for unclear
zombies in `check_link`).

The server and the web app each pace their own requests. If you run both and
the Internet Archive starts refusing connections, lower `WAYBACK_MAX_PER_MINUTE`.

## Code

- [`server.ts`](server.ts): registers the tools and connects stdio.
- [`tools.ts`](tools.ts): input schemas and handlers (tested in `tests/unit/mcp-wayback.test.ts`).
- Archive client: [`src/lib/wayback/cdx.ts`](../src/lib/wayback/cdx.ts) (`findArchivedSnapshot`, `listSnapshots`).
