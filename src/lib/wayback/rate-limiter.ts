/**
 * Spaces out requests to at most one per `intervalMs` (default 200 ms = 5/s,
 * the Wayback Machine limit in spec 02).
 *
 * Each caller reserves its slot synchronously before awaiting, so concurrent
 * callers queue up correctly. (The spec's sketch read `lastRequestTime`, then
 * awaited, then wrote it, so 10 concurrent callers all saw the same old value
 * and fired at once.)
 */
export class RateLimiter {
  private nextSlot = 0;

  constructor(
    private readonly intervalMs = 200,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  /** Resolves when the caller may make its request. */
  async waitForSlot(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const delay = slot - now;
    if (delay > 0) await this.sleep(delay);
  }
}

/** Anything that hands out request slots. */
export interface SlotLimiter {
  waitForSlot(): Promise<void>;
}

/**
 * Token bucket (as GCRA): allows a burst of `burst` requests, then
 * `perMinute` requests per minute. Like RateLimiter, each caller reserves its
 * slot synchronously, so concurrent callers can never exceed the limit.
 */
export class TokenBucketLimiter implements SlotLimiter {
  private readonly intervalMs: number;
  private readonly toleranceMs: number;
  /** Theoretical arrival time of the next request. */
  private tat = 0;

  constructor(
    perMinute: number,
    burst = perMinute,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    if (!(perMinute > 0) || !(burst >= 1)) throw new RangeError('perMinute must be > 0 and burst >= 1');
    this.intervalMs = 60_000 / perMinute;
    this.toleranceMs = (burst - 1) * this.intervalMs;
  }

  async waitForSlot(): Promise<void> {
    const now = this.now();
    const tat = Math.max(this.tat, now);
    const allowedAt = tat - this.toleranceMs;
    this.tat = tat + this.intervalMs;
    if (allowedAt > now) await this.sleep(allowedAt - now);
  }
}
