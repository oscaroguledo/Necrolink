// @vitest-environment node
/**
 * Tools of the Necrolink Wayback MCP server (mcp-wayback/tools.ts).
 */

import { describe, test, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  checkLinkTool,
  findSnapshotTool,
  listSnapshotsTool,
  parseIsoDate,
  schemas,
  type ToolDeps,
} from '../../mcp-wayback/tools';
import { WaybackError } from '@/lib/wayback/cdx';
import type { ArchivedSnapshot, CheckResult } from '@/types/link';

const URL_ = 'https://example.com/paper';
const SNAPSHOT: ArchivedSnapshot = {
  url: `https://web.archive.org/web/20141230121427/${URL_}`,
  timestamp: '2014-12-30T12:14:27.000Z',
  originalTimestamp: '20141230121427',
  statusCode: '200',
  mimeType: 'text/html',
};

function fakeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    findSnapshot: vi.fn(async () => SNAPSHOT),
    listSnapshots: vi.fn(async () => []),
    checkLink: vi.fn(async (url: string) => ({
      linkId: 'mcp',
      url,
      status: 'living' as const,
      reason: 'The page loads',
      checkedAt: new Date(0),
    })),
    ...overrides,
  };
}

const text = (result: { content: { text: string }[] }) => result.content[0]!.text;

describe('input schemas', () => {
  const valid = (name: keyof typeof schemas, args: unknown) => z.object(schemas[name]).strict().safeParse(args).success;

  test.each(['https://example.com/a', 'http://geocities.com/SiliconValley/'])('accepts %s', (url) => {
    expect(valid('find_snapshot', { url })).toBe(true);
  });

  test.each(['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/', 'not a url', ''])(
    'rejects %s',
    (url) => {
      expect(valid('find_snapshot', { url })).toBe(false);
    }
  );

  test('rejects overlong URLs', () => {
    expect(valid('check_link', { url: `https://example.com/${'a'.repeat(2048)}` })).toBe(false);
  });

  test.each(['2014-12-30', '2000-02-29'])('accepts date %s', (date) => {
    expect(valid('find_snapshot', { url: URL_, date })).toBe(true);
  });

  test.each(['2014-02-30', '2023-02-29', '2014-13-01', '30/12/2014', '2014-12-30T00:00:00Z'])(
    'rejects date %s',
    (date) => {
      expect(valid('find_snapshot', { url: URL_, date })).toBe(false);
    }
  );

  test('list limit must be 1..100', () => {
    expect(valid('list_snapshots', { url: URL_, limit: 100 })).toBe(true);
    expect(valid('list_snapshots', { url: URL_, limit: 0 })).toBe(false);
    expect(valid('list_snapshots', { url: URL_, limit: 101 })).toBe(false);
    expect(valid('list_snapshots', { url: URL_, limit: 2.5 })).toBe(false);
  });

  test('unknown arguments are rejected', () => {
    expect(valid('check_link', { url: URL_, extra: 1 })).toBe(false);
  });
});

describe('parseIsoDate', () => {
  test('is a UTC midnight date', () => {
    expect(parseIsoDate('2014-12-30')?.toISOString()).toBe('2014-12-30T00:00:00.000Z');
  });
  test('impossible dates are undefined', () => {
    expect(parseIsoDate('2014-02-30')).toBeUndefined();
  });
});

