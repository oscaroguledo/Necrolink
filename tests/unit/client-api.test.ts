// @vitest-environment node
/**
 * Tests for the browser-side API helpers.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { checkAllLinks, exportDocument, CHECK_BATCH_SIZE, type ClientLink, type ClientResult, type ExtractedDocument } from '@/lib/client/api';
import { StreamError, type StreamOptions, type LinkToCheck } from '@/lib/client/stream-check-results';
import { extractLinksFromMarkdown } from '@/lib/extractors/markdown';
import { DEMO_DOCUMENT } from '@/lib/client/demo';

const link = (i: number, citationDate?: string): ClientLink => ({
  id: `link_${i}`,
  url: `https://site${i}.example.com/`,
  originalUrl: `https://site${i}.example.com/`,
  text: `Link ${i}`,
  position: { offset: i },
  context: '',
  ...(citationDate ? { citationDate } : {}),
});

type Stream = (endpoint: string, links: LinkToCheck[], options: StreamOptions) => Promise<void>;

describe('checkAllLinks', () => {
  test('sends at most 500 links per request, in order, and passes every result on', async () => {
    const batches: number[] = [];
    const stream = vi.fn<Stream>(async (_endpoint, links, options) => {
      batches.push(links.length);
      for (const l of links) options.onResult({ linkId: l.id, status: 'living' } as never);
    });
    const seen: string[] = [];
    await checkAllLinks(Array.from({ length: 1200 }, (_, i) => link(i)), (r) => seen.push(r.linkId), undefined, stream);

    expect(batches).toEqual([CHECK_BATCH_SIZE, CHECK_BATCH_SIZE, 200]);
    expect(seen).toHaveLength(1200);
  });

  test('forwards citation dates', async () => {
    const stream = vi.fn<Stream>(async () => undefined);
    await checkAllLinks([link(1, '2023-06-15T00:00:00.000Z')], () => undefined, undefined, stream);
    expect(JSON.parse(JSON.stringify(stream.mock.calls[0]![1]))).toEqual([
      { id: 'link_1', url: 'https://site1.example.com/', citationDate: '2023-06-15T00:00:00.000Z' },
    ]);
  });

  test('stops quietly when cancelled, between batches too', async () => {
    const controller = new AbortController();
    const stream = vi.fn<Stream>(async (_e, _l, options) => {
      controller.abort();
      options.onError(new StreamError('Stream cancelled', 'CANCELLED'));
    });
    await expect(checkAllLinks(Array.from({ length: 1200 }, (_, i) => link(i)), () => undefined, controller.signal, stream)).resolves.toBeUndefined();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  test('surfaces real errors with their message', async () => {
    const stream = vi.fn<Stream>(async (_e, _l, options) => {
      options.onError(new StreamError('At most 500 links per request', 'INVALID_REQUEST'));
    });
    await expect(checkAllLinks([link(1)], () => undefined, undefined, stream)).rejects.toThrow('At most 500 links per request');
  });
});

describe('exportDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const doc: ExtractedDocument = {
    documentId: 'd',
    filename: 'paper.md',
    type: 'markdown',
    links: [link(1), link(2), link(3)],
    stats: { total: 3, unique: 3, withDates: 0 },
  };
  const results: ClientResult[] = [
    { linkId: 'link_1', url: 'u1', status: 'ghost', reason: '404', archived: { url: 'https://web.archive.org/web/2019/u1', timestamp: '2019-01-01T00:00:00.000Z', originalTimestamp: '2019', statusCode: '200', mimeType: 'text/html' }, checkedAt: '' },
    { linkId: 'link_2', url: 'u2', status: 'lost', reason: 'gone', checkedAt: '' },
    { linkId: 'link_3', url: 'u3', status: 'living', reason: 'ok', checkedAt: '' },
  ];

  test('only sends fixes for the links the user selected; reads the download name', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('fixed', { headers: { 'content-disposition': 'attachment; filename="paper.necrolink.md"', 'content-type': 'text/markdown' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = await exportDocument(doc, '# doc', results, new Set(['link_2']));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

    expect(body.results.map((r: { linkId: string }) => r.linkId)).toEqual(['link_2', 'link_3']);
    expect(body.content).toBe('# doc');
    expect(file).toMatchObject({ filename: 'paper.necrolink.md', text: 'fixed' });
  });
});

describe('demo document', () => {
  test('has the seven links the demo promises', async () => {
    const links = await extractLinksFromMarkdown(DEMO_DOCUMENT);
    expect(links).toHaveLength(7);
    expect(links.filter((l) => l.citationDate)).toHaveLength(5);
  });
});
