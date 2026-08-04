/**
 * youtube_cache_admin — visibility and control over the cache layer.
 *
 * KafCa (Ca side): gives agents and power users runtime insight into what's
 * cached, how fresh it is, and the ability to warm or invalidate entries
 * without restarting the MCP server.
 *
 * ARM:
 *   Adoption   — "why is my result stale?" is answered immediately with stats
 *   Retention  — power users warm cache before batch operations → instant results
 *   Monetize   — cache efficiency metrics feed into SLA dashboards
 *
 * RRSS — Secure: no sensitive data returned (no transcripts, no cookie values).
 */
import { z } from 'zod';
export declare const cacheAdminInputSchema: {
    action: z.ZodEnum<["stats", "invalidate", "warm", "events"]>;
    videoIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    eventTopic: z.ZodOptional<z.ZodString>;
    eventLimit: z.ZodOptional<z.ZodNumber>;
};
interface CacheAdminArgs {
    action: 'stats' | 'invalidate' | 'warm' | 'events';
    videoIds?: string[];
    eventTopic?: string;
    eventLimit?: number;
}
export declare function handleCacheAdmin(args: CacheAdminArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    isError?: undefined;
} | {
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
}>;
export {};
//# sourceMappingURL=cache-admin.d.ts.map