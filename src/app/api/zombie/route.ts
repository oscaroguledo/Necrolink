/**
 * POST /api/zombie: Standalone endpoint for zombie detection (spec 03, phase 4).
 * Though the main flow goes through /api/check, this endpoint is useful for:
 * - Debugging individual suspicious links
 * - Re-checking a link without re-uploading the document
 * - Future UI feature: "Re-check this zombie link"
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectZombie, type ZombieInput, type AiBudget } from '@/lib/zombie/detector';
import type { ArchivedSnapshot } from '@/types/link';
import { log } from '@/lib/logger';

const MAX_BODY_BYTES = 1024 * 100; // 100 KB

interface ZombieRequestBody {
  linkId: string;
  url: string;
  finalUrl: string;
  archived?: ArchivedSnapshot;
  suspicionReason: string;
}

class BadRequest extends Error {}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function validateRequest(body: unknown): ZombieRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('Body must be a JSON object');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.linkId !== 'string' || req.linkId.length === 0) {
    throw new BadRequest('"linkId" must be a non-empty string');
  }

  if (typeof req.url !== 'string' || !/^https?:\/\//i.test(req.url)) {
    throw new BadRequest('"url" must be an http(s) URL');
  }

  if (typeof req.finalUrl !== 'string' || !/^https?:\/\//i.test(req.finalUrl)) {
    throw new BadRequest('"finalUrl" must be an http(s) URL');
  }

  if (typeof req.suspicionReason !== 'string' || req.suspicionReason.length === 0) {
    throw new BadRequest('"suspicionReason" must be a non-empty string');
  }

  const archived = req.archived as ArchivedSnapshot | undefined;
  if (archived !== undefined && archived !== null) {
    if (typeof archived !== 'object' || typeof archived.url !== 'string' || typeof archived.timestamp !== 'string') {
      throw new BadRequest('"archived" must be a valid ArchivedSnapshot object');
    }
  }

  return {
    linkId: req.linkId,
    url: req.url,
    finalUrl: req.finalUrl,
    archived,
    suspicionReason: req.suspicionReason,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return jsonError(413, 'BODY_TOO_LARGE', 'Request body is larger than 100 KB');
  }

  let body: ZombieRequestBody;
  try {
    const raw = await request.json();
    body = validateRequest(raw);
  } catch (error) {
    const message = error instanceof BadRequest ? error.message : 'Body must be valid JSON';
    return jsonError(400, 'INVALID_REQUEST', message);
  }

  const startedAt = performance.now();
  log.info('zombie.started', { linkId: body.linkId, url: body.url });

  try {
    const input: ZombieInput = {
      url: body.url,
      finalUrl: body.finalUrl,
      suspicionReason: body.suspicionReason,
      ...(body.archived ? { archived: body.archived } : {}),
    };

    // Allow 1 AI call for this request
    const aiBudget: AiBudget = { remaining: 1 };
    const report = await detectZombie(input, { aiBudget });

    const elapsed = Math.round(performance.now() - startedAt);
    log.info('zombie.finished', {
      linkId: body.linkId,
      url: body.url,
      isZombie: report.isZombie,
      method: report.method,
      ms: elapsed,
    });

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    const elapsed = Math.round(performance.now() - startedAt);
    log.error('zombie.failed', {
      linkId: body.linkId,
      url: body.url,
      error: error instanceof Error ? error.message : String(error),
      ms: elapsed,
    });

    return jsonError(500, 'INTERNAL_ERROR', 'Zombie detection failed');
  }
}
