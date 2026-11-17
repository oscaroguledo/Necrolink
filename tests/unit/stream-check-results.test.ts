/**
 * Tests for client-side SSE stream reader (spec 02, task 5.3).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { streamCheckResults, StreamError } from '@/lib/client/stream-check-results';
import type { CheckResult } from '@/types/link';
import type { CheckSummary } from '@/lib/checker/check-handler';

describe('streamCheckResults', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('streams results and done event', async () => {
    const results: CheckResult[] = [];
    let summary: CheckSummary | undefined;
    const errors: Error[] = [];

    const sseData = [
      'data: {"linkId":"link_1","url":"https://example.com","status":"living","reason":"OK","checkedAt":"2024-01-01T00:00:00Z"}\n\n',
      'data: {"linkId":"link_2","url":"https://dead.com","status":"ghost","reason":"404","checkedAt":"2024-01-01T00:00:01Z"}\n\n',
      'event: done\ndata: {"total":2,"living":1,"ghost":1,"lost":0,"zombie":0,"error":0,"ms":123}\n\n',
    ].join('');

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseData) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: (result) => results.push(result),
      onDone: (sum) => {
        summary = sum;
      },
      onError: (error) => errors.push(error),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ linkId: 'link_1', status: 'living' });
    expect(results[1]).toMatchObject({ linkId: 'link_2', status: 'ghost' });
    expect(summary).toMatchObject({ total: 2, living: 1, ghost: 1, ms: 123 });
    expect(errors).toHaveLength(0);
  });

  test('handles multi-chunk SSE stream', async () => {
    const results: CheckResult[] = [];

    const chunk1 = 'data: {"linkId":"link_1","url":"https://example.com","status":"living","reason":"OK","checkedAt":"2024-01-01T00:00:00Z"}\n';
    const chunk2 = '\ndata: {"linkId":"link_2","url":"https://dead.com","status":"ghost","reason":"404","checkedAt":"2024-01-01T00:00:01Z"}\n\n';

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunk1) })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunk2) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: (result) => results.push(result),
      onError: () => {},
    });

    expect(results).toHaveLength(2);
  });

  test('handles network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    const errors: Error[] = [];
    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: () => {},
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StreamError);
    expect((errors[0] as StreamError).code).toBe('NETWORK_ERROR');
  });

  test('handles non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { code: 'INVALID_REQUEST', message: 'Bad request' } }),
    });

    const errors: Error[] = [];
    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: () => {},
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StreamError);
    expect((errors[0] as StreamError).code).toBe('INVALID_REQUEST');
    expect(errors[0].message).toContain('Bad request');
  });

  test('handles 500 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal error' } }),
    });

    const errors: Error[] = [];
    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: () => {},
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect((errors[0] as StreamError).code).toBe('SERVER_ERROR');
  });

  test('handles invalid JSON in stream', async () => {
    const sseData = 'data: {invalid json}\n\n';

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseData) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    const errors: Error[] = [];
    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: () => {},
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect((errors[0] as StreamError).code).toBe('PARSE_ERROR');
  });

  test('handles abort signal', async () => {
    const abortController = new AbortController();
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        abortController.abort();
        return Promise.reject(abortError);
      }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    const errors: Error[] = [];
    await streamCheckResults(
      '/api/check',
      [{ id: 'link_1', url: 'https://example.com' }],
      {
        signal: abortController.signal,
        onResult: () => {},
        onError: (error) => errors.push(error),
      }
    );

    expect(errors).toHaveLength(1);
    expect((errors[0] as StreamError).code).toBe('CANCELLED');
  });

  test('handles abort during fetch', async () => {
    const abortController = new AbortController();
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn().mockImplementation(() => {
      abortController.abort();
      return Promise.reject(abortError);
    });

    const errors: Error[] = [];
    await streamCheckResults(
      '/api/check',
      [{ id: 'link_1', url: 'https://example.com' }],
      {
        signal: abortController.signal,
        onResult: () => {},
        onError: (error) => errors.push(error),
      }
    );

    expect(errors).toHaveLength(1);
    expect((errors[0] as StreamError).code).toBe('CANCELLED');
  });

  test('handles response with no body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const errors: Error[] = [];
    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: () => {},
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect((errors[0] as StreamError).code).toBe('NO_BODY');
  });

  test('sends correct request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      },
    });
    global.fetch = mockFetch;

    const links = [
      { id: 'link_1', url: 'https://example.com' },
      { id: 'link_2', url: 'https://example.org', citationDate: new Date('2023-01-01') },
    ];

    await streamCheckResults('/api/check', links, {
      onResult: () => {},
      onError: () => {},
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/check',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ links }),
      })
    );
  });

  test('calls onDone only when event is "done"', async () => {
    const results: CheckResult[] = [];
    let doneCount = 0;

    const sseData = [
      'data: {"linkId":"link_1","url":"https://example.com","status":"living","reason":"OK","checkedAt":"2024-01-01T00:00:00Z"}\n\n',
      'event: done\ndata: {"total":1,"living":1,"ghost":0,"lost":0,"zombie":0,"error":0,"ms":100}\n\n',
    ].join('');

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseData) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    await streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
      onResult: (result) => results.push(result),
      onDone: () => {
        doneCount++;
      },
      onError: () => {},
    });

    expect(results).toHaveLength(1);
    expect(doneCount).toBe(1);
  });

  test('works without onDone callback', async () => {
    const results: CheckResult[] = [];
    const sseData = [
      'data: {"linkId":"link_1","url":"https://example.com","status":"living","reason":"OK","checkedAt":"2024-01-01T00:00:00Z"}\n\n',
      'event: done\ndata: {"total":1,"living":1,"ghost":0,"lost":0,"zombie":0,"error":0,"ms":100}\n\n',
    ].join('');

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseData) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    await expect(
      streamCheckResults('/api/check', [{ id: 'link_1', url: 'https://example.com' }], {
        onResult: (result) => results.push(result),
        onError: () => {},
      })
    ).resolves.toBeUndefined();

    expect(results).toHaveLength(1);
  });
});
