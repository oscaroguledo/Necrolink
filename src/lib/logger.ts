/**
 * Minimal structured logger: one JSON line per event, easy to grep locally and
 * to query in CloudWatch / Vercel logs.
 *
 * Privacy: never log document contents, filenames or full URLs from uploads.
 * Users upload their own papers; log sizes, counts, types and error codes only.
 */

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: Level, event: string, fields: Fields = {}): void {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;

  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};

/** Error details safe to log: name and message, plus the top of the stack. */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.split('\n').slice(0, 4).join(' | '),
    };
  }
  return { errorMessage: String(error) };
}
