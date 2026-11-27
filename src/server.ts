import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { searchInputSchema, handleSearch } from './tools/search.js';
import { transcriptInputSchema, handleTranscript } from './tools/transcript.js';
import { videoInfoInputSchema, handleVideoInfo } from './tools/video-info.js';
import { channelVideosInputSchema, handleChannelVideos } from './tools/channel-videos.js';
import { channelInfoInputSchema, handleChannelInfo } from './tools/channel-info.js';
import { playlistInputSchema, handlePlaylist } from './tools/playlist.js';
import { downloadInputSchema, handleDownload } from './tools/download.js';
import { clipInputSchema, handleClip } from './tools/clip.js';
import { highlightReelInputSchema, handleHighlightReel } from './tools/highlight-reel.js';
import { commentsInputSchema, handleComments } from './tools/comments.js';
import { framesInputSchema, handleFrames } from './tools/frames.js';
import { toolError } from './lib/errors.js';
import { VERSION } from './version.js';

const INSTRUCTIONS = `Tools for reading and working with YouTube: search, video details and chapters, transcripts (how you "watch" a video), frames (how you see it), comments, channels, playlists, and downloading, clipping and joining clips.

- Every tool accepts a full YouTube URL or a bare ID, so pass what the user gave you.
- To watch or summarise a video, call youtube_get_transcript. Transcripts over about 15k tokens come back in parts: follow nextStartTime to keep reading. Use chapter times from youtube_get_video_info to read only the part you need.
- Errors are JSON with "kind", "retryable" and "hint". Pass the hint on to the user instead of guessing, and don't retry a rate_limited error straight away.
- When what is shown matters (slides, code, charts, products), call youtube_get_frames at the relevant timestamps.
- Download, clip and reel tools write files to the current folder unless given a path. The first use fetches yt-dlp and ffmpeg automatically, which takes a minute.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITES_FILES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type Handler<A> = (args: A) => Promise<{ content: Content[]; isError?: boolean }>;

/** Any failure becomes a structured, actionable error result rather than a protocol error. */
function safe<A>(name: string, handler: Handler<A>): Handler<A> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      return toolError(error, name);
    }
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'youtube', title: 'YouTube for AI Agents', version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool('youtube_search', {
    title: 'Search YouTube',
    description: 'Search YouTube for videos, channels or playlists. Filter by upload date (today, week, month, year), length (short under 4 min, medium 4-20, long over 20) and sort (relevance, date, views, rating). Returns title, channel, views, age, duration and the video ID or URL for each result.',
    inputSchema: searchInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_search', handleSearch));

  server.registerTool('youtube_get_transcript', {
    title: 'Get video transcript',
    description: 'Read what is said in a YouTube video: its captions or auto-generated transcript, with timestamps. This is how to watch, summarise, quote or fact-check a video. Defaults to the spoken language. Pass "language" to get another one, translated by YouTube if needed. Long videos come back in parts (see nextStartTime). Use startTime/endTime to read one section.',
    inputSchema: transcriptInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_transcript', handleTranscript));

  server.registerTool('youtube_get_video_info', {
    title: 'Get video details',
    description: 'Details of a YouTube video: title, channel, views, likes, upload date, duration, description, and with detail "full" its chapters (with timestamps), tags and thumbnail. "brief" returns key stats only; "standard" is the default.',
    inputSchema: videoInfoInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_video_info', handleVideoInfo));

  server.registerTool('youtube_get_comments', {
    title: 'Read comments',
    description: "Read a YouTube video's comments, most liked or newest first: author, text, likes, age, reply count, and whether the creator pinned, wrote or hearted it. Good for audience reaction, corrections people point out, and recipes or links shared in the comments.",
    inputSchema: commentsInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_comments', handleComments));

  server.registerTool('youtube_get_frames', {
    title: 'See video frames',
    description: 'Look at a YouTube video: returns still frames, as images, at the times you choose. Use it for what the transcript cannot tell you: slides, code, charts, products, on-screen text, or what a scene looks like. Choose times from transcript timestamps or chapters. Up to 10 per call. The first use downloads yt-dlp and ffmpeg (about a minute).',
    inputSchema: framesInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_frames', handleFrames));

  server.registerTool('youtube_get_channel_videos', {
    title: 'List channel videos',
    description: "List a YouTube channel's videos, newest, most popular or oldest first. Accepts an @handle, a channel URL or a channel ID.",
    inputSchema: channelVideosInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_channel_videos', handleChannelVideos));

  server.registerTool('youtube_get_channel_info', {
    title: 'Get channel details',
    description: 'Details of a YouTube channel: name, handle, description, subscribers, video count, total views, join date and country. Accepts an @handle, a channel URL or a channel ID.',
    inputSchema: channelInfoInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_channel_info', handleChannelInfo));

  server.registerTool('youtube_get_playlist', {
    title: 'Get playlist',
    description: "A YouTube playlist's title, description, owner and its videos in order. Accepts a playlist URL or ID.",
    inputSchema: playlistInputSchema,
    annotations: READ_ONLY,
  }, safe('youtube_get_playlist', handlePlaylist));

  server.registerTool('youtube_download', {
    title: 'Download video or audio',
    description: 'Save a YouTube video, or just its audio, to a local file. Default 720p MP4, or M4A for audio. Videos over 30 minutes return a warning first; pass force: true to go ahead. The first use downloads yt-dlp and ffmpeg (about a minute).',
    inputSchema: downloadInputSchema,
    annotations: WRITES_FILES,
  }, safe('youtube_download', handleDownload));

  server.registerTool('youtube_clip', {
    title: 'Cut clips',
    description: 'Cut one or more clips from a YouTube video by timestamp. Only the requested ranges are downloaded, so clipping a long video is fast. Each clip needs startTime and endTime (seconds, MM:SS or HH:MM:SS) and an optional label for the file name. Keep clips tight: one moment each, usually 5-30 seconds. With 2+ clips it also joins them into a highlight reel. Set accurate: true for highlight reels or whenever cuts must land exactly (it re-encodes around the cut points, a little slower); without it, cuts snap to the nearest keyframe and can drift a second or two.',
    inputSchema: clipInputSchema,
    annotations: WRITES_FILES,
  }, safe('youtube_clip', handleClip));

  server.registerTool('youtube_highlight_reel', {
    title: 'Join clips into a reel',
    description: 'Join existing clip files, for example from several youtube_clip calls across different videos, into one highlight reel MP4. Pass the file paths in playback order.',
    inputSchema: highlightReelInputSchema,
    annotations: WRITES_FILES,
  }, safe('youtube_highlight_reel', handleHighlightReel));

  return server;
}

export async function serve(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
