#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
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
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
const server = new McpServer({
    name: 'youtube',
    version: pkg.version,
});
const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
};
server.registerTool('youtube_search', {
    description: 'Search YouTube for videos, channels, or playlists. Supports filtering by upload date (today/week/month/year), duration (short/medium/long), and sorting (relevance/date/views/rating). Returns results with metadata including title, channel, views, duration, and whether results are personalized.',
    inputSchema: searchInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleSearch);
server.registerTool('youtube_get_transcript', {
    description: 'Get the transcript of a YouTube video. Control output size with: "format" — "text" (fullText only, smallest), "segments" (timestamps only), or "both" (default). Use "startTime"/"endTime" (seconds) to grab a specific section (pairs well with chapter timestamps from youtube_get_video_info). Use "maxSegments" to cap output for previewing long videos.',
    inputSchema: transcriptInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleTranscript);
server.registerTool('youtube_get_video_info', {
    description: 'Get metadata for a YouTube video. Use "detail" to control response size: "brief" (key stats only — title, channel, views, likes, duration), "standard" (default — most fields, truncated description, chapter count), or "full" (everything including full description, chapters, tags, thumbnail).',
    inputSchema: videoInfoInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleVideoInfo);
server.registerTool('youtube_get_channel_videos', {
    description: 'List videos from a YouTube channel. Accepts @handle, full URL, or channel ID. Returns videos sorted by newest, popular, or oldest.',
    inputSchema: channelVideosInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleChannelVideos);
server.registerTool('youtube_get_channel_info', {
    description: 'Get metadata for a YouTube channel — name, handle, description, subscriber count, country, and more. Accepts @handle, full URL, or channel ID.',
    inputSchema: channelInfoInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleChannelInfo);
server.registerTool('youtube_get_playlist', {
    description: 'Get a YouTube playlist\'s metadata and its videos. Returns title, description, channel, video count, and the list of videos with their positions.',
    inputSchema: playlistInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handlePlaylist);
const DOWNLOAD_ANNOTATIONS = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
};
server.registerTool('youtube_download', {
    description: 'Download a YouTube video or audio track to a local file. Defaults to 720p quality. Supports quality selection (720p/1080p/best/etc.), download type (video+audio/audio/video), and format. Videos over 30 minutes trigger a confirmation prompt — use force: true to bypass. For video+audio, automatically downloads and muxes separate streams.',
    inputSchema: downloadInputSchema,
    annotations: DOWNLOAD_ANNOTATIONS,
}, handleDownload);
server.registerTool('youtube_clip', {
    description: 'Extract one or more clips from a YouTube video by timestamp. Downloads the source video once at 720p, then cuts each clip. Each clip needs startTime and endTime (seconds, MM:SS, or HH:MM:SS) and an optional label for the filename. Uses fast keyframe-aligned cuts by default — do NOT set accurate: true unless the user explicitly asks for frame-perfect precision (it re-encodes and is much slower). Keep clips tight — 5-10 seconds each, capturing one key moment per clip. When 2+ clips are provided, automatically produces a per-video highlight reel alongside individual clips.',
    inputSchema: clipInputSchema,
    annotations: DOWNLOAD_ANNOTATIONS,
}, handleClip);
server.registerTool('youtube_highlight_reel', {
    description: 'Combine existing clip files into a single highlight reel. Pass file paths from previous youtube_clip results in your desired playback order. Use this after clipping multiple videos to create one combined reel across all sources. The order of the clips array determines playback order — arrange clips for narrative flow before calling.',
    inputSchema: highlightReelInputSchema,
    annotations: DOWNLOAD_ANNOTATIONS,
}, handleHighlightReel);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error('YouTube MCP server failed to start:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map