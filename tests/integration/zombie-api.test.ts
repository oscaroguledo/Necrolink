/**
 * Integration tests for POST /api/zombie endpoint (spec 03, phase 5).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/zombie/route';
import { NextRequest } from 'next/server';
import type { ArchivedSnapshot } from '@/types/link';

// Mock the detector module
vi.mock('@/lib/zombie/detector', async () => {
  const actual = await vi.importActual('@/lib/zombie/detector');
  return {
    ...actual,
    detectZombie: vi.fn(),
  };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { detectZombie } from '@/lib/zombie/detector';

describe('POST /api/zombie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: unknown): NextRequest => {
    return new NextRequest('http://localhost:3000/api/zombie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  test('valid request returns zombie report', async () => {
    const mockReport = {
      isZombie: true,
      confidence: 0.9,
      method: 'heuristic' as const,
      reason: 'The page now shows parking page content',
      changes: {
        titleChanged: true,
        contentDrift: 'complete' as const,
        possibleTakeover: true,
      },
    };

    vi.mocked(detectZombie).mockResolvedValue(mockReport);

    const body = {
      linkId: 'link_1',
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      suspicionReason: 'Suspicious content detected',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockReport);
    expect(detectZombie).toHaveBeenCalledWith(
      {
        url: body.url,
        finalUrl: body.finalUrl,
        suspicionReason: body.suspicionReason,
      },
      expect.objectContaining({
        aiBudget: { remaining: 1 },
      })
    );
  });

  test('valid request with archived snapshot', async () => {
    const archived: ArchivedSnapshot = {
      url: 'https://web.archive.org/web/20230101120000/https://example.com',
      timestamp: '2023-01-01T12:00:00Z',
      originalTimestamp: '20230101120000',
      statusCode: '200',
      mimeType: 'text/html',
    };

    const mockReport = {
      isZombie: false,
      confidence: 0.85,
      method: 'heuristic' as const,
      reason: 'Most of the original text is still on the page',
      changes: {
        titleChanged: false,
        contentDrift: 'minor' as const,
        possibleTakeover: false,
      },
    };

    vi.mocked(detectZombie).mockResolvedValue(mockReport);

    const body = {
      linkId: 'link_2',
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      archived,
      suspicionReason: 'Page has been updated',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(detectZombie).toHaveBeenCalledWith(
      expect.objectContaining({
        archived,
      }),
      expect.anything()
    );
  });

  test('missing linkId returns 400', async () => {
    const body = {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      suspicionReason: 'Suspicious',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
    expect(data.error.message).toContain('linkId');
  });

  test('invalid url returns 400', async () => {
    const body = {
      linkId: 'link_1',
      url: 'not-a-url',
      finalUrl: 'https://example.com',
      suspicionReason: 'Suspicious',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.message).toContain('url');
  });

  test('invalid finalUrl returns 400', async () => {
    const body = {
      linkId: 'link_1',
      url: 'https://example.com',
      finalUrl: 'invalid',
      suspicionReason: 'Suspicious',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.message).toContain('finalUrl');
  });

  test('missing suspicionReason returns 400', async () => {
    const body = {
      linkId: 'link_1',
      url: 'https://example.com',
      finalUrl: 'https://example.com',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.message).toContain('suspicionReason');
  });

  test('invalid JSON returns 400', async () => {
    const request = new NextRequest('http://localhost:3000/api/zombie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('detectZombie error returns 500', async () => {
    vi.mocked(detectZombie).mockRejectedValue(new Error('Network failure'));

    const body = {
      linkId: 'link_1',
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      suspicionReason: 'Suspicious',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  test('parked page returns zombie with high confidence', async () => {
    const mockReport = {
      isZombie: true,
      confidence: 0.95,
      method: 'heuristic' as const,
      reason: 'The page now shows parking page content',
      changes: {
        titleChanged: true,
        contentDrift: 'complete' as const,
        possibleTakeover: true,
      },
    };

    vi.mocked(detectZombie).mockResolvedValue(mockReport);

    const body = {
      linkId: 'link_parked',
      url: 'https://parked-domain.com',
      finalUrl: 'https://parked-domain.com',
      suspicionReason: 'Domain appears to be parked',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isZombie).toBe(true);
    expect(data.data.confidence).toBeGreaterThan(0.9);
    expect(data.data.changes.possibleTakeover).toBe(true);
  });

  test('living link returns not zombie', async () => {
    const mockReport = {
      isZombie: false,
      confidence: 0.9,
      method: 'heuristic' as const,
      reason: 'Most of the original text is still on the page',
      changes: {
        titleChanged: false,
        contentDrift: 'none' as const,
        possibleTakeover: false,
      },
    };

    vi.mocked(detectZombie).mockResolvedValue(mockReport);

    const body = {
      linkId: 'link_living',
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      suspicionReason: 'Page has been redesigned',
    };

    const request = createRequest(body);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isZombie).toBe(false);
    expect(data.data.changes.contentDrift).toBe('none');
  });
});
