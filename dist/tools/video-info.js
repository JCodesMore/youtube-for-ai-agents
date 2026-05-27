import { z } from 'zod';
import { getVideoInfo } from '../lib/innertube.js';
export const videoInfoInputSchema = {
    videoId: z.string().describe('YouTube video ID'),
    detail: z.enum(['brief', 'standard', 'full']).optional()
        .describe('Detail level — "brief" (key metadata only), "standard" (most fields, truncated description, no chapters), or "full" (everything). Default: standard'),
};
const BRIEF_FIELDS = [
    'id', 'title', 'channel', 'channelId', 'views', 'likes',
    'duration', 'published', 'relativeDate', 'category',
];
const DESC_TRUNCATE_LENGTH = 200;
function shapeResponse(info, detail) {
    if (detail === 'full')
        return info;
    if (detail === 'brief') {
        const result = {};
        for (const key of BRIEF_FIELDS) {
            result[key] = info[key];
        }
        return result;
    }
    const { chapters, tags, thumbnail, ...rest } = info;
    return {
        ...rest,
        description: info.description.length > DESC_TRUNCATE_LENGTH
            ? info.description.slice(0, DESC_TRUNCATE_LENGTH) + '…'
            : info.description,
        chapterCount: chapters.length,
    };
}
export async function handleVideoInfo(args) {
    const info = await getVideoInfo(args.videoId);
    const detail = args.detail ?? 'standard';
    const shaped = shapeResponse(info, detail);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(shaped, null, 2),
            }],
    };
}
//# sourceMappingURL=video-info.js.map