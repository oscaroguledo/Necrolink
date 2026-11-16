/**
 * In-memory TTL cache with a size cap (least recently used entries evicted).
 * Caches misses too: store `null` for "looked it up, nothing there".
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  hits = 0;
  misses = 0;

  constructor(
    private readonly maxEntries = 5000,
    private readonly now: () => number = Date.now
  ) {}

  /** The cached value, or `undefined` if absent or expired. */
  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= this.now()) {
      if (entry) this.entries.delete(key);
      this.misses++;
      return undefined;
    }
    // Move to the end: most recently used
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export const CACHE_TTL_MS = {
  cdx: 24 * 60 * 60 * 1000, // snapshots don't change
  health: 60 * 60 * 1000, // pages may come back
} as const;
