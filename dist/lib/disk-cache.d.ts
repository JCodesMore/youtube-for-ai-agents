/**
 * Disk-persistent cache for transcripts.
 * Survives MCP server restarts. Stored as JSON files alongside the TTL.
 *
 * Cache dir resolution order:
 *   1. $CLAUDE_PLUGIN_DATA/cache/transcripts/
 *   2. <project-root>/.cache/transcripts/
 */
export declare class DiskCache<V> {
    private readonly ttlMs;
    constructor(ttlHours: number);
    private path;
    get(key: string): V | undefined;
    set(key: string, value: V): void;
    invalidate(key: string): void;
}
export declare const transcriptDiskCache: DiskCache<unknown>;
//# sourceMappingURL=disk-cache.d.ts.map