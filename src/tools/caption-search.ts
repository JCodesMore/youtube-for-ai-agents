/**
 * youtube_caption_search — full-text search within a video's transcript.
 *
 * Unlike youtube_get_transcript (which returns all segments), this tool
 * searches and returns only the matching moments — each with surrounding
 * context lines and a click-to-jump timestamp. Perfect for:
 *   - "Find every time they mention X in this 3-hour lecture"
 *   - "When do they talk about pricing?"
 *   - "Show me all the moments where [person] speaks"
 */

import { z } from 'zod';
import { getTranscript } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';

export const captionSearchInputSchema = {
  videoId: z.string()
    .describe('YouTube video ID to search within'),
  query: z.string()
    .describe('Text to search for. Supports simple strings. Case-insensitive by default.'),
  caseSensitive: z.boolean().optional()
    .describe('Match case exactly (default: false)'),
  contextLines: z.number().min(0).max(10).optional()
    .describe('Number of segments to include before and after each match for context (default: 2)'),
  maxMatches: z.number().min(1).max(200).optional()
    .describe('Maximum matches to return (default: 50)'),
  language: z.string().optional()
    .describe('Transcript language code (default: "en")'),
};

interface CaptionSearchArgs {
  videoId: string;
  query: string;
  caseSensitive?: boolean;
  contextLines?: number;
  maxMatches?: number;
  language?: string;
}

export interface CaptionMatch {
  matchIndex: number;
  timestamp: number;               // seconds — use for deep-link
  timestampFormatted: string;      // e.g. "12:34"
  youtubeLink: string;             // https://youtu.be/VIDEO_ID?t=SECONDS
  matchedText: string;             // the segment that matched
  context: Array<{
    text: string;
    offset: number;
    isMatch: boolean;
  }>;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function handleCaptionSearch(args: CaptionSearchArgs) {
  const contextLines = args.contextLines ?? 2;
  const maxMatches = args.maxMatches ?? 50;
  const caseSensitive = args.caseSensitive ?? false;

  // Parallel fetch — transcript (disk-cached) + video title
  const [transcriptResult, videoInfoResult] = await Promise.allSettled([
    getTranscript(args.videoId, args.language),
    getVideoInfo(args.videoId),
  ]);

  if (transcriptResult.status === 'rejected') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: String(transcriptResult.reason) }) }],
      isError: true,
    };
  }

  const transcript = transcriptResult.value;
  if ('error' in transcript) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(transcript) }],
      isError: true,
    };
  }

  const title = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value.title : '';
  const segments = transcript.segments;

  const needle = caseSensitive ? args.query : args.query.toLowerCase();

  // Find all matching segment indices
  const matchingIndices: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    const hay = caseSensitive ? segments[i].text : segments[i].text.toLowerCase();
    if (hay.includes(needle)) matchingIndices.push(i);
  }

  // De-duplicate overlapping context windows and build match objects
  const matches: CaptionMatch[] = [];
  let prevWindowEnd = -1;

  for (const idx of matchingIndices) {
    if (matches.length >= maxMatches) break;

    const windowStart = Math.max(0, idx - contextLines);
    const windowEnd = Math.min(segments.length - 1, idx + contextLines);

    // Skip if this match is fully inside the previous match's context window
    if (windowStart <= prevWindowEnd && idx <= prevWindowEnd) continue;
    prevWindowEnd = windowEnd;

    const seg = segments[idx];
    matches.push({
      matchIndex: matches.length + 1,
      timestamp: seg.offset,
      timestampFormatted: formatTimestamp(seg.offset),
      youtubeLink: `https://youtu.be/${args.videoId}?t=${seg.offset}`,
      matchedText: seg.text,
      context: segments.slice(windowStart, windowEnd + 1).map(s => ({
        text: s.text,
        offset: s.offset,
        isMatch: s === seg,
      })),
    });
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        videoId: args.videoId,
        title,
        query: args.query,
        caseSensitive,
        totalSegments: segments.length,
        totalMatches: matchingIndices.length,
        returnedMatches: matches.length,
        ...(matchingIndices.length > maxMatches
          ? { note: `Showing first ${maxMatches} of ${matchingIndices.length} matches. Increase maxMatches to see more.` }
          : {}),
        matches,
      }, null, 2),
    }],
  };
}
