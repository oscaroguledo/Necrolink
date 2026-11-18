/**
 * stdout carries the MCP protocol, so every log line goes to stderr instead.
 * Imported first by server.ts, before any module that might log.
 */
for (const method of ['log', 'info', 'debug'] as const) {
  console[method] = (...args: unknown[]) => console.error(...args);
}

export {};
