/**
 * POST /api/check — check links and stream each result as Server-Sent Events.
 *
 * Body: { "links": [{ "id": "link_1", "url": "https://…", "citationDate"?: "2023-06-15T00:00:00Z" }] }
 * Stream: one `data: <CheckResult>` per link as it finishes, then
 *         `event: done` with counts. See docs/API.md.
 */

import { createCheckHandler } from '@/lib/checker/check-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Large documents take a while; let the stream run (platform limits still apply)
export const maxDuration = 300;

const handler = createCheckHandler();

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
