import { z } from 'zod';
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { extractFrames, parseTimestamp } from '../lib/download.js';
import { getDurationSeconds, resolveVideoId } from '../lib/innertube.js';
import { clock } from './transcript.js';
import { YouTubeToolError } from '../lib/errors.js';

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
  const videoId = await resolveVideoId(args.videoId);
  const asked = args.times.map((t) => ({ label: String(t), seconds: typeof t === 'number' ? t : String(t).trim().startsWith('-') ? -1 : parseTimestamp(t) }));
  // Check times against the video before downloading anything, so a slip ("45:00" on a 40-minute
  // talk) costs one frame, not the whole call.
  const length = await getDurationSeconds(videoId).catch(() => 0);
  const skipped: string[] = [];
  const seconds: number[] = [];
  for (const t of asked) {
    if (!(t.seconds >= 0)) skipped.push(`${t.label} (negative)`);
    else if (length && t.seconds >= length) skipped.push(`${t.label} (past the end; the video is ${clock(length)} long)`);
    else seconds.push(t.seconds);
  }
  if (!seconds.length) {
    throw new YouTubeToolError('invalid_input', `No requested time is inside this video: ${skipped.join(', ')}.`, `Pick times between 0:00 and ${length ? clock(length) : "the video's end"}, from transcript timestamps or chapter times.`);
  }
  const height = Number((args.quality ?? '720p').replace('p', ''));
  const frames = await extractFrames(videoId, seconds, { height, outputDir: args.outputDir });
  const missed = seconds.filter((s) => !frames.some((f) => f.time === s)).map((s) => clock(s));

  const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];
  if (skipped.length) content.push({ type: 'text', text: `Skipped: ${skipped.join(', ')}.` });
  if (missed.length) content.push({ type: 'text', text: `Couldn't grab the frame at ${missed.join(', ')}. Try a nearby moment.` });
  for (const f of frames) {
    content.push({ type: 'text', text: `Frame at ${clock(f.time)} (https://youtu.be/${videoId}?t=${Math.floor(f.time)})${args.outputDir ? `, saved to ${f.filePath}` : ''}` });
    content.push({ type: 'image', data: readFileSync(f.filePath).toString('base64'), mimeType: 'image/jpeg' });
  }
  if (!args.outputDir && frames.length) rmSync(dirname(frames[0].filePath), { recursive: true, force: true });
  return { content };
}
