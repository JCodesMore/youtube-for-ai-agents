import { z } from 'zod';
import { downloadVideo } from '../lib/download.js';
import { resolveVideoId } from '../lib/innertube.js';
import { getConfig } from '../lib/user-config.js';
import type { DownloadQuality, DownloadType } from '../config.js';

export const downloadInputSchema = {
  videoId: z.string().describe('YouTube video URL (any form: watch, youtu.be, Shorts, live) or 11-character video ID'),
  outputPath: z.string().optional()
    .describe('Output file path, or a folder to save <title>.<format> in (defaults to the current folder)'),
  quality: z.enum(['best', 'bestefficiency', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']).optional()
    .describe('Video quality (default: 720p)'),
  type: z.enum(['video+audio', 'audio', 'video']).optional()
    .describe('Download type — "video+audio" (default), "audio" (audio only), or "video" (no audio)'),
  format: z.string().optional()
    .describe('File format: mp4 (default), webm or mkv for video; m4a (default), mp3, opus or wav for audio'),
  force: z.boolean().optional()
    .describe('Bypass the duration guard (by default video over 30 minutes, audio over 3 hours)'),
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

  const result = await downloadVideo(await resolveVideoId(args.videoId), {
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
