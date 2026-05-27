export declare class TTLCache<K, V> {
    private store;
    private readonly ttlMs;
    private readonly maxSize;
    constructor(ttlSeconds: number, maxSize?: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    invalidate(key: K): void;
    clear(): void;
    get size(): number;
}
export declare const videoInfoCache: TTLCache<string, unknown>;
export declare const searchCache: TTLCache<string, unknown>;
export declare const channelInfoCache: TTLCache<string, unknown>;
export declare const channelVideosCache: TTLCache<string, unknown>;
export declare const playlistCache: TTLCache<string, unknown>;
export declare const trendingCache: TTLCache<string, unknown>;
//# sourceMappingURL=cache.d.ts.map