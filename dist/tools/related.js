import { z } from 'zod';
import { getInstance } from '../lib/innertube.js';
export const relatedInputSchema = {
    videoId: z.string().describe('YouTube video ID to get recommendations for'),
    limit: z.number().min(1).max(30).optional()
        .describe('Max related videos to return (default: 15, max: 30)'),
};
export async function handleRelated(args) {
    const limit = args.limit ?? 15;
    const { yt } = await getInstance();
    const related = [];
    try {
        const info = await yt.getInfo(args.videoId);
        // youtubei.js exposes related as watch_next_feed (SecondaryResults)
        const feed = info?.watch_next_feed ?? info?.secondary_results ?? [];
        for (const item of feed) {
            if (related.length >= limit)
                break;
            // Skip ads, shelves, and non-video items
            if (item?.type !== 'CompactVideo' && item?.type !== 'Video')
                continue;
            const id = item.video_id ?? item.id ?? '';
            if (!id)
                continue;
            related.push({
                id,
                title: item.title?.text ?? item.title?.toString?.() ?? '',
                channel: item.author?.name ?? item.short_byline_text?.text ?? '',
                channelId: item.author?.id ?? '',
                views: item.view_count?.text ?? item.short_view_count?.text ?? '',
                published: item.published?.text ?? '',
                duration: item.duration?.text ?? '',
                thumbnail: item.best_thumbnail?.url ?? item.thumbnails?.[0]?.url ?? '',
            });
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: `Could not fetch related videos for ${args.videoId}: ${message}`,
                    }),
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    sourceVideoId: args.videoId,
                    count: related.length,
                    related,
                }, null, 2),
            }],
    };
}
//# sourceMappingURL=related.js.map