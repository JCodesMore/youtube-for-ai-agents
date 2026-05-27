interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlSeconds: number, maxSize = 200) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.store.size >= this.maxSize) {
      // Evict the oldest entry
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// Shared caches — video info: 5 min, search: 2 min, channel: 10 min
export const videoInfoCache = new TTLCache<string, unknown>(300);
export const searchCache = new TTLCache<string, unknown>(120);
export const channelInfoCache = new TTLCache<string, unknown>(600);
export const channelVideosCache = new TTLCache<string, unknown>(120);
export const playlistCache = new TTLCache<string, unknown>(300);
export const trendingCache = new TTLCache<string, unknown>(600);
