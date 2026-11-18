/**
 * Necrolink Wayback MCP server (stdio).
 *
 *   npm run mcp:wayback
 *
 * Tools: find_snapshot, list_snapshots, check_link. See mcp-wayback/README.md.
 */

import './stdio-logging'; // first: keeps stdout for the protocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { checkLinkTool, findSnapshotTool, listSnapshotsTool, schemas } from './tools';

const server = new McpServer({ name: 'necrolink-wayback', version: '0.1.0' });

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

server.registerTool(
  'find_snapshot',
  {
    title: 'Find archived copy',
    description:
      'Find the Internet Archive (Wayback Machine) copy of a URL closest to the date it was cited. ' +
      'Use it to resurrect a dead link. Returns the archive URL, or says the URL was never archived (a lost soul).',
    inputSchema: schemas.find_snapshot,
    annotations: readOnly,
  },
  (args) => findSnapshotTool(args)
);

server.registerTool(
  'list_snapshots',
  {
    title: 'List archived versions',
    description:
      'List the most recent distinct Wayback Machine captures of a URL (identical consecutive captures are merged), ' +
      'optionally within a date range. Use it to see when a page changed or disappeared.',
    inputSchema: schemas.list_snapshots,
    annotations: readOnly,
  },
  (args) => listSnapshotsTool(args)
);

server.registerTool(
  'check_link',
  {
    title: 'Check a link',
    description:
      "Check a link the way Necrolink does: living, ghost (dead but archived), lost soul (dead, never archived), " +
      'or zombie (still loads, but the archived and current content differ). Private and internal addresses are refused.',
    inputSchema: schemas.check_link,
    annotations: readOnly,
  },
  (args) => checkLinkTool(args)
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error('necrolink-wayback MCP server running on stdio');
}

main().catch((error: unknown) => {
  console.error('necrolink-wayback failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
