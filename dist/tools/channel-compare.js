import { z } from 'zod';
import { getChannelInfo, getChannelVideos } from '../lib/innertube.js';
import { bus } from '../lib/event-bus.js';
export const channelCompareInputSchema = {
    channels: z.array(z.string()).min(2).max(5)
        .describe('Array of 2–5 channels (@handle, full URL, or channel ID) to compare side-by-side'),
    recentVideoCount: z.number().min(0).max(50).optional()
        .describe('Recent videos per channel to analyse for cadence/engagement (default: 10, max: 50)'),
    includeRecentTitles: z.boolean().optional()
        .describe('Include the recent video titles in the response (default: false — keeps response compact)'),
};
function parseCount(text) {
    if (!text)
        return 0;
    const clean = text.replace(/[,\s]/g, '').toLowerCase();
    const match = clean.match(/^([\d.]+)([kmb])?/);
    if (!match)
        return 0;
    const num = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === 'k')
        return num * 1_000;
    if (suffix === 'm')
        return num * 1_000_000;
    if (suffix === 'b')
        return num * 1_000_000_000;
    return num;
}
function parseRelativeDate(text) {
    if (!text)
        return null;
    const now = Date.now();
    const match = text.toLowerCase().match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
    if (!match)
        return null;
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const ms = {
        second: 1_000,
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
        year: 31_536_000_000,
    };
    return new Date(now - n * (ms[unit] ?? 0));
}
function computeCadenceDays(videos) {
    if (videos.length < 2)
        return null;
    const dates = videos
        .map((v) => parseRelativeDate(v.published))
        .filter((d) => d !== null)
        .sort((a, b) => b.getTime() - a.getTime());
    if (dates.length < 2)
        return null;
    const spanMs = dates[0].getTime() - dates[dates.length - 1].getTime();
    if (spanMs <= 0)
        return null;
    return +(spanMs / 86_400_000 / (dates.length - 1)).toFixed(1);
}
async function fetchOne(channel, recentVideoCount, includeRecentTitles) {
    try {
        const [info, videosResult] = await Promise.all([
            getChannelInfo(channel),
            recentVideoCount > 0
                ? getChannelVideos(channel, recentVideoCount, 'newest')
                : Promise.resolve({ channelId: '', channelName: '', videoCount: 0, videos: [] }),
        ]);
        const videos = videosResult.videos;
        const totalRecentViews = videos.reduce((sum, v) => sum + parseCount(v.views), 0);
        const avg = videos.length > 0 ? Math.round(totalRecentViews / videos.length) : 0;
        const comparison = {
            channelId: info.channelId,
            name: info.name,
            handle: info.handle,
            subscriberCount: info.subscriberCount,
            totalVideoCount: info.videoCount,
            totalViewCount: info.viewCount,
            joinedDate: info.joinedDate,
            country: info.country,
            recentVideos: videos.length,
            avgViewsPerRecentVideo: avg,
            totalRecentViews,
            uploadCadenceDays: computeCadenceDays(videos),
        };
        if (includeRecentTitles) {
            comparison.recentTitles = videos.map((v) => v.title);
        }
        return comparison;
    }
    catch (err) {
        return {
            channelId: '',
            name: channel,
            handle: '',
            subscriberCount: '',
            totalVideoCount: '',
            totalViewCount: '',
            joinedDate: '',
            country: '',
            recentVideos: 0,
            avgViewsPerRecentVideo: 0,
            totalRecentViews: 0,
            uploadCadenceDays: null,
            error: err?.message ?? String(err),
        };
    }
}
function rankBy(channels, selector, desc = true) {
    return [...channels]
        .filter((c) => !c.error)
        .sort((a, b) => (desc ? selector(b) - selector(a) : selector(a) - selector(b)))
        .map((c) => c.name || c.channelId);
}
export async function handleChannelCompare(args) {
    const recentVideoCount = args.recentVideoCount ?? 10;
    const includeRecentTitles = args.includeRecentTitles ?? false;
    bus.emit('tool:call', { tool: 'channel_compare', channels: args.channels.length });
    const results = await Promise.all(args.channels.map((c) => fetchOne(c, recentVideoCount, includeRecentTitles)));
    const partialFailures = results
        .filter((r) => r.error)
        .map((r) => `${r.name}: ${r.error}`);
    const response = {
        channels: results,
        ranking: {
            bySubscribers: rankBy(results, (c) => parseCount(c.subscriberCount)),
            byAvgViewsPerVideo: rankBy(results, (c) => c.avgViewsPerRecentVideo),
            byTotalViews: rankBy(results, (c) => parseCount(c.totalViewCount)),
            byUploadCadence: rankBy(results, (c) => c.uploadCadenceDays ?? Infinity, false),
        },
        partialFailures,
    };
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(response, null, 2),
            }],
    };
}
//# sourceMappingURL=channel-compare.js.map