/**
 * POST /api/export — download the document with resurrected links (spec 04).
 *
 * Body (JSON): { filename, type: "markdown" | "html" | "pdf", format?: "document" | "report",
 *                content?, baseUrl?, links?, results }
 * 200 → the file, as an attachment. PDFs (and format "report") return a
 *       Markdown resurrection report. See docs/API.md.
 */

import {
  buildExport,
  parseExportRequest,
  ExportError,
  MAX_EXPORT_BODY_BYTES,
} from '@/lib/exporters/export-handler';
import { log, errorFields } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_EXPORT_BODY_BYTES) {
      throw new ExportError(413, 'BODY_TOO_LARGE', 'Request body is larger than 12 MB');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ExportError(400, 'INVALID_REQUEST', 'Body must be valid JSON');
    }

    const file = await buildExport(parseExportRequest(body));
    log.info('export.success', { ...file.stats, bytes: file.body.length, ms: Math.round(performance.now() - startedAt) });

    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'X-Necrolink-Stats': JSON.stringify(file.stats),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      log.warn('export.rejected', { code: error.code, status: error.status });
      return errorResponse(error.status, error.code, error.message);
    }
    log.error('export.failed', errorFields(error));
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while building the export.');
  }
}
