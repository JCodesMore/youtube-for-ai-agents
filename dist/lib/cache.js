export class TTLCache {
    store = new Map();
    ttlMs;
    maxSize;
    constructor(ttlSeconds, maxSize = 200) {
        this.ttlMs = ttlSeconds * 1000;
        this.maxSize = maxSize;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value) {
        if (this.store.size >= this.maxSize) {
            // Evict the oldest entry
            const first = this.store.keys().next().value;
            if (first !== undefined)
                this.store.delete(first);
        }
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    }
    invalidate(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    get size() {
        return this.store.size;
    }
}
// Shared caches — video info: 5 min, search: 2 min, channel: 10 min
export const videoInfoCache = new TTLCache(300);
export const searchCache = new TTLCache(120);
export const channelInfoCache = new TTLCache(600);
export const channelVideosCache = new TTLCache(120);
export const playlistCache = new TTLCache(300);
export const trendingCache = new TTLCache(600);
//# sourceMappingURL=cache.js.map