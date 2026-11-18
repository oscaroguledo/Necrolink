// @vitest-environment node
/**
 * Tests for the SSRF-safe URL status fetcher, against a real local server.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { safeFetch, fetchPage, isPublicAddress, USER_AGENT, type SafeFetchOptions } from '@/lib/checker/safe-fetch';

let server: http.Server;
let base: string;
let port: number;
const hits = new Map<string, number>();
let lastUserAgent = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = req.url ?? '/';
    hits.set(path, (hits.get(path) ?? 0) + 1);
    lastUserAgent = req.headers['user-agent'] ?? '';
    const n = hits.get(path)!;

    const routes: Record<string, () => void> = {
      '/ok': () => res.writeHead(200).end('ok'),
      '/page': () =>
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<title>Hi</title><p>Café</p>'),
      '/latin1': () =>
        res
          .writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' })
          .end(Buffer.from([0x3c, 0x70, 0x3e, 0x43, 0x61, 0x66, 0xe9])), // <p>Café in Latin-1
      '/to-page': () => res.writeHead(301, { location: '/page' }).end(),
      '/pdf': () => res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4'),
      '/big-html': () => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<p>' + 'x'.repeat(3 * 1024 * 1024) + '</p>');
      },
      '/missing': () => res.writeHead(404).end(),
      '/gone': () => res.writeHead(410).end(),
      '/no-head': () => res.writeHead(req.method === 'HEAD' ? 405 : 200).end(),
      '/r1': () => res.writeHead(301, { location: '/r2' }).end(),
      '/r2': () => res.writeHead(302, { location: '/ok' }).end(),
      '/loop': () => res.writeHead(302, { location: '/loop' }).end(),
      '/to-metadata': () =>
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end(),
      '/to-internal-name': () =>
        res.writeHead(302, { location: `http://internal.test:${port}/ok` }).end(),
      '/to-ftp': () => res.writeHead(302, { location: 'ftp://files.example.com/' }).end(),
      '/flaky': () => res.writeHead(n <= 2 ? 503 : 200).end(),
      '/always-503': () => res.writeHead(503).end(),
      '/rate-limited': () =>
        n === 1 ? res.writeHead(429, { 'retry-after': '2' }).end() : res.writeHead(200).end(),
      '/hang': () => {
        /* never respond */
      },
      '/huge': () => {
        // HEAD → 405 forces the GET path, which streams up to 1 GB
        if (req.method === 'HEAD') return void res.writeHead(405).end();
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        const chunk = Buffer.alloc(64 * 1024);
        let sent = 0;
        const pump = () => {
          while (!res.destroyed && sent < 16_384 && res.write(chunk)) sent++;
        };
        res.on('drain', pump);
        pump();
      },
    };
    (routes[path] ?? (() => res.writeHead(500).end()))();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const sleeps: number[] = [];
/** Allow only the local test server; everything else uses the real policy. */
const localOnly: SafeFetchOptions = {
  isAllowedAddress: (ip) => ip === '127.0.0.1' || isPublicAddress(ip),
  resolve: async (host) => {
    if (host === 'local.test') return ['127.0.0.1'];
    if (host === 'internal.test') return ['10.0.0.5'];
    if (host === 'mixed.test') return ['127.0.0.1', '192.168.1.10'];
    const err = Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    throw err;
  },
  sleep: async (ms) => {
    sleeps.push(ms);
  },
  timeoutMs: 2000,
};

