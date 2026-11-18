/**
 * Tools of the Necrolink Wayback MCP server. Each handler validates its input,
 * calls the same code the web app uses (so Internet Archive pacing, caching,
 * the circuit breaker and SSRF protection all apply), and returns a short
 * summary plus the full result as JSON.
 */

import { z } from 'zod';
import type { ArchivedSnapshot, CheckResult } from '@/types/link';
import {
  findArchivedSnapshot,
  listSnapshots,
  MAX_LISTED_SNAPSHOTS,
  WaybackError,
  type ListSnapshotsOptions,
  type SnapshotListing,
} from '@/lib/wayback/cdx';
import { checkLink } from '@/lib/checker/check-link';

export interface ToolDeps {
  findSnapshot: (url: string, date?: Date) => Promise<ArchivedSnapshot | null>;
  listSnapshots: (url: string, options: ListSnapshotsOptions) => Promise<SnapshotListing[]>;
  checkLink: (url: string, citationDate?: Date) => Promise<CheckResult>;
}

export const defaultDeps: ToolDeps = {
  findSnapshot: (url, date) => findArchivedSnapshot(url, date),
  listSnapshots: (url, options) => listSnapshots(url, options),
  checkLink: (url, citationDate) => checkLink({ id: 'mcp', url, ...(citationDate ? { citationDate } : {}) }),
};

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const httpUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be an http(s) URL');

/** YYYY-MM-DD, a real calendar date (UTC). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => parseIsoDate(value) !== undefined, 'Not a real date');

export function parseIsoDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : undefined;
}

const toDate = (value: string | undefined) => (value === undefined ? undefined : parseIsoDate(value));

export const schemas = {
  find_snapshot: {
    url: httpUrl.describe('The original (possibly dead) URL'),
    date: isoDate
      .optional()
      .describe('When the link was cited (YYYY-MM-DD). The capture closest to it is chosen; newest if omitted.'),
  },
  list_snapshots: {
    url: httpUrl.describe('The URL to list captures of'),
    from: isoDate.optional().describe('Earliest capture date (YYYY-MM-DD)'),
    to: isoDate.optional().describe('Latest capture date (YYYY-MM-DD)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LISTED_SNAPSHOTS)
      .optional()
      .describe(`How many of the most recent captures to return (default 20, max ${MAX_LISTED_SNAPSHOTS})`),
  },
  check_link: {
    url: httpUrl.describe('The link to check'),
    cited: isoDate.optional().describe('When the link was cited (YYYY-MM-DD), used to pick the archived copy'),
  },
};

const ok = (summary: string, data: unknown): ToolResult => ({
  content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
});

const failure = (error: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text:
        error instanceof WaybackError
          ? `${error.message}. Try again in a few minutes.`
          : 'Something went wrong while contacting the Internet Archive.',
    },
  ],
  isError: true,
});

export async function findSnapshotTool(
  args: { url: string; date?: string },
  deps: ToolDeps = defaultDeps
): Promise<ToolResult> {
  try {
    const snapshot = await deps.findSnapshot(args.url, toDate(args.date));
    if (!snapshot) {
      return ok('🪦 Lost soul: the Internet Archive has no successful capture of this URL.', { found: false });
    }
    const day = snapshot.timestamp.slice(0, 10);
    return ok(`👻 Resurrectable: archived copy from ${day}: ${snapshot.url}`, { found: true, snapshot });
  } catch (error) {
    return failure(error);
  }
}

export async function listSnapshotsTool(
  args: { url: string; from?: string; to?: string; limit?: number },
  deps: ToolDeps = defaultDeps
): Promise<ToolResult> {
  const from = toDate(args.from);
  const to = toDate(args.to);
  if (from && to && from > to) {
    return { content: [{ type: 'text', text: '"from" must be on or before "to".' }], isError: true };
  }
  try {
    const snapshots = await deps.listSnapshots(args.url, {
      ...(from ? { from } : {}),
      // Include the whole "to" day
      ...(to ? { to: new Date(to.getTime() + 86_399_000) } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });
    if (snapshots.length === 0) {
      return ok('No captures found for this URL in that range.', { snapshots });
    }
    const first = snapshots[0]!.timestamp.slice(0, 10);
    const last = snapshots[snapshots.length - 1]!.timestamp.slice(0, 10);
    return ok(`${snapshots.length} distinct captures, ${first} to ${last} (oldest first).`, { snapshots });
  } catch (error) {
    return failure(error);
  }
}

const STATUS_LABEL: Record<CheckResult['status'], string> = {
  living: '🕯️ Living',
  ghost: '👻 Ghost (dead, archived copy available)',
  lost: '🪦 Lost soul (dead, never archived)',
  zombie: '🧟 Zombie (loads, but the content changed)',
  error: '⚠️ Could not check',
};

export async function checkLinkTool(
  args: { url: string; cited?: string },
  deps: ToolDeps = defaultDeps
): Promise<ToolResult> {
  // checkLink never throws: failures come back as status "error"
  const result = await deps.checkLink(args.url, toDate(args.cited));
  const { linkId: _unused, ...rest } = result;
  void _unused;
  const isError = result.status === 'error';
  return { ...ok(`${STATUS_LABEL[result.status]}: ${result.reason}`, rest), ...(isError ? { isError } : {}) };
}
