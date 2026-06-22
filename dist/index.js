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
import { trendingInputSchema, handleTrending } from './tools/trending.js';
import { batchTranscriptInputSchema, handleBatchTranscript } from './tools/batch-transcript.js';
import { commentsInputSchema, handleComments } from './tools/comments.js';
import { relatedInputSchema, handleRelated } from './tools/related.js';
import { summarizeInputSchema, handleSummarize } from './tools/summarize.js';
import { captionSearchInputSchema, handleCaptionSearch } from './tools/caption-search.js';
import { chaptersEditInputSchema, handleChaptersEdit } from './tools/chapters-edit.js';
import { exportInputSchema, handleExport } from './tools/export.js';
import { cacheAdminInputSchema, handleCacheAdmin } from './tools/cache-admin.js';
import { channelCompareInputSchema, handleChannelCompare } from './tools/channel-compare.js';
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
server.registerTool('youtube_get_trending', {
    description: 'Get currently trending YouTube videos. Use "category" to filter by "now" (all trending, default), "music", "gaming", or "movies". Great for discovery, competitive analysis, or finding what\'s popular in a niche. Results are cached for 10 minutes.',
    inputSchema: trendingInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleTrending);
server.registerTool('youtube_batch_transcript', {
    description: 'Fetch transcripts for 2–10 YouTube videos at once in parallel. Ideal for comparative research, summarizing a playlist, or cross-video analysis. Each video gets its own result entry — failed videos are noted individually and don\'t block the rest. Use maxSegments to cap response size when processing many long videos.',
    inputSchema: batchTranscriptInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleBatchTranscript);
server.registerTool('youtube_summarize', {
    description: 'Extract a structured, LLM-ready summary from a YouTube video without consuming the full transcript. Splits the video into chapter-aligned sections (or 3-minute chunks if no chapters), scores each transcript segment by information density, and returns the top sentences per section. Also outputs inferred topic tags and a compression ratio. Use this before asking an LLM to summarize or answer questions about a video — it reduces a typical 50k-token transcript to ~10k while preserving the key signal. Use sentencesPerSection to trade off depth vs. conciseness.',
    inputSchema: summarizeInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleSummarize);
server.registerTool('youtube_get_comments', {
    description: 'Fetch top or newest comments from a YouTube video. Returns comment text, author, like count, publish date, reply count, and whether the comment is pinned or from the creator. Useful for understanding audience reaction, finding common questions, gauging sentiment, or surfacing debates. Use sortBy: "top" for highest-engagement comments; "new" for the most recent. Comments may be unavailable for restricted or age-gated videos.',
    inputSchema: commentsInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleComments);
server.registerTool('youtube_get_related', {
    description: 'Get YouTube\'s recommended videos for a given video — the videos that appear in the "Up next" sidebar. Useful for discovering related content, mapping a topic landscape, understanding what YouTube associates with a creator\'s content, or finding the next video to watch in a series. Returns title, channel, views, duration, and thumbnail for each result.',
    inputSchema: relatedInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleRelated);
server.registerTool('youtube_caption_search', {
    description: 'Search for a word or phrase within a single video\'s transcript. Returns every moment the term appears, with surrounding context segments and a direct YouTube timestamp link (https://youtu.be/ID?t=SECONDS) for each match. Use this when you need to: find every mention of a topic in a long video; locate a specific claim or quote with its timestamp; answer "when do they talk about X?"; or navigate a lecture/documentary by keyword. Results include the matched segment text, context before and after, and a formatted timestamp. Transcripts are disk-cached so repeat searches on the same video are instant.',
    inputSchema: captionSearchInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleCaptionSearch);
server.registerTool('youtube_chapters_edit', {
    description: 'Auto-generate chapter timestamps from a video\'s transcript using topic segmentation. Returns chapter titles, start timestamps, and a "formattedForDescription" string ready to paste directly into a YouTube video description to enable chapters. If the video already has chapters they are returned as-is (use force: true to regenerate). Uses a vocabulary-shift algorithm — no LLM required. Adjust maxChapters (default: 8) and windowSize to tune granularity. Always review AI-generated titles before publishing.',
    inputSchema: chaptersEditInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleChaptersEdit);
server.registerTool('youtube_export', {
    description: 'Compile a complete, publication-ready research report for a YouTube video. Fetches video metadata, chapter-aligned key-sentence summaries, and optionally top comments — all in parallel — then formats as Markdown (default) or JSON. Markdown output includes: metadata table, topic tags, section-by-section insights with timestamp links, full chapter list, optional full condensed transcript, and top comments. Use this as the final step in a research session to produce a shareable artifact. Pass outputPath to also save to disk (e.g. "~/Desktop/report.md").',
    inputSchema: exportInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleExport);
server.registerTool('youtube_cache_admin', {
    description: 'Inspect and control the YouTube MCP cache layer and event bus. Four actions: "stats" — show entry counts for all caches (video/search/channel/playlist/trending), circuit breaker states, and event bus counts. "invalidate" — remove specific video IDs from the video cache so the next call fetches fresh data. "warm" — pre-fetch video info for a list of IDs so subsequent calls are instant (useful before a batch operation). "events" — view the last N events from the in-process event bus (cache:hit, cache:miss, rate:limited, circuit:open, tool:call, etc.) with optional topic filter. No sensitive data is exposed.',
    inputSchema: cacheAdminInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleCacheAdmin);
server.registerTool('youtube_channel_compare', {
    description: 'Compare 2–5 YouTube channels side-by-side. Fetches channel info plus recent videos in parallel for each, then computes engagement metrics: avg views per recent video, upload cadence (avg days between uploads), and rankings by subscribers, avg views, total views, and cadence. Failures on individual channels are isolated (partialFailures field) and do not block the rest. Use this for competitive analysis, creator benchmarking, or deciding which channel in a niche to follow. Default recentVideoCount is 10 (set to 0 to skip per-video metrics for a fast info-only compare). Set includeRecentTitles: true to get the raw recent titles per channel.',
    inputSchema: channelCompareInputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
}, handleChannelCompare);
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