describe('find_snapshot', () => {
  test('returns the archive URL and passes the citation date', async () => {
    const deps = fakeDeps();
    const result = await findSnapshotTool({ url: URL_, date: '2014-12-30' }, deps);

    expect(deps.findSnapshot).toHaveBeenCalledWith(URL_, new Date('2014-12-30T00:00:00Z'));
    expect(result.isError).toBeUndefined();
    expect(text(result)).toMatch(/^👻 Resurrectable: archived copy from 2014-12-30/);
    expect(text(result)).toContain(SNAPSHOT.url);
  });

  test('without a date, asks for the newest copy', async () => {
    const deps = fakeDeps();
    await findSnapshotTool({ url: URL_ }, deps);
    expect(deps.findSnapshot).toHaveBeenCalledWith(URL_, undefined);
  });

  test('never archived is a lost soul, not an error', async () => {
    const result = await findSnapshotTool({ url: URL_ }, fakeDeps({ findSnapshot: async () => null }));
    expect(result.isError).toBeUndefined();
    expect(text(result)).toMatch(/Lost soul/);
  });

  test('Archive throttling is reported as a retryable error', async () => {
    const result = await findSnapshotTool(
      { url: URL_ },
      fakeDeps({
        findSnapshot: async () => {
          throw new WaybackError('The Internet Archive is limiting requests right now');
        },
      })
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('The Internet Archive is limiting requests right now. Try again in a few minutes.');
  });

  test('unexpected errors do not leak details', async () => {
    const result = await findSnapshotTool(
      { url: URL_ },
      fakeDeps({
        findSnapshot: async () => {
          throw new Error('secret internal detail');
        },
      })
    );
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain('secret');
  });
});

describe('list_snapshots', () => {
  test('includes the whole "to" day and passes the limit', async () => {
    const deps = fakeDeps();
    await listSnapshotsTool({ url: URL_, from: '2005-01-01', to: '2005-12-31', limit: 5 }, deps);
    expect(deps.listSnapshots).toHaveBeenCalledWith(URL_, {
      from: new Date('2005-01-01T00:00:00Z'),
      to: new Date('2005-12-31T23:59:59Z'),
      limit: 5,
    });
  });

  test('summarises the range', async () => {
    const listing = [
      { timestamp: '2001-05-01T00:00:00.000Z', archiveUrl: 'a', statusCode: '200', mimeType: 'text/html' },
      { timestamp: '2009-10-26T00:00:00.000Z', archiveUrl: 'b', statusCode: '200', mimeType: 'text/html' },
    ];
    const result = await listSnapshotsTool({ url: URL_ }, fakeDeps({ listSnapshots: async () => listing }));
    expect(text(result)).toMatch(/^2 distinct captures, 2001-05-01 to 2009-10-26/);
  });

  test('empty range', async () => {
    expect(text(await listSnapshotsTool({ url: URL_ }, fakeDeps()))).toMatch(/^No captures/);
  });

  test('"from" after "to" is rejected without contacting the Archive', async () => {
    const deps = fakeDeps();
    const result = await listSnapshotsTool({ url: URL_, from: '2010-01-01', to: '2009-01-01' }, deps);
    expect(result.isError).toBe(true);
    expect(deps.listSnapshots).not.toHaveBeenCalled();
  });
});

describe('check_link', () => {
  test.each([
    ['living', /^🕯️ Living/],
    ['ghost', /^👻 Ghost/],
    ['lost', /^🪦 Lost soul/],
    ['zombie', /^🧟 Zombie/],
  ] as const)('%s', async (status, label) => {
    const deps = fakeDeps({
      checkLink: async (url): Promise<CheckResult> => ({ linkId: 'mcp', url, status, reason: 'why', checkedAt: new Date(0) }),
    });
    const result = await checkLinkTool({ url: URL_, cited: '2005-06-15' }, deps);
    expect(text(result)).toMatch(label);
    expect(text(result)).not.toContain('linkId');
    expect(result.isError).toBeUndefined();
  });

  test('passes the citation date', async () => {
    const deps = fakeDeps();
    await checkLinkTool({ url: URL_, cited: '2005-06-15' }, deps);
    expect(deps.checkLink).toHaveBeenCalledWith(URL_, new Date('2005-06-15T00:00:00Z'));
  });

  test('a link that could not be checked is an error result', async () => {
    const deps = fakeDeps({
      checkLink: async (url): Promise<CheckResult> => ({
        linkId: 'mcp',
        url,
        status: 'error',
        reason: 'This link points to a private or internal address, so it was not checked',
        error: 'BLOCKED_ADDRESS',
        checkedAt: new Date(0),
      }),
    });
    const result = await checkLinkTool({ url: 'http://169.254.169.254/' }, deps);
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/private or internal/);
  });
});
