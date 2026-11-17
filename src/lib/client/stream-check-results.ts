/**
 * Client-side SSE stream reader for POST /api/check (spec 02, task 5.3).
 * Uses fetch() + getReader() (NOT EventSource which cannot POST with a body).
 */

import type { CheckResult } from '@/types/link';
import type { CheckSummary } from '@/lib/checker/check-handler';
import type { LinkToCheck } from '@/lib/checker/check-link';

export type { CheckSummary, LinkToCheck };

export interface StreamOptions {
  /** Abort signal for cancelling the stream. */
  signal?: AbortSignal;
  /** Called for each parsed CheckResult. */
  onResult: (result: CheckResult) => void;
  /** Called when the 'event: done' summary event arrives. */
  onDone?: (summary: CheckSummary) => void;
  /** Called on fetch failures, non-200 responses, or parse errors. */
  onError: (error: Error) => void;
}

export class StreamError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

/**
 * Stream check results from POST /api/check. Sends links as JSON body,
 * parses SSE responses, and yields each CheckResult as it arrives.
 *
 * @param endpoint - URL of the /api/check endpoint
 * @param links - Array of links to check
 * @param options - Stream options (signal, callbacks)
 *
 * @example
 * ```typescript
 * await streamCheckResults('/api/check', links, {
 *   onResult: (result) => console.log('Checked:', result.url),
 *   onDone: (summary) => console.log('Complete:', summary),
 *   onError: (error) => console.error('Failed:', error),
 *   signal: abortController.signal,
 * });
 * ```
 */
export async function streamCheckResults(
  endpoint: string,
  links: LinkToCheck[],
  options: StreamOptions
): Promise<void> {
  const { signal, onResult, onDone, onError } = options;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ links }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || (error as Error & { code?: string }).code === 'ABORT_ERR')) {
      onError(new StreamError('Stream cancelled', 'CANCELLED'));
    } else {
      onError(new StreamError('Network error while connecting to the API', 'NETWORK_ERROR'));
    }
    return;
  }

  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}`;
    try {
      const body = await response.json();
      if (body.error?.message) {
        errorMessage = body.error.message;
      }
    } catch {
      // Response wasn't JSON, use status code
    }
    onError(new StreamError(errorMessage, response.status === 400 ? 'INVALID_REQUEST' : 'SERVER_ERROR'));
    return;
  }

  if (!response.body) {
    onError(new StreamError('Response has no body', 'NO_BODY'));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Kept across chunks: "event: done" and its "data:" line may arrive separately
  let currentEvent: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (currentEvent === 'done') {
                if (onDone) {
                  onDone(parsed as CheckSummary);
                }
              } else {
                onResult(parsed as CheckResult);
              }
            } catch (error) {
              onError(
                new StreamError(
                  `Invalid JSON in SSE stream: ${error instanceof Error ? error.message : 'parse error'}`,
                  'PARSE_ERROR'
                )
              );
              return;
            }
          }
          currentEvent = undefined;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || (error as Error & { code?: string }).code === 'ABORT_ERR')) {
      onError(new StreamError('Stream cancelled', 'CANCELLED'));
    } else {
      onError(
        new StreamError(
          `Stream read error: ${error instanceof Error ? error.message : 'unknown error'}`,
          'READ_ERROR'
        )
      );
    }
    return;
  } finally {
    try {
      reader.cancel();
    } catch {
      // Already cancelled or closed
    }
  }
}
