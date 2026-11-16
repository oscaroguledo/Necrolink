/**
 * Extraction service: one entry point for every document type.
 * Detects the type, enforces the size limit, runs the right extractor and
 * builds the response body for POST /api/extract.
 */

import { randomUUID } from 'crypto';
import type { DocumentType, ExtractedLink, ExtractionResult } from '@/types/link';
import { extractLinksFromMarkdown } from './markdown';
import { extractLinksFromHTML } from './html';
import { extractLinksFromPDF, PdfExtractionError } from './pdf';

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (spec 01)

export type ExtractionErrorCode =
  | 'INVALID_REQUEST'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'ENCRYPTED_PDF'
  | 'PARSE_ERROR'
  | 'NO_LINKS_FOUND';

const STATUS: Record<ExtractionErrorCode, number> = {
  INVALID_REQUEST: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  ENCRYPTED_PDF: 422,
  PARSE_ERROR: 422,
  NO_LINKS_FOUND: 422,
};

/** An error the API turns into `{ success: false, error: { code, message } }`. */
export class ExtractionError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ExtractionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ExtractionError';
    this.status = STATUS[code];
  }
}

export interface ExtractInput {
  data: Uint8Array;
  filename: string;
  mimeType?: string;
  /** Overrides detection when given. */
  type?: DocumentType;
  /** Base URL for resolving relative links in HTML. */
  baseUrl?: string;
}

export interface ExtractOptions {
  /** Keep only the first occurrence of each URL. Default false. */
  deduplicateUrls?: boolean;
  /** Parse citation dates from context. Default true. */
  extractDates?: boolean;
}

const EXTENSIONS: Record<string, DocumentType> = {
  pdf: 'pdf',
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
};

const MIME_TYPES: Record<string, DocumentType> = {
  'application/pdf': 'pdf',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
};

/**
 * Work out the document type: explicit type, then file extension, then MIME
 * type, then file contents (a PDF always starts with "%PDF-").
 */
export function detectDocumentType(input: Omit<ExtractInput, 'baseUrl'>): DocumentType {
  if (input.type) return input.type;

  const ext = input.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && EXTENSIONS[ext]) return EXTENSIONS[ext];

  const mime = input.mimeType?.toLowerCase().split(';')[0]?.trim();
  if (mime && MIME_TYPES[mime]) return MIME_TYPES[mime];

  if (startsWithPdfMagic(input.data)) return 'pdf';

  throw new ExtractionError(
    'UNSUPPORTED_FORMAT',
    'Unsupported file type. Upload a PDF, Markdown (.md) or HTML (.html) file.'
  );
}

/**
 * Extract links from an uploaded document.
 *
 * @throws ExtractionError for every expected failure (size, type, parse, no links)
 */
export async function extractLinks(
  input: ExtractInput,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  if (input.data.byteLength > MAX_FILE_BYTES) {
    throw new ExtractionError('FILE_TOO_LARGE', 'File is larger than the 10 MB limit.');
  }
  if (input.data.byteLength === 0) {
    throw new ExtractionError('INVALID_REQUEST', 'The uploaded file is empty.');
  }

  const type = detectDocumentType(input);
  let links = await runExtractor(type, input);

  const total = links.length;
  if (total === 0) {
    throw new ExtractionError('NO_LINKS_FOUND', 'No web links were found in this document.');
  }

  if (options.extractDates === false) {
    links = links.map((link) => {
      const copy = { ...link };
      delete copy.citationDate;
      return copy;
    });
  }

  // Stats describe the whole document, before deduplication
  const stats = {
    total,
    unique: new Set(links.map((l) => l.url)).size,
    withDates: links.filter((l) => l.citationDate).length,
  };

  if (options.deduplicateUrls) {
    const seen = new Set<string>();
    links = links.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }

  return {
    documentId: randomUUID(),
    filename: input.filename,
    type,
    links,
    stats,
  };
}

async function runExtractor(type: DocumentType, input: ExtractInput): Promise<ExtractedLink[]> {
  if (type === 'pdf') {
    try {
      return await extractLinksFromPDF(input.data);
    } catch (error) {
      if (error instanceof PdfExtractionError) {
        throw new ExtractionError(
          error.code === 'ENCRYPTED' ? 'ENCRYPTED_PDF' : 'PARSE_ERROR',
          error.message
        );
      }
      throw new ExtractionError('PARSE_ERROR', 'This PDF could not be read.');
    }
  }

  const text = decodeText(input.data);
  return type === 'markdown'
    ? extractLinksFromMarkdown(text)
    : extractLinksFromHTML(text, input.baseUrl);
}

function decodeText(data: Uint8Array): string {
  try {
    // fatal: reject binary files (e.g. a PDF renamed to .md) instead of garbling them
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^﻿/, '');
  } catch {
    throw new ExtractionError('PARSE_ERROR', 'The file is not valid UTF-8 text.');
  }
}

function startsWithPdfMagic(data: Uint8Array): boolean {
  // "%PDF-" may appear within the first 1 KB per the PDF spec
  const head = new TextDecoder('latin1').decode(data.subarray(0, 1024));
  return head.includes('%PDF-');
}
