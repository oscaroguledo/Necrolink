/**
 * Run at most `max` async tasks at once (replaces p-limit, whose v5
 * `#async_hooks` subpath import does not bundle under Next.js 14).
 *
 * There is deliberately no clearQueue(): dropped tasks would leave their
 * promises pending forever. To cancel, have queued tasks check an AbortSignal
 * when they start and return early.
 */
export interface Limiter {
  <T>(task: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
}

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };

  const limit = (<T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    })) as Limiter;

  Object.defineProperty(limit, 'activeCount', { get: () => active });
  Object.defineProperty(limit, 'pendingCount', { get: () => queue.length });
  return limit;
}
