/**
 * POST /api/export logic (spec 04, phase 4): validate the request and build
 * the downloadable file.
 *
 * For Markdown and HTML the server re-extracts links from the submitted
 * content instead of trusting a client-supplied list. Extraction is
 * deterministic (link_1, link_2, ... for the same content and baseUrl), so the
 * check results' linkIds still line up, and a stale or tampered link list
 * cannot rewrite the wrong link.
 */

import type { CheckResult, ExtractedLink, LinkStatus } from '@/types/link';
import { extractLinksFromMarkdown } from '@/lib/extractors/markdown';
import { extractLinksFromHTML } from '@/lib/extractors/html';
import { buildReplacementMap, type ExportStats } from './replacement-map';
import { exportMarkdown } from './markdown';
import { exportHtml } from './html';
import { exportReport } from './report';

export const MAX_EXPORT_BODY_BYTES = 12 * 1024 * 1024;
const MAX_CONTENT_CHARS = 10 * 1024 * 1024;
const MAX_LINKS = 10_000;
const STATUSES: ReadonlySet<string> = new Set<LinkStatus>(['living', 'ghost', 'lost', 'zombie', 'error']);

export class ExportError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

const invalid = (message: string) => new ExportError(400, 'INVALID_REQUEST', message);

type ResultInput = Pick<CheckResult, 'linkId' | 'status' | 'reason' | 'archived'>;
type LinkInput = Pick<ExtractedLink, 'id' | 'originalUrl'> & Partial<Pick<ExtractedLink, 'text' | 'position'>>;

export interface ExportRequest {
  filename: string;
  type: 'markdown' | 'html' | 'pdf';
  format: 'document' | 'report';
  content?: string;
  baseUrl?: string;
  links?: LinkInput[];
  results: ResultInput[];
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string;
  stats: ExportStats;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function parseExportRequest(body: unknown): ExportRequest {
  if (!isObject(body)) throw invalid('Body must be a JSON object');
  const { filename, type, format, content, baseUrl, links, results } = body;

  if (!str(filename, 255)) throw invalid('"filename" must be a non-empty string (max 255 chars)');
  if (type !== 'markdown' && type !== 'html' && type !== 'pdf') throw invalid('"type" must be markdown, html or pdf');
  if (format !== undefined && format !== 'document' && format !== 'report') throw invalid('"format" must be document or report');
  const effectiveFormat = type === 'pdf' ? 'report' : (format ?? 'document');

  if (effectiveFormat === 'document' && (typeof content !== 'string' || content.length > MAX_CONTENT_CHARS)) {
    throw invalid('"content" (the original document text, max 10 MB) is required to export a document');
  }
  if (baseUrl !== undefined && (typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl))) {
    throw invalid('"baseUrl" must be an http(s) URL');
  }

  if (!Array.isArray(results) || results.length > MAX_LINKS) throw invalid(`"results" must be an array of at most ${MAX_LINKS}`);
  const parsedResults = results.map((r, i): ResultInput => {
    if (!isObject(r) || !str(r.linkId, 100) || typeof r.status !== 'string' || !STATUSES.has(r.status)) {
      throw invalid(`results[${i}] needs linkId and a status of living, ghost, lost, zombie or error`);
    }
    const archived = isObject(r.archived) && typeof r.archived.url === 'string'
      ? { url: r.archived.url, timestamp: typeof r.archived.timestamp === 'string' ? r.archived.timestamp : '', originalTimestamp: '', statusCode: '200', mimeType: '' }
      : undefined;
    return {
      linkId: r.linkId as string,
      status: r.status as ResultInput['status'],
      reason: typeof r.reason === 'string' ? r.reason.slice(0, 500) : '',
      ...(archived ? { archived } : {}),
    };
  });

  let parsedLinks: LinkInput[] | undefined;
  if (links !== undefined) {
    if (!Array.isArray(links) || links.length > MAX_LINKS) throw invalid(`"links" must be an array of at most ${MAX_LINKS}`);
    parsedLinks = links.map((l, i) => {
      if (!isObject(l) || !str(l.id, 100) || !str(l.originalUrl, 4096)) throw invalid(`links[${i}] needs id and originalUrl`);
      const position = isObject(l.position) ? l.position : {};
      return {
        id: l.id as string,
        originalUrl: l.originalUrl as string,
        ...(typeof l.text === 'string' ? { text: l.text.slice(0, 500) } : {}),
        position: {
          offset: typeof position.offset === 'number' ? position.offset : 0,
          ...(typeof position.page === 'number' ? { page: position.page } : {}),
          ...(typeof position.line === 'number' ? { line: position.line } : {}),
        },
      };
    });
  }
  if (effectiveFormat === 'report' && !parsedLinks) throw invalid('"links" is required for a report');

  return {
    filename: filename as string,
    type,
    format: effectiveFormat,
    ...(typeof content === 'string' ? { content } : {}),
    ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
    ...(parsedLinks ? { links: parsedLinks } : {}),
    results: parsedResults,
  };
}

/** "My Paper (final).md" → "My_Paper_final_" (safe in Content-Disposition and file systems). */
export function safeBaseName(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  return base.replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').slice(0, 100) || 'document';
}

export async function buildExport(request: ExportRequest, now: Date = new Date()): Promise<ExportFile> {
  const base = safeBaseName(request.filename);

  if (request.format === 'report') {
    const links = request.links!;
    const { stats } = buildReplacementMap(links, request.results);
    return {
      filename: `${base}.necrolink-report.md`,
      contentType: 'text/markdown; charset=utf-8',
      body: exportReport(request.filename, links, request.results, now),
      stats,
    };
  }

  const content = request.content!;
  if (request.type === 'markdown') {
    const links = await extractLinksFromMarkdown(content);
    const { rules, stats } = buildReplacementMap(links, request.results);
    return { filename: `${base}.necrolink.md`, contentType: 'text/markdown; charset=utf-8', body: exportMarkdown(content, links, rules, stats, now), stats };
  }

  const links = await extractLinksFromHTML(content, request.baseUrl);
  const { rules, stats } = buildReplacementMap(links, request.results);
  return { filename: `${base}.necrolink.html`, contentType: 'text/html; charset=utf-8', body: exportHtml(content, links, rules, stats, now), stats };
}
