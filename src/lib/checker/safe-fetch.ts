/**
 * Fetch a user-supplied URL's status safely.
 *
 * Security (SSRF): links come from uploaded documents, so anyone can make the
 * server request any URL. Requests to private, loopback, link-local (incl. the
 * cloud metadata endpoint 169.254.169.254) and other non-public addresses are
 * refused. The check runs on the address actually connected to, inside the DNS
 * lookup, on every redirect hop, so DNS rebinding and redirects to internal
 * hosts are blocked too.
 *
 * safeFetch() reads only status and headers. fetchPage() also downloads the
 * body of HTML responses, capped at 2 MB, for content comparison (spec 03).
 */

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import type { LookupFunction } from 'node:net';

export const USER_AGENT =
  'Necrolink/0.1.0 (link rot checker; +https://github.com/oscaroguledo/Necrolink)';

export type FetchErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_ADDRESS'
  | 'DNS_NOT_FOUND'
  | 'TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'TLS_ERROR'
  | 'TOO_MANY_REDIRECTS'
  | 'NETWORK_ERROR'
  /** The DNS lookup timed out (EAI_AGAIN): the domain may well exist. */
  | 'DNS_TEMPORARY';

export interface FetchResult {
  /** HTTP status of the final response, if one was received. */
  status?: number;
  /** URL of the final response (after redirects). */
  finalUrl: string;
  /** Every URL redirected to, in order. */
  redirects: string[];
  /** Method that produced the final result. */
  method: 'HEAD' | 'GET';
  /** Total requests made, including retries and the GET fallback. */
  attempts: number;
  error?: FetchErrorCode;
  errorMessage?: string;
}

export interface SafeFetchOptions {
  /** Per-request timeout. Default 8 s (spec 02). */
  timeoutMs?: number;
  /** Maximum redirects to follow. Default 3 (spec 02). */
  maxRedirects?: number;
  /** Maximum retries for 429 / 503 / network errors. Default 3 (spec 02). */
  maxRetries?: number;
  /** Base backoff delay; retries wait base × 1, 2, 4. Default 1000 ms. */
  retryBaseMs?: number;
  signal?: AbortSignal;
  /** Decide whether an IP may be connected to. Default: public addresses only. */
  isAllowedAddress?: (ip: string) => boolean;
  /** DNS resolver (injectable for tests). Default: dns.lookup. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Sleep function (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------

const BLOCKED = new net.BlockList();
for (const [range, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  BLOCKED.addSubnet(range, prefix, 'ipv4');
}
for (const [range, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds IPv4)
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(range, prefix, 'ipv6');
}

/** True if `ip` is a public unicast address that may be fetched. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return false;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) could smuggle a private IPv4 past the
  // IPv6 rules, so refuse all of them. (Not done with a ::ffff:0:0/96 BlockList
  // rule: BlockList checks plain IPv4 addresses against IPv6 rules in mapped
  // form, so that rule would block every IPv4 address.)
  if (family === 6 && isIPv4Mapped(ip)) return false;
  return !BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

function isIPv4Mapped(ip: string): boolean {
  // Normalize to compressed hex form: ::ffff:127.0.0.1 → ::ffff:7f00:1
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  return /^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(normalized);
}

class BlockedAddressError extends Error {
  readonly code = 'EBLOCKED';
  constructor(host: string) {
    super(`Refusing to connect to non-public address for ${host}`);
  }
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

/**
 * A net.LookupFunction that resolves the host and refuses it if ANY address is
 * not allowed (prevents mixed public/private records). Runs at connect time, so
 * the address checked is the address used.
 */
function guardedLookup(
  resolve: (hostname: string) => Promise<string[]>,
  isAllowed: (ip: string) => boolean
): LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          const err = Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
          return callback(err);
        }
        if (!addresses.every(isAllowed)) return callback(new BlockedAddressError(hostname));
        const entries = addresses.map((address) => ({ address, family: net.isIP(address) }));
        if (options?.all) return callback(null, entries);
        const first = entries[0]!;
        return callback(null, first.address, first.family);
      },
      (err) => callback(err)
    );
  }) as LookupFunction;
}

// ---------------------------------------------------------------------------
// Single request (no redirects, no retries)
// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  location?: string;
  retryAfter?: string;
  contentType?: string;
  body?: string;
  truncated?: boolean;
}

interface BodyOptions {
  /** Download the body (2xx HTML responses only), up to this many bytes. */
  maxBodyBytes?: number;
}

const HTML_TYPE = /^\s*(text\/html|application\/xhtml\+xml)\b/i;

function decodeBody(chunks: Buffer[], contentType: string | undefined): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1] ?? 'utf-8';
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return decoder.decode(Buffer.concat(chunks));
}

