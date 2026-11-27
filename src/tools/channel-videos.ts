import { z } from 'zod';
import { getChannelVideos } from '../lib/innertube.js';
import type { ChannelTab } from '../lib/innertube.js';
import { DEFAULTS } from '../config.js';
import { getConfig } from '../lib/user-config.js';

/** Far past any channel's useful depth, so a typo can't start a crawl of thousands of pages. */
const MAX_OFFSET = 5000;

export const channelVideosInputSchema = {
  channelUrl: z.string().describe('@handle, full YouTube URL, or channel ID'),
  tab: z.enum(['videos', 'shorts', 'live']).optional()
    .describe('Which tab to list: "videos" (default, long-form uploads), "shorts", or "live" (current and past live streams)'),
  limit: z.number().min(1).max(DEFAULTS.channel.maxVideoLimit).optional()
    .describe(`Max videos to return (default: ${DEFAULTS.channel.defaultVideoLimit}, max: ${DEFAULTS.channel.maxVideoLimit})`),
  offset: z.number().int().min(0).max(MAX_OFFSET).optional()
    .describe('Skip this many videos first, to page past a previous call (use when the result says hasMore)'),
  sort: z.enum(['newest', 'popular', 'oldest']).optional()
    .describe(`Sort order (default: ${DEFAULTS.channel.defaultSort})`),
};

interface ChannelVideosArgs {
  channelUrl: string;
  tab?: ChannelTab;
  limit?: number;
  offset?: number;
  sort?: string;
}

export async function handleChannelVideos(args: ChannelVideosArgs) {
  const config = getConfig();
  const limit = args.limit ?? config.channel.defaultVideoLimit;
  const sort = args.sort ?? config.channel.defaultSort;

  const result = await getChannelVideos(args.channelUrl, limit, sort, args.tab ?? 'videos', args.offset ?? 0);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result),
    }],
  };
}
