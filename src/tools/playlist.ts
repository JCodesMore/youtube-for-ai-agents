import { z } from 'zod';
import { getPlaylist } from '../lib/innertube.js';
import { DEFAULTS } from '../config.js';
import { getConfig } from '../lib/user-config.js';

export const playlistInputSchema = {
  playlistId: z.string().describe('YouTube playlist ID (e.g. PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf)'),
  limit: z.number().min(1).max(DEFAULTS.playlist.maxLimit).optional()
    .describe(`Max videos to return (default: ${DEFAULTS.playlist.defaultLimit}, max: ${DEFAULTS.playlist.maxLimit})`),
};

export async function handlePlaylist(args: { playlistId: string; limit?: number }) {
  const config = getConfig();
  const limit = args.limit ?? config.playlist.defaultLimit;

  const result = await getPlaylist(args.playlistId, limit);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