function requestOnce(
  url: URL,
  method: 'HEAD' | 'GET',
  opts: Required<Pick<SafeFetchOptions, 'timeoutMs' | 'isAllowedAddress' | 'resolve'>> &
    Pick<SafeFetchOptions, 'signal'> &
    BodyOptions
): Promise<RawResponse> {
  return new Promise((resolvePromise, reject) => {
    // Literal IP hosts skip DNS lookup, so check them here
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !opts.isAllowedAddress(host)) {
      reject(new BlockedAddressError(host));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
      },
      lookup: guardedLookup(opts.resolve, opts.isAllowedAddress),
      signal: opts.signal,
    });

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }));
    }, opts.timeoutMs);

    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      const retryAfter = res.headers['retry-after'];
      const contentType = res.headers['content-type'];
      const wantBody =
        opts.maxBodyBytes !== undefined &&
        method === 'GET' &&
        status >= 200 &&
        status < 300 &&
        HTML_TYPE.test(contentType ?? '');

      if (!wantBody) {
        clearTimeout(timer);
        res.destroy();
        req.destroy();
        resolvePromise({ status, location, retryAfter, contentType });
        return;
      }

      // Download the HTML, stopping at the size cap
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const finish = (truncated: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res.destroy();
        req.destroy();
        resolvePromise({ status, location, retryAfter, contentType, body: decodeBody(chunks, contentType), truncated });
      };
      res.on('data', (chunk: Buffer) => {
        const room = opts.maxBodyBytes! - size;
        if (chunk.length >= room) {
          chunks.push(chunk.subarray(0, room));
          size += room;
          finish(true);
        } else {
          chunks.push(chunk);
          size += chunk.length;
        }
      });
      res.on('end', () => finish(false));
      res.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

function classifyError(err: unknown): { code: FetchErrorCode; message: string } {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof BlockedAddressError) return { code: 'BLOCKED_ADDRESS', message };
  if (code === 'EAI_AGAIN') {
    return { code: 'DNS_TEMPORARY', message: 'The DNS lookup timed out' };
  }
  if (code === 'ENOTFOUND' || code === 'ENODATA') {
    return { code: 'DNS_NOT_FOUND', message: 'Domain does not exist (DNS lookup failed)' };
  }
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || (err as Error)?.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'No response before the timeout' };
  }
  if (code === 'ECONNREFUSED') return { code: 'CONNECTION_REFUSED', message: 'Connection refused' };
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return { code: 'CONNECTION_RESET', message: 'Connection was reset' };
  }
  if (code.startsWith('ERR_TLS') || code.includes('CERT') || code === 'EPROTO') {
    return { code: 'TLS_ERROR', message: `TLS/certificate error (${code})` };
  }
  return { code: 'NETWORK_ERROR', message };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const RETRY_STATUSES = new Set([429, 503]);
const RETRY_ERRORS = new Set<FetchErrorCode>(['TIMEOUT', 'CONNECTION_RESET', 'NETWORK_ERROR', 'DNS_TEMPORARY']);

/**
 * Fetch a URL's final status: HEAD first, GET if HEAD fails or is rejected,
 * following up to 3 redirects, retrying 429 / 503 / transient network errors
 * with exponential backoff.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<FetchResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? 8000,
    maxRedirects: options.maxRedirects ?? 3,
    maxRetries: options.maxRetries ?? 3,
    retryBaseMs: options.retryBaseMs ?? 1000,
    isAllowedAddress: options.isAllowedAddress ?? isPublicAddress,
    resolve: options.resolve ?? defaultResolve,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    signal: options.signal,
  };

  let url: URL;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('not http(s)');
  } catch {
    return {
      finalUrl: rawUrl,
      redirects: [],
      method: 'HEAD',
      attempts: 0,
      error: 'INVALID_URL',
      errorMessage: 'Not a valid http(s) URL',
    };
  }

  let attempts = 0;
  const run = async (method: 'HEAD' | 'GET'): Promise<FetchResult> => {
    for (let retry = 0; ; retry++) {
      attempts++;
      const result = await followRedirects(url, method, opts);
      const retriable =
        (result.status !== undefined && RETRY_STATUSES.has(result.status)) ||
        (result.error !== undefined && RETRY_ERRORS.has(result.error));
      if (!retriable || retry >= opts.maxRetries || opts.signal?.aborted) {
        return { ...result, method, attempts };
      }
      await opts.sleep(backoffMs(retry, opts.retryBaseMs, result.retryAfter));
    }
  };

  const head = await run('HEAD');
  // Many servers mishandle HEAD (405, 403, 404, 5xx, resets); confirm with GET.
  // Not for blocked/invalid/DNS failures, which GET cannot change.
  const confirmWithGet =
    (head.status !== undefined && head.status >= 400) ||
    (head.error !== undefined &&
      !['BLOCKED_ADDRESS', 'INVALID_URL', 'DNS_NOT_FOUND', 'TOO_MANY_REDIRECTS'].includes(head.error));
  if (!confirmWithGet || opts.signal?.aborted) return strip(head);
  return strip(await run('GET'));
}

function strip(result: FetchResult & { retryAfter?: string }): FetchResult {
  return {
    finalUrl: result.finalUrl,
    redirects: result.redirects,
    method: result.method,
    attempts: result.attempts,
    ...(result.status !== undefined ? { status: result.status } : {}),
    ...(result.error ? { error: result.error, errorMessage: result.errorMessage } : {}),
  };
}

export interface PageResult extends FetchResult {
  contentType?: string;
  /** HTML of a 2xx HTML response; undefined for other responses. */
  html?: string;
  /** True if the body was cut off at the size cap. */
  truncated?: boolean;
}

