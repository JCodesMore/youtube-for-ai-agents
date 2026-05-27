import { z } from 'zod';
import { getTrending } from '../lib/innertube.js';

export const trendingInputSchema = {
  category: z.enum(['now', 'music', 'gaming', 'movies']).optional()
    .describe('Trending category — "now" (all trending, default), "music", "gaming", or "movies"'),
  limit: z.number().min(1).max(50).optional()
    .describe('Number of videos to return (default: 20, max: 50)'),
};

interface TrendingArgs {
  category?: 'now' | 'music' | 'gaming' | 'movies';
  limit?: number;
}

export async function handleTrending(args: TrendingArgs) {
  const category = args.category ?? 'now';
  const limit = args.limit ?? 20;

  const result = await getTrending(category, limit);

  if (result.videos.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'No trending videos found. YouTube may have restricted trending access in your region or for anonymous sessions. Try authenticating with youtube_auth or searching for popular videos instead.',
          suggestion: 'Use youtube_search with sortBy: "views" as an alternative.',
        }),
      }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        category: result.category,
        mode: result.mode,
        count: result.videos.length,
        videos: result.videos,
      }, null, 2),
    }],
  };
}
