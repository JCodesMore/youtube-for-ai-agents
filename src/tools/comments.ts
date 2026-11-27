import { z } from 'zod';
import { getComments } from '../lib/innertube.js';
import { parseVideoId } from '../lib/ids.js';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 300;

export const commentsInputSchema = {
  videoId: z.string().describe('YouTube video URL or 11-character video ID'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
    .describe(`How many top-level comments to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
  sort: z.enum(['top', 'newest']).optional().describe('"top" (default, most liked first) or "newest"'),
};

export async function handleComments(args: { videoId: string; limit?: number; sort?: 'top' | 'newest' }) {
  const videoId = parseVideoId(args.videoId);
  const result = await getComments(videoId, args.limit ?? DEFAULT_LIMIT, args.sort ?? 'top');
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ videoId, sort: args.sort ?? 'top', ...result }) }],
  };
}