export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

/**
 * Download a page's HTML (GET, same SSRF protection, redirects, timeout and
 * retries as safeFetch). Non-HTML responses return status only.
 */
export async function fetchPage(
  rawUrl: string,
  options: SafeFetchOptions & { maxBytes?: number } = {}
): Promise<PageResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? 8000,
    maxRedirects: options.maxRedirects ?? 3,
    maxRetries: options.maxRetries ?? 2,
    retryBaseMs: options.retryBaseMs ?? 1000,
    isAllowedAddress: options.isAllowedAddress ?? isPublicAddress,
    resolve: options.resolve ?? defaultResolve,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    signal: options.signal,
    maxBodyBytes: options.maxBytes ?? MAX_PAGE_BYTES,
  };

  let url: URL;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('not http(s)');
  } catch {
    return { finalUrl: rawUrl, redirects: [], method: 'GET', attempts: 0, error: 'INVALID_URL', errorMessage: 'Not a valid http(s) URL' };
  }

  for (let retry = 0, attempts = 1; ; retry++, attempts++) {
    const result = await followRedirects(url, 'GET', opts);
    const retriable =
      (result.status !== undefined && RETRY_STATUSES.has(result.status)) ||
      (result.error !== undefined && RETRY_ERRORS.has(result.error));
    if (!retriable || retry >= opts.maxRetries || opts.signal?.aborted) {
      return {
        ...strip({ ...result, method: 'GET', attempts }),
        ...(result.contentType ? { contentType: result.contentType } : {}),
        ...(result.body !== undefined ? { html: result.body, truncated: Boolean(result.truncated) } : {}),
      };
    }
    await opts.sleep(backoffMs(retry, opts.retryBaseMs, result.retryAfter));
  }
}

function backoffMs(retry: number, baseMs: number, retryAfter?: string): number {
  const exponential = baseMs * 2 ** retry; // 1s, 2s, 4s
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000);
  return exponential;
}

async function followRedirects(
  start: URL,
  method: 'HEAD' | 'GET',
  opts: Required<Pick<SafeFetchOptions, 'timeoutMs' | 'maxRedirects' | 'isAllowedAddress' | 'resolve'>> &
    Pick<SafeFetchOptions, 'signal'> &
    BodyOptions
): Promise<
  Omit<FetchResult, 'method' | 'attempts'> & {
    retryAfter?: string;
    contentType?: string;
    body?: string;
    truncated?: boolean;
  }
> {
  const redirects: string[] = [];
  let current = start;

  for (;;) {
    let response: RawResponse;
    try {
      response = await requestOnce(current, method, opts);
    } catch (err) {
      const { code, message } = classifyError(err);
      return { finalUrl: current.toString(), redirects, error: code, errorMessage: message };
    }

    const isRedirect = response.status >= 300 && response.status < 400 && response.location;
    if (!isRedirect) {
      return {
        status: response.status,
        finalUrl: current.toString(),
        redirects,
        retryAfter: response.retryAfter,
        contentType: response.contentType,
        body: response.body,
        truncated: response.truncated,
      };
    }

    let next: URL;
    try {
      next = new URL(response.location!, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('bad scheme');
    } catch {
      return {
        status: response.status,
        finalUrl: current.toString(),
        redirects,
        error: 'INVALID_URL',
        errorMessage: 'Redirected to an invalid or non-http(s) URL',
      };
    }

    if (redirects.length >= opts.maxRedirects) {
      return {
        status: response.status,
        finalUrl: current.toString(),
        redirects,
        error: 'TOO_MANY_REDIRECTS',
        errorMessage: `More than ${opts.maxRedirects} redirects`,
      };
    }
    redirects.push(next.toString());
    current = next;
  }
}
