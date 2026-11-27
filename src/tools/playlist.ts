import { z } from 'zod';
import { getPlaylist } from '../lib/innertube.js';
import { DEFAULTS } from '../config.js';
import { getConfig } from '../lib/user-config.js';

/** YouTube caps playlists at 5,000 videos. */
const MAX_OFFSET = 5000;

export const playlistInputSchema = {
  playlistId: z.string().describe('YouTube playlist URL or ID (e.g. PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf). Mix links (list=RD…) work too.'),
  limit: z.number().min(1).max(DEFAULTS.playlist.maxLimit).optional()
    .describe(`Max videos to return (default: ${DEFAULTS.playlist.defaultLimit}, max: ${DEFAULTS.playlist.maxLimit})`),
  offset: z.number().int().min(0).max(MAX_OFFSET).optional()
    .describe('Skip this many videos first, to page past a previous call (use when the result says hasMore)'),
};

export async function handlePlaylist(args: { playlistId: string; limit?: number; offset?: number }) {
  const config = getConfig();
  const limit = args.limit ?? config.playlist.defaultLimit;

  const result = await getPlaylist(args.playlistId, limit, args.offset ?? 0);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result),
    }],
  };
}
