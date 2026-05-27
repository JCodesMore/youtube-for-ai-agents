import { z } from 'zod';
import { downloadVideo } from '../lib/download.js';
import { getConfig } from '../lib/user-config.js';
import type { DownloadQuality, DownloadType } from '../config.js';

export const downloadInputSchema = {
  videoId: z.string().describe('YouTube video ID'),
  outputPath: z.string().optional()
    .describe('Output file path (defaults to <title>.<format> in current directory)'),
  quality: z.enum(['best', 'bestefficiency', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']).optional()
    .describe('Video quality (default: best)'),
  type: z.enum(['video+audio', 'audio', 'video']).optional()
    .describe('Download type — "video+audio" (default), "audio" (audio only), or "video" (no audio)'),
  format: z.string().optional()
    .describe('Container format (default: mp4)'),
  force: z.boolean().optional()
    .describe('Bypass the duration guard for long videos'),
};

interface DownloadArgs {
  videoId: string;
  outputPath?: string;
  quality?: DownloadQuality;
  type?: DownloadType;
  format?: string;
  force?: boolean;
}

export async function handleDownload(args: DownloadArgs) {
  const config = getConfig();

  const result = await downloadVideo(args.videoId, {
    quality: args.quality ?? config.download.defaultQuality,
    type: args.type ?? config.download.defaultType,
    format: args.format ?? config.download.defaultFormat,
    outputPath: args.outputPath,
    force: args.force,
  });

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
