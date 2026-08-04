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
import { videoInfoCache, searchCache, channelInfoCache, channelVideosCache, playlistCache, trendingCache, } from '../lib/cache.js';
import { innertubeBreaker, transcriptBreaker } from '../lib/circuit-breaker.js';
import { bus } from '../lib/event-bus.js';
import { getVideoInfo } from '../lib/innertube.js';
const NAMED_CACHES = {
    video: videoInfoCache,
    search: searchCache,
    channel: channelInfoCache,
    channelVideos: channelVideosCache,
    playlist: playlistCache,
    trending: trendingCache,
};
export const cacheAdminInputSchema = {
    action: z.enum(['stats', 'invalidate', 'warm', 'events']).describe('"stats" — show sizes and bus event counts. ' +
        '"invalidate" — remove specific videoIds from the video cache. ' +
        '"warm" — pre-fetch video info for a list of IDs so future calls are instant. ' +
        '"events" — show the last N events from the in-process event bus.'),
    videoIds: z.array(z.string()).optional()
        .describe('For "invalidate" or "warm": list of YouTube video IDs to target.'),
    eventTopic: z.string().optional()
        .describe('For "events": filter to a specific topic (e.g. "cache:hit", "circuit:open"). Omit for all topics.'),
    eventLimit: z.number().min(1).max(200).optional()
        .describe('For "events": number of recent events to return (default: 50).'),
};
export async function handleCacheAdmin(args) {
    switch (args.action) {
        // ── Stats ───────────────────────────────────────────────────────────────
        case 'stats': {
            const cacheStats = Object.entries(NAMED_CACHES).map(([name, cache]) => ({
                cache: name,
                entries: cache.size,
            }));
            const circuitStats = {
                innertube: { state: innertubeBreaker.getState(), failures: innertubeBreaker.getFailures() },
                transcript: { state: transcriptBreaker.getState(), failures: transcriptBreaker.getFailures() },
            };
            const busStats = bus.stats();
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            action: 'stats',
                            caches: cacheStats,
                            totalCachedEntries: cacheStats.reduce((n, c) => n + c.entries, 0),
                            circuitBreakers: circuitStats,
                            busEventCounts: busStats,
                            tip: 'Use action:"warm" with videoIds to pre-fill the video cache before a batch operation.',
                        }, null, 2),
                    }],
            };
        }
        // ── Invalidate ──────────────────────────────────────────────────────────
        case 'invalidate': {
            if (!args.videoIds?.length) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'Provide videoIds to invalidate.' }) }],
                    isError: true,
                };
            }
            const removed = [];
            for (const id of args.videoIds) {
                videoInfoCache.invalidate(id);
                removed.push(id);
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({ action: 'invalidate', removedFromVideoCache: removed, note: 'Next call for these IDs will fetch fresh data from YouTube.' }),
                    }],
            };
        }
        // ── Warm ────────────────────────────────────────────────────────────────
        case 'warm': {
            if (!args.videoIds?.length) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'Provide videoIds to warm.' }) }],
                    isError: true,
                };
            }
            const results = await Promise.allSettled(args.videoIds.map(id => getVideoInfo(id)));
            const warmed = results
                .map((r, i) => ({ id: args.videoIds[i], ok: r.status === 'fulfilled' }));
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            action: 'warm',
                            warmed,
                            succeeded: warmed.filter(w => w.ok).length,
                            failed: warmed.filter(w => !w.ok).length,
                            note: 'Warmed IDs will be served from in-memory cache for the next 5 minutes.',
                        }, null, 2),
                    }],
            };
        }
        // ── Events ──────────────────────────────────────────────────────────────
        case 'events': {
            const limit = args.eventLimit ?? 50;
            const topic = args.eventTopic;
            const events = bus.getHistory(topic, limit);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            action: 'events',
                            filter: args.eventTopic ?? 'all',
                            count: events.length,
                            events: events.map(e => ({ id: e.id, topic: e.topic, ts: new Date(e.ts).toISOString(), payload: e.payload })),
                        }, null, 2),
                    }],
            };
        }
    }
}
//# sourceMappingURL=cache-admin.js.map