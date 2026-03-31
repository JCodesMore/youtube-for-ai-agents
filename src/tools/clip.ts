import { z } from 'zod';
import { createClips } from '../lib/download.js';
import { getConfig } from '../lib/user-config.js';
import type { DownloadQuality } from '../config.js';

export const clipInputSchema = {
  videoId: z.string().describe('YouTube video ID'),
  clips: z.array(z.object({
    startTime: z.string().describe('Start timestamp — seconds ("90"), MM:SS ("1:30"), or HH:MM:SS ("1:30:00")'),
    endTime: z.string().describe('End timestamp — seconds ("225"), MM:SS ("3:45"), or HH:MM:SS ("1:30:00")'),
    label: z.string().optional().describe('Label for output filename (e.g. "intro" produces "Title - intro.mp4")'),
  })).min(1).describe('One or more clip definitions with start/end timestamps'),
  outputDir: z.string().optional()
    .describe('Output directory for clip files (defaults to current directory)'),
  quality: z.enum(['best', 'bestefficiency', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']).optional()
    .describe('Video quality for the source download (default: best)'),
  accurate: z.boolean().optional()
    .describe('Frame-accurate cuts via re-encoding — MUCH slower, re-encodes entire clip. Only use when the user explicitly needs frame-perfect precision. Default fast keyframe cuts are fine for nearly all use cases (default: false)'),
  force: z.boolean().optional()
    .describe('Bypass the duration guard for long videos'),
  highlightReel: z.boolean().optional()
    .describe('Combine all clips into a single highlight-reel video (default: true). Set to false for individual clips only.'),
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

  const result = await createClips(args.videoId, args.clips, {
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
