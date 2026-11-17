/**
 * Request handler for POST /api/check: validates the links, checks them with
 * limited concurrency and streams each result as a Server-Sent Event the
 * moment it is ready (spec 02, phase 5).
 *
 * Kept outside the route file so tests can inject a fake network; Next.js
 * route files may only export route handlers and config.
 */

import type { CheckResult } from '@/types/link';
import { checkLink, type CheckDeps, type LinkToCheck } from './check-link';
import { log } from '@/lib/logger';
import { createLimiter } from './concurrency';

export const MAX_LINKS_PER_REQUEST = 500;
/** Kiro API calls allowed per /api/check request (spec 03 task 5.3). */
export const AI_CALLS_PER_REQUEST = 50;
const MAX_BODY_BYTES = 1024 * 1024;
const CONCURRENCY = 10;

export interface CheckSummary {
  total: number;
  living: number;
  ghost: number;
  lost: number;
  zombie: number;
  error: number;
  ms: number;
}

class BadRequest extends Error {}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

/** Parse and validate `{ links: [{ id, url, citationDate? }] }`. */
export function parseCheckRequest(body: unknown): LinkToCheck[] {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { links?: unknown }).links)) {
    throw new BadRequest('Body must be JSON: { "links": [{ "id", "url", "citationDate"? }] }');
  }
  const raw = (body as { links: unknown[] }).links;
  if (raw.length === 0) throw new BadRequest('"links" is empty');
  if (raw.length > MAX_LINKS_PER_REQUEST) {
    throw new BadRequest(`At most ${MAX_LINKS_PER_REQUEST} links per request (got ${raw.length})`);
  }

  const seenIds = new Set<string>();
  return raw.map((item, i) => {
    const where = `links[${i}]`;
    if (typeof item !== 'object' || item === null) throw new BadRequest(`${where} must be an object`);
    const { id, url, citationDate } = item as Record<string, unknown>;

    if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
      throw new BadRequest(`${where}.id must be a non-empty string (max 100 chars)`);
    }
    if (seenIds.has(id)) throw new BadRequest(`${where}.id "${id}" is duplicated`);
    seenIds.add(id);

    if (typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url)) {
      throw new BadRequest(`${where}.url must be an http(s) URL of at most 2048 characters`);
    }

    let date: Date | undefined;
    if (citationDate !== undefined && citationDate !== null) {
      date = typeof citationDate === 'string' ? new Date(citationDate) : undefined;
      if (!date || Number.isNaN(date.getTime())) {
        throw new BadRequest(`${where}.citationDate must be an ISO date string`);
      }
    }
    return { id, url, ...(date ? { citationDate: date } : {}) };
  });
}

function sseEvent(data: unknown, event?: string): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

/** Build the POST handler. `deps` are for tests; production uses the real network. */
export function createCheckHandler(deps: CheckDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return jsonError(413, 'BODY_TOO_LARGE', 'Request body is larger than 1 MB');
    }

    let links: LinkToCheck[];
    try {
      links = parseCheckRequest(await request.json());
    } catch (error) {
      const message = error instanceof BadRequest ? error.message : 'Body must be valid JSON';
      return jsonError(400, 'INVALID_REQUEST', message);
    }

    const startedAt = performance.now();
    const controller = new AbortController();
    request.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const limit = createLimiter(CONCURRENCY);
    const requestDeps: CheckDeps = { aiBudget: { remaining: AI_CALLS_PER_REQUEST }, ...deps };
    const encoder = new TextEncoder();
    log.info('check.started', { links: links.length });

    const stream = new ReadableStream<Uint8Array>({
      async start(sink) {
        const summary: CheckSummary = { total: links.length, living: 0, ghost: 0, lost: 0, zombie: 0, error: 0, ms: 0 };
        // Check each distinct URL + citation day once; fan the result out to every link id
        const inFlight = new Map<string, Promise<CheckResult>>();
        const send = (chunk: string) => {
          if (controller.signal.aborted) return;
          try {
            sink.enqueue(encoder.encode(chunk));
          } catch {
            // Client cancelled between the check and the enqueue
          }
        };

        await Promise.all(
          links.map((link) => {
            const key = `${link.url}|${link.citationDate?.toISOString().slice(0, 10) ?? ''}`;
            let pending = inFlight.get(key);
            if (!pending) {
              pending = limit(() =>
                controller.signal.aborted
                  ? Promise.resolve<CheckResult>({
                      linkId: link.id,
                      url: link.url,
                      status: 'error',
                      reason: 'Check cancelled',
                      error: 'CANCELLED',
                      checkedAt: new Date(),
                    })
                  : checkLink(link, requestDeps, controller.signal)
              );
              inFlight.set(key, pending);
            }
            return pending.then((result) => {
              const forThisLink: CheckResult = { ...result, linkId: link.id };
              summary[forThisLink.status]++;
              send(sseEvent(forThisLink));
            });
          })
        );

        summary.ms = Math.round(performance.now() - startedAt);
        send(sseEvent(summary, 'done'));
        log.info('check.finished', { ...summary, cancelled: controller.signal.aborted });
        try {
          sink.close();
        } catch {
          // Already closed because the client cancelled
        }
      },
      cancel() {
        // Client went away: abort in-flight fetches; queued checks see the
        // signal when they start and return immediately without a request
        controller.abort();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  };
}
