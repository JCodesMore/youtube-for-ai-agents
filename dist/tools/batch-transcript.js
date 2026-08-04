import { z } from 'zod';
import { getTranscript, cleanTranscriptText } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';
export const batchTranscriptInputSchema = {
    videoIds: z.array(z.string()).min(2).max(10)
        .describe('List of 2–10 YouTube video IDs to fetch transcripts for in parallel'),
    language: z.string().optional()
        .describe('Language code for all transcripts (default: "en")'),
    format: z.enum(['text', 'segments', 'both']).optional()
        .describe('Response format for each transcript — "text" (fullText only, smallest), "segments" (timestamped), or "both" (default)'),
    maxSegments: z.number().min(1).max(5000).optional()
        .describe('Max segments per video (default: unlimited within config cap). Use to control context size.'),
};
export async function handleBatchTranscript(args) {
    const format = args.format ?? 'both';
    // Fetch all transcripts + video info concurrently
    const tasks = args.videoIds.map(async (videoId) => {
        const [transcriptResult, videoInfoResult] = await Promise.allSettled([
            getTranscript(videoId, args.language),
            getVideoInfo(videoId),
        ]);
        const title = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value.title : '';
        const channel = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value.channel : '';
        if (transcriptResult.status === 'rejected') {
            return { videoId, title, channel, language: args.language ?? 'en', segmentCount: 0, error: String(transcriptResult.reason) };
        }
        const transcriptData = transcriptResult.value;
        if ('error' in transcriptData) {
            return { videoId, title, channel, language: args.language ?? 'en', segmentCount: 0, error: transcriptData.error };
        }
        let segments = transcriptData.segments;
        if (args.maxSegments !== undefined) {
            segments = segments.slice(0, args.maxSegments);
        }
        const joinedText = segments.map(s => s.text).join(' ');
        const fullText = cleanTranscriptText(joinedText);
        const result = {
            videoId,
            title,
            channel,
            language: transcriptData.language,
            segmentCount: segments.length,
        };
        if (format === 'segments' || format === 'both')
            result.segments = segments;
        if (format === 'text' || format === 'both')
            result.fullText = fullText;
        return result;
    });
    const results = await Promise.all(tasks);
    const succeeded = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    summary: { total: args.videoIds.length, succeeded, failed },
                    results,
                }, null, 2),
            }],
    };
}
//# sourceMappingURL=batch-transcript.js.map