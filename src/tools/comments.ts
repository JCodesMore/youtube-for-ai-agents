import { z } from 'zod';
import { getInstance, withTimeout } from '../lib/innertube.js';
import { innertubeBreaker } from '../lib/circuit-breaker.js';
import { bus } from '../lib/event-bus.js';

export const commentsInputSchema = {
  videoId: z.string().describe('YouTube video ID'),
  limit: z.number().min(1).max(100).optional()
    .describe('Max comments to return (default: 20, max: 100)'),
  sortBy: z.enum(['top', 'new']).optional()
    .describe('Sort order — "top" (default, highest engagement) or "new" (most recent)'),
};

interface CommentsArgs {
  videoId: string;
  limit?: number;
  sortBy?: 'top' | 'new';
}

export interface CommentItem {
  id: string;
  author: string;
  authorId: string;
  text: string;
  likes: string;
  published: string;
  isPinned: boolean;
  isCreatorReply: boolean;
  replyCount: string;
}

export async function handleComments(args: CommentsArgs) {
  const limit = args.limit ?? 20;

  const { yt } = await getInstance();
  const comments: CommentItem[] = [];

  try {
    const commentsHeader: any = await innertubeBreaker.call(() =>
      withTimeout(
        (yt as any).getComments(args.videoId, args.sortBy === 'new' ? 'NEWEST_FIRST' : 'TOP_COMMENTS'),
        20_000,
        `getComments(${args.videoId})`
      )
    );
    const rawComments: any[] = commentsHeader?.contents?.contents ?? [];

    for (const item of rawComments) {
      if (comments.length >= limit) break;
      const c = item?.comment ?? item;
      if (!c) continue;

      const text = c.content?.text ?? c.content_text?.text ?? c.snippet?.text_display?.text ?? '';
      if (!text) continue;

      comments.push({
        id: c.id ?? '',
        author: c.author?.name ?? c.author_text?.text ?? '',
        authorId: c.author?.id ?? '',
        text,
        likes: c.like_count?.text ?? c.vote_count?.text ?? '0',
        published: c.published?.text ?? c.time_text?.text ?? '',
        isPinned: c.is_pinned ?? false,
        isCreatorReply: c.author_is_uploader ?? false,
        replyCount: c.reply_count?.text ?? c.num_replies?.text ?? '0',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bus.emit('tool:error', { tool: 'youtube_get_comments', videoId: args.videoId, error: message });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: `Could not fetch comments for video ${args.videoId}: ${message}`,
          note: 'Comments may be disabled, restricted, or temporarily unavailable.',
        }),
      }],
      isError: true,
    };
  }

  if (comments.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          videoId: args.videoId,
          message: 'No comments found. Comments may be disabled for this video.',
          comments: [],
        }),
      }],
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        videoId: args.videoId,
        sortBy: args.sortBy ?? 'top',
        count: comments.length,
        comments,
      }, null, 2),
    }],
  };
}
