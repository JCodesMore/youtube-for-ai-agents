import { z } from 'zod';
import { getComments, resolveVideoId } from '../lib/innertube.js';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 300;
const MAX_REPLIES = 20;

export const commentsInputSchema = {
  videoId: z.string().describe('YouTube video URL or 11-character video ID'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
    .describe(`How many top-level comments to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
  sort: z.enum(['top', 'newest']).optional().describe('"top" (default, most liked first) or "newest"'),
  replies: z.number().int().min(0).max(MAX_REPLIES).optional()
    .describe(`Also read up to this many replies under each comment that has some (default 0, max ${MAX_REPLIES}). Corrections and creator answers often sit in the replies.`),
};

interface CommentsArgs {
  videoId: string;
  limit?: number;
  sort?: 'top' | 'newest';
  replies?: number;
}

export async function handleComments(args: CommentsArgs) {
  const videoId = await resolveVideoId(args.videoId);
  const result = await getComments(videoId, args.limit ?? DEFAULT_LIMIT, args.sort ?? 'top', args.replies ?? 0);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ videoId, sort: args.sort ?? 'top', ...result }) }],
  };
}
