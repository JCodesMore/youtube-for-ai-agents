import { z } from 'zod';
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { extractFrames, parseTimestamp } from '../lib/download.js';
import { parseVideoId } from '../lib/ids.js';
import { clock } from './transcript.js';

const MAX_FRAMES = 10;

export const framesInputSchema = {
  videoId: z.string().describe('YouTube video URL or 11-character video ID'),
  times: z.array(z.union([z.string(), z.number()])).min(1).max(MAX_FRAMES)
    .describe(`Moments to look at: seconds (90), MM:SS ("1:30") or HH:MM:SS. Up to ${MAX_FRAMES}. Pick them from transcript timestamps or chapter times.`),
  quality: z.enum(['360p', '480p', '720p', '1080p']).optional()
    .describe('Frame resolution (default 720p). Use 1080p to read small on-screen text or code.'),
  outputDir: z.string().optional()
    .describe('Also keep the frames as JPEG files in this folder. By default they are only returned as images.'),
};

export async function handleFrames(args: { videoId: string; times: Array<string | number>; quality?: string; outputDir?: string }) {
  const videoId = parseVideoId(args.videoId);
  const seconds = args.times.map((t) => (typeof t === 'number' ? t : parseTimestamp(t)));
  const height = Number((args.quality ?? '720p').replace('p', ''));
  const frames = await extractFrames(videoId, seconds, { height, outputDir: args.outputDir });

  const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];
  for (const f of frames) {
    content.push({ type: 'text', text: `Frame at ${clock(f.time)} (https://youtu.be/${videoId}?t=${Math.floor(f.time)})${args.outputDir ? `, saved to ${f.filePath}` : ''}` });
    content.push({ type: 'image', data: readFileSync(f.filePath).toString('base64'), mimeType: 'image/jpeg' });
  }
  if (!args.outputDir && frames.length) rmSync(dirname(frames[0].filePath), { recursive: true, force: true });
  return { content };
}
