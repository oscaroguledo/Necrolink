/**
 * POST /api/extract — upload a PDF, Markdown or HTML file, get its links back.
 *
 * multipart/form-data fields:
 *   file      (required) the document, max 10 MB
 *   type      (optional) 'pdf' | 'markdown' | 'html'; auto-detected if omitted
 *   options   (optional) JSON: { "deduplicateUrls": boolean, "extractDates": boolean }
 *   baseUrl   (optional) http(s) URL for resolving relative links in HTML
 *
 * 200 → { success: true, data: ExtractionResult }
 * 4xx → { success: false, error: { code, message } }  (codes in spec 01)
 */

import {
  extractLinks,
  ExtractionError,
  MAX_FILE_BYTES,
  type ExtractOptions,
} from '@/lib/extractors';
import type { DocumentType } from '@/types/link';
import { log, errorFields } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Room for multipart boundaries and the small text fields
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const DOCUMENT_TYPES: readonly DocumentType[] = ['pdf', 'markdown', 'html'];

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);
  let bytes: number | undefined;

  try {
    // Reject oversized uploads before reading the body into memory
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
      throw new ExtractionError('FILE_TOO_LARGE', 'File is larger than the 10 MB limit.');
    }

    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      throw new ExtractionError(
        'INVALID_REQUEST',
        'Send the document as multipart/form-data with a "file" field.'
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ExtractionError('INVALID_REQUEST', 'The upload could not be read.');
    }

    const file = form.get('file');
    if (!(file instanceof Blob)) {
      throw new ExtractionError('INVALID_REQUEST', 'Missing "file" field.');
    }
    bytes = file.size;
    if (file.size > MAX_FILE_BYTES) {
      throw new ExtractionError('FILE_TOO_LARGE', 'File is larger than the 10 MB limit.');
    }

    const result = await extractLinks(
      {
        data: new Uint8Array(await file.arrayBuffer()),
        filename: (file instanceof File && file.name ? file.name : 'upload').slice(0, 255),
        mimeType: file.type || undefined,
        type: parseType(form.get('type')),
        baseUrl: parseBaseUrl(form.get('baseUrl')),
      },
      parseOptions(form.get('options'))
    );

    log.info('extract.success', {
      type: result.type,
      bytes,
      links: result.stats.total,
      uniqueLinks: result.stats.unique,
      withDates: result.stats.withDates,
      ms: elapsedMs(),
    });
    return Response.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ExtractionError) {
      log.warn('extract.rejected', { code: error.code, status: error.status, bytes, ms: elapsedMs() });
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    log.error('extract.failed', { bytes, ms: elapsedMs(), ...errorFields(error) });
    return Response.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong while reading this file.' },
      },
      { status: 500 }
    );
  }
}

function parseType(value: FormDataEntryValue | null): DocumentType | undefined {
  if (value === null || value === '') return undefined;
  if (typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)) {
    return value as DocumentType;
  }
  throw new ExtractionError('INVALID_REQUEST', '"type" must be one of: pdf, markdown, html.');
}

function parseBaseUrl(value: FormDataEntryValue | null): string | undefined {
  if (value === null || value === '') return undefined;
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    try {
      return new URL(value).toString();
    } catch {
      // fall through to the error below
    }
  }
  throw new ExtractionError('INVALID_REQUEST', '"baseUrl" must be an http(s) URL.');
}

function parseOptions(value: FormDataEntryValue | null): ExtractOptions {
  if (value === null || value === '') return {};
  if (typeof value !== 'string') {
    throw new ExtractionError('INVALID_REQUEST', '"options" must be a JSON string.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ExtractionError('INVALID_REQUEST', '"options" is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ExtractionError('INVALID_REQUEST', '"options" must be a JSON object.');
  }

  const options: ExtractOptions = {};
  for (const key of ['deduplicateUrls', 'extractDates'] as const) {
    const flag = (parsed as Record<string, unknown>)[key];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') {
      throw new ExtractionError('INVALID_REQUEST', `"options.${key}" must be true or false.`);
    }
    options[key] = flag;
  }
  return options;
}
