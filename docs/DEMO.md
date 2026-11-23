# 🎬 Demo Video Guide (under 3 minutes)

The demo document ("Try the demo document" button) has 7 real links. Each was
run through the real checker and gives the same result every time:

| Link | Result | What to point out |
|---|---|---|
| GeoCities SiliconValley | 🧟 Zombie | Now redirects to Yahoo. *Then:* "Yahoo! GeoCities - SiliconValley", *now:* "Yahoo \| Mail, Weather…". Archived copy from 1999. |
| AltaVista | 🧟 Zombie | *Then:* "AltaVista - Welcome", *now:* "Yahoo Search". |
| White House technology agenda | 👻 Ghost | 404 today; resurrected from the 2014-12-30 archive, the date it was cited. |
| Google Reader | 🪦 Lost soul | 404, and the Archive only ever saved login redirects. Necrolink says so instead of faking a fix. |
| Project dataset | 🪦 Lost soul | Domain never existed in DNS. |
| Wikipedia, Example Domain | 🕯️ Living | Collapsed under "Living". |

## Before you record

1. **Build and start once:** `npm run build && npm start`. Do not restart the
   server afterwards: the caches live in that process.
2. **Warm the caches:** click *Try the demo document* once, a few minutes before
   recording. Results are cached (link health 1 hour, archive lookups 24 hours),
   so the recorded run finishes in seconds instead of ~40.
3. **Do not run the demo repeatedly.** The Internet Archive blocks clients that
   send bursts of requests, for several minutes. If you see "The Internet
   Archive is limiting requests", wait 5–10 minutes. Check it is reachable:
   `curl -s -o /dev/null -w "%{http_code}\n" "https://web.archive.org/cdx/search/cdx?url=example.com&limit=1"` → `200`.
4. Record the browser at about 1280×800, zoomed to 110% so text is legible.
5. Optional: set `KIRO_API_KEY` and `KIRO_API_BASE_URL` to show AI analysis
   ("compared by AI" on a zombie card). The demo works without them.

## Script

### 0:00–0:20 The problem
Show the upload screen.
> "Links rot. Pew Research found that 38% of web pages that existed in 2013 were gone a decade later. Your thesis bibliography is filling up with ghosts, and worse, with zombies: links that still load but no longer show what you cited."

*(Check the Pew figure against their May 2024 report "When Online Content Disappears" before recording.)*

### 0:20–0:45 Upload and live results
Click **Try the demo document**. Let the counters fill and the cards rise.
> "Here are the sources for a thesis on early web communities. Necrolink pulls out every link, with the date it was cited, and checks them all, streaming results as they come in."

### 0:45–1:25 The graveyard
Scroll through the sections.
- **Ghost:** "This White House page is a 404 now. Necrolink found the Internet Archive copy from December 30, 2014, the date it was cited, not just any copy."
- **Zombies:** "These are the ones normal link checkers miss. GeoCities still 'works': it redirects to Yahoo's homepage. Necrolink downloaded the 1999 version and today's page and compared them: completely different content. Same for AltaVista."
- **Lost souls:** "Google Reader is dead and the Archive never saved a real copy. Necrolink tells you to find another source instead of pretending."

### 1:25–1:50 Fix and download
Untick one link, click **Preview**, then **Download fixed document**.
> "I choose what gets fixed. The ghost link now points to the archive, zombies and lost souls get footnotes explaining why. Everything else in my document stays byte-for-byte identical."

### 1:50–2:40 How Kiro built it
Switch to the editor.
- `.kiro/specs/`: "Each feature started as a Kiro spec: requirements, design, tasks."
- `.kiro/steering/`: "Steering docs kept the theme, conventions and API rules consistent."
- `.kiro/hooks/`: "After every file Kiro edits, a hook runs the affected tests. After every spec task, another type-checks, lints and runs the whole suite, so a task can't quietly break earlier work. A third keeps the README in sync with the specs."
- `.agents/tasks/`: "Kiro wrote implementation plans and reviewed its own work."
- `.kiro/settings/mcp.json` + `mcp-wayback/`: show Kiro's chat calling `find_snapshot` or `list_snapshots` (e.g. "When did Google Reader stop being archived as a working page?"). "The same archive tools as the app, available to Kiro while I write."
- [BUGS_FOUND.md](../BUGS_FOUND.md): "Property-based tests caught real bugs: picking the closest snapshot by subtracting timestamps as numbers made a 1-second gap look 8.87 billion apart."

*(Describe only what you actually did in Kiro; judges compare this with the repository. Each MCP call is a real Archive request: rehearse once, then record.)*

### 2:40–3:00 Close
Back to the graveyard.
> "Necrolink: find the dead, unmask the zombies, resurrect what can be saved, and be honest about what can't."

## If something goes wrong on camera

| You see | Do this |
|---|---|
| ⚠️ "The Internet Archive is limiting requests" | Wait 5–10 minutes, then run again (don't restart the server). |
| ⚠️ "Necrolink's server could not reach the internet" | Check your connection; nothing was marked dead. |
| A zombie says "not verified: could not compare" | The Archive was slow; run the demo again a minute later. |
