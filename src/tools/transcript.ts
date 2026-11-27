import { z } from 'zod';
import { getTranscript, cleanTranscriptText, type TranscriptSegment } from '../lib/transcript.js';
import { parseStartTime, parseVideoId } from '../lib/ids.js';
import { getConfig } from '../lib/user-config.js';
import { DEFAULTS } from '../config.js';

type TranscriptFormat = 'timestamped' | 'text' | 'segments';

/**
 * Keep each response well under the 25k-token cap MCP clients such as Claude Code apply to
 * tool results. Longer transcripts come back in pages; `nextStartTime` asks for the next one.
 */
const MAX_RESPONSE_TOKENS = 15_000;

/**
 * A rough token count that holds across scripts: English runs about four characters a token,
 * while Chinese, Japanese and Korean run about one, and other non-Latin scripts in between.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    tokens += code < 0x250 ? 0.25 : code >= 0x2e80 ? 1 : 0.5;
  }
  return Math.ceil(tokens);
}

export const transcriptInputSchema = {
  videoId: z.string().describe('YouTube video URL (any form: watch, youtu.be, Shorts, live) or 11-character video ID'),
  language: z.string().optional()
    .describe('Language code such as "en" or "es". Default: the language the video is spoken in. If the video has no captions in the requested language, YouTube translates them.'),
  format: z.enum(['timestamped', 'text', 'segments']).optional()
    .describe('"timestamped" (default): one line per caption with [m:ss] times, compact and good for citing moments or clipping. "text": plain prose, smallest. "segments": JSON array with offset/duration in seconds.'),
  startTime: z.number().optional()
    .describe('Only return captions at or after this time, in seconds. Use it with chapter times from youtube_get_video_info, or with nextStartTime to read the next page of a long transcript.'),
  endTime: z.number().optional()
    .describe('Only return captions before this time, in seconds.'),
  maxSegments: z.number().int().positive().optional()
    .describe(`Cap the number of captions returned (max ${DEFAULTS.transcript.maxSegments}), for a quick preview.`),
};

interface TranscriptArgs {
  videoId: string;
  language?: string;
  format?: TranscriptFormat | 'both';
  startTime?: number;
  endTime?: number;
  maxSegments?: number;
}

export function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function render(segments: TranscriptSegment[], format: TranscriptFormat, cleanup: boolean): string {
  if (format === 'segments') return JSON.stringify(segments);
  if (format === 'text') {
    const joined = segments.map((s) => s.text).join(' ');
    return cleanup ? cleanTranscriptText(joined) : joined;
  }
  return segments.map((s) => `[${clock(s.offset)}] ${s.text}`).join('\n');
}

/** Largest prefix of segments whose rendering fits the budget. */
function fit(segments: TranscriptSegment[], format: TranscriptFormat, cleanup: boolean): { text: string; count: number } {
  let text = render(segments, format, cleanup);
  if (estimateTokens(text) <= MAX_RESPONSE_TOKENS) return { text, count: segments.length };
  let lo = 1;
  let hi = segments.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(render(segments.slice(0, mid), format, cleanup)) <= MAX_RESPONSE_TOKENS) lo = mid;
    else hi = mid - 1;
  }
  text = render(segments.slice(0, lo), format, cleanup);
  return { text, count: lo };
}

export async function handleTranscript(args: TranscriptArgs) {
  const videoId = parseVideoId(args.videoId);
  const config = getConfig();
  const result = await getTranscript(videoId, args.language);
  const totalDuration = result.segments.length ? result.segments[result.segments.length - 1].offset + result.segments[result.segments.length - 1].duration : 0;

  const linkStart = args.startTime === undefined ? parseStartTime(args.videoId) : undefined;
  const start = args.startTime ?? linkStart;
  let segments = result.segments;
  if (start !== undefined) {
    // nextStartTime is a caption's exact start: page on from it without repeating the captions
    // that overlap it. Any other time also keeps the caption already being spoken then.
    const exact = segments.some((s) => Math.abs(s.offset - start) < 0.0005);
    segments = segments.filter((s) => (exact ? s.offset >= start - 0.0005 : s.offset + s.duration > start));
  }
  if (args.endTime !== undefined) segments = segments.filter((s) => s.offset < args.endTime!);
  const cap = Math.min(args.maxSegments ?? config.transcript.maxSegments, config.transcript.maxSegments);
  segments = segments.slice(0, cap);

  const format: TranscriptFormat = args.format === 'both' || args.format === undefined ? 'timestamped' : args.format;
  const { text, count } = fit(segments, format, config.transcript.cleanupEnabled);
  const truncated = count < segments.length;

  const header: Record<string, unknown> = {
    videoId,
    title: result.title,
    channel: result.channel,
    language: result.language,
    ...(result.translatedFrom ? { translatedFrom: result.translatedFrom } : {}),
    ...(result.language === 'unknown' ? { languageNote: "YouTube didn't share this video's caption languages with this network (common on VPN and cloud IPs), so this is its default transcript. Signing in usually fixes it." } : {}),
    ...(result.translationUnavailable ? { translationNote: `YouTube couldn't provide ${result.translationUnavailable} right now, so this is the original language. Translate it yourself if needed.` } : {}),
    autoGenerated: result.autoGenerated,
    duration: clock(totalDuration),
    range: count ? `${clock(segments[0].offset)}-${clock(segments[count - 1].offset + segments[count - 1].duration)}` : 'none',
    segmentCount: count,
    ...(linkStart ? { startNote: `Starts at ${clock(linkStart)} because the link has a timestamp. Pass startTime: 0 for the whole video.` } : {}),
    ...(truncated
      ? { truncated: true, nextStartTime: Math.round(segments[count].offset * 1000) / 1000, note: `Transcript continues. Call again with startTime: ${Math.round(segments[count].offset * 1000) / 1000} for the next part.` }
      : {}),
    otherLanguages: result.availableLanguages
      .filter((l) => l.languageCode !== result.language)
      .map((l) => `${l.languageCode}${l.autoGenerated ? ' (auto)' : ''}`)
      .slice(0, 30),
  };

  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(header) },
      { type: 'text' as const, text: text || '(no captions in this range)' },
    ],
  };
}
