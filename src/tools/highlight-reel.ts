import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { concatClips, sanitizeFilename, summarizeFile } from '../lib/download.js';
import { YouTubeToolError } from '../lib/errors.js';

export const highlightReelInputSchema = {
  clips: z.array(z.string()).min(2)
    .describe('File paths to existing clip/video files, in your desired playback order'),
  outputDir: z.string().optional()
    .describe('Output directory for the highlight reel (defaults to current directory)'),
  label: z.string().optional()
    .describe('Name for the reel file — produces "{label}.mp4" (default: "highlight-reel")'),
};

interface HighlightReelArgs {
  clips: string[];
  outputDir?: string;
  label?: string;
}

export async function handleHighlightReel(args: HighlightReelArgs) {
  const missing = args.clips.filter(p => !existsSync(p));
  if (missing.length > 0) {
    throw new YouTubeToolError(
      'invalid_input',
      `Clip files not found:\n${missing.join('\n')}`,
      'Check the paths: pass the filePath values youtube_clip returned, as absolute paths.',
    );
  }

  const outputDir = resolve(args.outputDir ?? '.');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const label = sanitizeFilename(args.label ?? 'highlight-reel');
  const outputPath = join(outputDir, `${label}.mp4`);

  // The frame (size, orientation, frame rate) is picked from the clips; the summary reports it.
  await concatClips(args.clips, outputPath);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        highlightReel: { ...(await summarizeFile(outputPath)), clipCount: args.clips.length },
      }, null, 2),
    }],
  };
}
