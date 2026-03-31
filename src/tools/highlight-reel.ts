import { z } from 'zod';
import { existsSync, statSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { concatClips, formatFileSize } from '../lib/download.js';

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
    throw new Error(`Clip files not found:\n${missing.join('\n')}`);
  }

  const outputDir = resolve(args.outputDir ?? '.');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const label = args.label ?? 'highlight-reel';
  const outputPath = join(outputDir, `${label}.mp4`);

  await concatClips(args.clips, outputPath, { reencode: true });

  const fileSize = formatFileSize(statSync(outputPath).size);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        highlightReel: {
          filePath: outputPath,
          fileSize,
          clipCount: args.clips.length,
        },
      }, null, 2),
    }],
  };
}
