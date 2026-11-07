/**
 * In-memory cache of pending/settled promises with a fixed time-to-live.
 * Concurrent loads of the same key share one request; failed loads are not kept.
 */
export class TtlCache {
  private readonly entries = new Map<string, { value: Promise<unknown>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The live entry for `key`, if any. */
  peek<T>(key: string): Promise<T> | undefined {
    const entry = this.entries.get(key);
    return entry && entry.expiresAt > this.now() ? (entry.value as Promise<T>) : undefined;
  }

  set<T>(key: string, value: Promise<T>): Promise<T> {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    value.catch(() => {
      // Forget the failure, unless a newer value was stored under the key meanwhile.
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.peek<T>(key) ?? this.set(key, load());
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Drops expired entries. */
  prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
