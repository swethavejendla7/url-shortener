interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Minimal in-memory TTL + LRU cache. Single-instance only — does not share
 * state across replicas or survive a restart. Documented limitation, see
 * ARCHITECTURE.md; a production deployment behind >1 instance would need a
 * shared cache (e.g. Redis) instead.
 */
export class TtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency for LRU eviction.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }
}
