import { z } from 'zod';
import { getTranscript, cleanTranscriptText } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';
import { getConfig } from '../lib/user-config.js';
import { DEFAULTS } from '../config.js';
export const transcriptInputSchema = {
    videoId: z.string().describe('YouTube video ID'),
    language: z.string().optional()
        .describe(`Language code (default: "${DEFAULTS.transcript.defaultLanguage}")`),
    format: z.enum(['text', 'segments', 'both']).optional()
        .describe('Response format — "text" (fullText only, smallest response), "segments" (timestamped array only), or "both" (default). Use "text" to cut response size roughly in half.'),
    startTime: z.number().optional()
        .describe('Only return segments at or after this time (seconds). Pairs well with chapter timestamps from youtube_get_video_info.'),
    endTime: z.number().optional()
        .describe('Only return segments before this time (seconds).'),
    maxSegments: z.number().optional()
        .describe(`Max segments to return (capped at ${DEFAULTS.transcript.maxSegments}). Good for previewing long videos without blowing up context.`),
};
export async function handleTranscript(args) {
    // Fetch transcript and video info concurrently
    const [result, videoInfoResult] = await Promise.allSettled([
        getTranscript(args.videoId, args.language),
        getVideoInfo(args.videoId),
    ]);
    if (result.status === 'rejected' || (result.status === 'fulfilled' && 'error' in result.value)) {
        const errValue = result.status === 'rejected'
            ? { error: String(result.reason) }
            : result.value;
        return {
            content: [{ type: 'text', text: JSON.stringify(errValue) }],
            isError: true,
        };
    }
    const transcriptData = result.value;
    if ('error' in transcriptData) {
        return {
            content: [{ type: 'text', text: JSON.stringify(transcriptData) }],
            isError: true,
        };
    }
    let segments = transcriptData.segments;
    if (args.startTime !== undefined) {
        segments = segments.filter(s => s.offset >= args.startTime);
    }
    if (args.endTime !== undefined) {
        segments = segments.filter(s => s.offset < args.endTime);
    }
    if (args.maxSegments !== undefined) {
        const config = getConfig();
        const cap = Math.min(args.maxSegments, config.transcript.maxSegments);
        segments = segments.slice(0, cap);
    }
    const config = getConfig();
    const joinedText = segments.map(s => s.text).join(' ');
    const fullText = config.transcript.cleanupEnabled
        ? cleanTranscriptText(joinedText)
        : joinedText;
    let title = '';
    let channel = '';
    if (videoInfoResult.status === 'fulfilled') {
        title = videoInfoResult.value.title;
        channel = videoInfoResult.value.channel;
    }
    const format = args.format ?? 'both';
    const response = {
        videoId: args.videoId,
        title,
        channel,
        language: transcriptData.language,
        segmentCount: segments.length,
    };
    if (format === 'segments' || format === 'both') {
        response.segments = segments;
    }
    if (format === 'text' || format === 'both') {
        response.fullText = fullText;
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(response, null, 2),
            }],
    };
}
//# sourceMappingURL=transcript.js.map