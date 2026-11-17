/**
 * Browser-side calls to the Necrolink API: extract → check (streamed, in
 * batches of 500) → export.
 */

import type { CheckResult, DocumentType, LinkStatus } from '@/types/link';
import { streamCheckResults, StreamError } from './stream-check-results';

/** A link as it arrives over JSON (dates are ISO strings). */
export interface ClientLink {
  id: string;
  url: string;
  originalUrl: string;
  text: string;
  position: { page?: number; line?: number; offset: number };
  context: string;
  citationDate?: string;
}

export interface ExtractedDocument {
  documentId: string;
  filename: string;
  type: DocumentType;
  links: ClientLink[];
  stats: { total: number; unique: number; withDates: number };
}

/** A result as it arrives over JSON. */
export type ClientResult = Omit<CheckResult, 'checkedAt'> & { checkedAt: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    if (body?.error?.message) return new ApiError(body.error.message, body.error.code ?? 'ERROR');
  } catch {
    // not JSON
  }
  return new ApiError(`The server returned ${response.status}`, 'ERROR');
}

export async function extractDocument(file: File, signal?: AbortSignal): Promise<ExtractedDocument> {
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch('/api/extract', { method: 'POST', body: form, signal });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()).data as ExtractedDocument;
}

export const CHECK_BATCH_SIZE = 500;

/**
 * Check every link, streaming results as they arrive. Large documents are sent
 * in batches of 500 (the API limit), one batch at a time.
 */
export async function checkAllLinks(
  links: ClientLink[],
  onResult: (result: ClientResult) => void,
  signal?: AbortSignal,
  stream: typeof streamCheckResults = streamCheckResults
): Promise<void> {
  for (let i = 0; i < links.length; i += CHECK_BATCH_SIZE) {
    if (signal?.aborted) return;
    const batch = links.slice(i, i + CHECK_BATCH_SIZE).map((l) => ({
      id: l.id,
      url: l.url,
      ...(l.citationDate ? { citationDate: l.citationDate as unknown as Date } : {}),
    }));

    let failure: Error | undefined;
    await stream('/api/check', batch, {
      signal,
      onResult: (result) => onResult(result as unknown as ClientResult),
      onError: (error) => {
        failure = error;
      },
    });
    if (failure) {
      if (failure instanceof StreamError && failure.code === 'CANCELLED') return;
      throw new ApiError(failure.message, failure instanceof StreamError ? failure.code : 'ERROR');
    }
  }
}

export interface ExportedFile {
  filename: string;
  blob: Blob;
  text: string;
}

const FIXABLE: ReadonlySet<LinkStatus> = new Set(['ghost', 'zombie', 'lost']);

/**
 * Build the fixed document (or the report, for PDFs). Only `selected` link ids
 * are changed; everything else is left exactly as it was.
 */
export async function exportDocument(
  doc: ExtractedDocument,
  content: string | undefined,
  results: ClientResult[],
  selected: ReadonlySet<string>
): Promise<ExportedFile> {
  const chosen = results.filter((r) => !FIXABLE.has(r.status) || selected.has(r.linkId));
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: doc.filename,
      type: doc.type,
      ...(content !== undefined && doc.type !== 'pdf' ? { content } : {}),
      links: doc.links.map(({ id, originalUrl, text, position }) => ({ id, originalUrl, text, position })),
      results: chosen.map(({ linkId, status, reason, archived }) => ({
        linkId,
        status,
        reason,
        ...(archived ? { archived: { url: archived.url, timestamp: archived.timestamp } } : {}),
      })),
    }),
  });
  if (!response.ok) throw await errorFrom(response);

  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'necrolink-export.md';
  const text = await response.text();
  return { filename, text, blob: new Blob([text], { type: response.headers.get('content-type') ?? 'text/plain' }) };
}

/** Save a file in the browser. */
export function saveFile(file: ExportedFile): void {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
