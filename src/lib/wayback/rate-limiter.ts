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