describe('isPublicAddress', () => {
  test.each([
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['2606:4700:4700::1111', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['224.0.0.1', false],
    ['::1', false],
    ['::', false],
    ['::ffff:7f00:1', false],
    ['::ffff:8.8.8.8', false],
    ['fd00::1', false],
    ['fe80::1', false],
    ['not-an-ip', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe('safeFetch', () => {
  describe('statuses and methods', () => {
    test('200 via HEAD, one request, Necrolink User-Agent', async () => {
      const result = await safeFetch(`${base}/ok`, localOnly);
      expect(result).toMatchObject({ status: 200, method: 'HEAD', attempts: 1, redirects: [] });
      expect(lastUserAgent).toBe(USER_AGENT);
    });

    test('falls back to GET when HEAD is not allowed', async () => {
      const result = await safeFetch(`${base}/no-head`, localOnly);
      expect(result).toMatchObject({ status: 200, method: 'GET' });
    });

    test('404 is confirmed with GET', async () => {
      const result = await safeFetch(`${base}/missing`, localOnly);
      expect(result).toMatchObject({ status: 404, method: 'GET', attempts: 2 });
    });

    test('never downloads the response body', async () => {
      const start = Date.now();
      const result = await safeFetch(`${base}/huge`, localOnly);
      expect(result.status).toBe(200);
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });

  describe('redirects', () => {
    test('follows a redirect chain and reports it', async () => {
      const result = await safeFetch(`${base}/r1`, localOnly);
      expect(result.status).toBe(200);
      expect(result.finalUrl).toBe(`${base}/ok`);
      expect(result.redirects).toEqual([`${base}/r2`, `${base}/ok`]);
    });

    test('stops after 3 redirects', async () => {
      const result = await safeFetch(`${base}/loop`, localOnly);
      expect(result.error).toBe('TOO_MANY_REDIRECTS');
      expect(result.redirects).toHaveLength(3);
    });

    test('refuses redirects to non-http schemes', async () => {
      const result = await safeFetch(`${base}/to-ftp`, localOnly);
      expect(result.error).toBe('INVALID_URL');
    });
  });

  describe('SSRF protection', () => {
    test.each([
      ['loopback', 'http://127.0.0.1/'],
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
      ['private network', 'http://192.168.1.1/admin'],
      ['IPv6 loopback', 'http://[::1]/'],
      ['IPv4-mapped IPv6', 'http://[::ffff:127.0.0.1]/'],
      ['localhost by name', 'http://localhost/'],
    ])('blocks %s by default (%s)', async (_label, url) => {
      const result = await safeFetch(url, { maxRetries: 0, timeoutMs: 2000 });
      expect(result.error).toBe('BLOCKED_ADDRESS');
    });

    test('blocks a redirect from an allowed host to the metadata endpoint', async () => {
      const result = await safeFetch(`${base}/to-metadata`, localOnly);
      expect(result.error).toBe('BLOCKED_ADDRESS');
      expect(result.redirects).toEqual(['http://169.254.169.254/latest/meta-data/']);
    });

    test('blocks a redirect to a hostname that resolves to a private address', async () => {
      const result = await safeFetch(`${base}/to-internal-name`, localOnly);
      expect(result.error).toBe('BLOCKED_ADDRESS');
    });

    test('blocks a hostname with mixed public/private DNS records', async () => {
      const result = await safeFetch(`http://mixed.test:${port}/ok`, localOnly);
      expect(result.error).toBe('BLOCKED_ADDRESS');
    });

    test('allows a hostname that resolves only to allowed addresses', async () => {
      const result = await safeFetch(`http://local.test:${port}/ok`, localOnly);
      expect(result.status).toBe(200);
    });

    test('does not retry or fall back to GET after a block', async () => {
      const result = await safeFetch('http://10.0.0.1/', { maxRetries: 3 });
      expect(result.attempts).toBe(1);
    });
  });

  describe('errors', () => {
    test('rejects non-http URLs', async () => {
      const result = await safeFetch('ftp://example.com/file', localOnly);
      expect(result).toMatchObject({ error: 'INVALID_URL', attempts: 0 });
    });

    test('a DNS timeout (EAI_AGAIN) is temporary and retried, not "domain gone"', async () => {
      sleeps.length = 0;
      const result = await safeFetch('http://flaky-dns.test/', {
        ...localOnly,
        maxRetries: 1,
        resolve: async () => {
          throw Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
        },
      });
      expect(result.error).toBe('DNS_TEMPORARY');
      expect(sleeps.length).toBeGreaterThan(0);
    });

    test('DNS failure is reported once, with no retry or GET fallback', async () => {
      const result = await safeFetch('http://does-not-exist.test/', localOnly);
      expect(result).toMatchObject({ error: 'DNS_NOT_FOUND', attempts: 1 });
    });

    test('connection refused', async () => {
      const closed = http.createServer();
      await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
      const closedPort = (closed.address() as AddressInfo).port;
      await new Promise<void>((r) => closed.close(() => r()));

      const result = await safeFetch(`http://127.0.0.1:${closedPort}/`, localOnly);
      expect(result.error).toBe('CONNECTION_REFUSED');
    });

    test('times out a server that never responds', async () => {
      const result = await safeFetch(`${base}/hang`, { ...localOnly, timeoutMs: 100, maxRetries: 0 });
      expect(result.error).toBe('TIMEOUT');
    });
  });

  describe('retries', () => {
    test('retries 503 with exponential backoff, then succeeds', async () => {
      sleeps.length = 0;
      const result = await safeFetch(`${base}/flaky`, localOnly);
      expect(result).toMatchObject({ status: 200, attempts: 3 });
      expect(sleeps).toEqual([1000, 2000]);
    });

    test('gives up after 3 retries (1s, 2s, 4s)', async () => {
      sleeps.length = 0;
      const result = await safeFetch(`${base}/always-503`, { ...localOnly, maxRetries: 3 });
      expect(result.status).toBe(503);
      // HEAD: 3 retries, then GET confirmation: 3 retries
      expect(sleeps).toEqual([1000, 2000, 4000, 1000, 2000, 4000]);
    });

    test('honors Retry-After on 429', async () => {
      sleeps.length = 0;
      const result = await safeFetch(`${base}/rate-limited`, localOnly);
      expect(result.status).toBe(200);
      expect(sleeps).toEqual([2000]);
    });
  });

  describe('fetchPage', () => {
    test('downloads HTML and decodes UTF-8', async () => {
      const page = await fetchPage(`${base}/page`, localOnly);
      expect(page).toMatchObject({ status: 200, method: 'GET', truncated: false });
      expect(page.html).toBe('<title>Hi</title><p>Café</p>');
    });

    test('decodes the declared charset', async () => {
      const page = await fetchPage(`${base}/latin1`, localOnly);
      expect(page.html).toBe('<p>Café');
    });

    test('follows redirects to the page', async () => {
      const page = await fetchPage(`${base}/to-page`, localOnly);
      expect(page.finalUrl).toBe(`${base}/page`);
      expect(page.html).toContain('Café');
    });

    test('does not download non-HTML bodies', async () => {
      const page = await fetchPage(`${base}/pdf`, localOnly);
      expect(page.status).toBe(200);
      expect(page.contentType).toBe('application/pdf');
      expect(page.html).toBeUndefined();
    });

    test('stops at the size cap', async () => {
      const page = await fetchPage(`${base}/big-html`, { ...localOnly, maxBytes: 1000 });
      expect(page.truncated).toBe(true);
      expect(page.html).toHaveLength(1000);
    });

    test('no body for error responses', async () => {
      const page = await fetchPage(`${base}/missing`, localOnly);
      expect(page.status).toBe(404);
      expect(page.html).toBeUndefined();
    });

    test('keeps SSRF protection', async () => {
      const page = await fetchPage('http://169.254.169.254/latest/meta-data/');
      expect(page.error).toBe('BLOCKED_ADDRESS');
    });
  });
});
