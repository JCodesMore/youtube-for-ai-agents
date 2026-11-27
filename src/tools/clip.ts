import { z } from 'zod';
import { createClips } from '../lib/download.js';
import { resolveVideoId } from '../lib/innertube.js';
import { getConfig } from '../lib/user-config.js';
import type { DownloadQuality } from '../config.js';

export const clipInputSchema = {
  videoId: z.string().describe('YouTube video URL (any form: watch, youtu.be, Shorts, live) or 11-character video ID'),
  clips: z.array(z.object({
    startTime: z.string().describe('Start timestamp — seconds ("90"), MM:SS ("1:30"), HH:MM:SS ("1:30:00") or YouTube style ("1m30s")'),
    endTime: z.string().describe('End timestamp, same forms. An end past the video\'s end clips to the end.'),
    label: z.string().optional().describe('Label for output filename (e.g. "intro" produces "Title - intro.mp4")'),
  })).min(1).describe('One or more clip definitions with start/end timestamps'),
  outputDir: z.string().optional()
    .describe('Output directory for clip files (defaults to current directory)'),
  quality: z.enum(['best', 'bestefficiency', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']).optional()
    .describe('Video quality (default: 720p)'),
  accurate: z.boolean().optional()
    .describe('Exact cuts: re-encodes around each cut point so the clip starts and ends on the given times. Recommended for highlight reels. Default false: cuts snap to keyframes and may include a second or two extra.'),
  force: z.boolean().optional()
    .describe('Bypass the duration guard for long videos'),
  highlightReel: z.boolean().optional()
    .describe('With 2+ clips, also join them into one highlight-reel video (default: true). Set to false unless a reel was asked for.'),
};

interface ClipArgs {
  videoId: string;
  clips: Array<{ startTime: string; endTime: string; label?: string }>;
  outputDir?: string;
  quality?: DownloadQuality;
  accurate?: boolean;
  force?: boolean;
  highlightReel?: boolean;
}

export async function handleClip(args: ClipArgs) {
  const config = getConfig();

  const result = await createClips(await resolveVideoId(args.videoId), args.clips, {
    outputDir: args.outputDir,
    quality: args.quality ?? config.download.defaultQuality,
    accurate: args.accurate,
    force: args.force,
    highlightReel: args.highlightReel,
  });

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
