# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-27

### Fixed
- The plugin now starts on a fresh install. It no longer depends on a first-session `npm install` that could race the server or fail silently, which left agents unable to open any video.
- Transcripts work again when YouTube rate-limits caption downloads, the error behind most "couldn't fetch the video" reports. They now come from YouTube's own transcript panel, a separate system that keeps answering, with three caption-file routes behind it.
- Transcripts work for videos in any language. They default to the language the video is spoken in and can be fetched in any language the video has, or translated by YouTube on request.
- Every tool accepts YouTube links as people paste them (watch, youtu.be, Shorts, live, embed, music, with timestamps and tracking parameters), not only bare IDs.
- Sign-in and settings are saved in one place the server actually reads, `~/.youtube-for-ai-agents`, instead of differing between the setup wizard and the server.
- Clips download only the requested parts of a video instead of the whole file.
- On VPN and cloud networks, where YouTube hides a video's caption list, transcripts still come back, in the requested language when the video has it, with a note when it doesn't.
- Video details come back on VPN and cloud networks where YouTube withholds player data, with a note saying what's missing, instead of an empty result.
- Channel video titles and playlist search results, which came back empty after a YouTube layout change.

### Added
- `youtube_get_comments` reads a video's top or newest comments.
- `youtube_get_frames` returns what's on screen at given moments as images the agent can see.
- A built-in command line: `doctor` checks search, video details and transcripts from your computer and says what to fix; `login` signs in through a separate browser window; plus `logout`, `status` and `config`.
- Errors tell the agent what happened and what to do (`rate_limited`, `bot_check`, `no_captions`, `private`, and more), so it can explain instead of guessing.
- Long transcripts come back in pages that fit the agent's context, with the time to continue from.
- Transcripts are cached for a week, and repeat requests during a YouTube rate limit wait instead of making it worse.
- A plugin icon.
- A `network.proxy` setting (or `YOUTUBE_AI_AGENTS_PROXY`) for networks YouTube blocks.
- yt-dlp and ffmpeg are fetched automatically on first use when they aren't installed.
- The OpenCode plugin registers the server itself, so one line in `opencode.json` installs everything.
- MCP Registry metadata (`server.json`), CI on Windows, macOS and Linux, and an automated npm and MCP Registry release.

### Changed
- The server is one bundled file with no runtime dependencies, so installs are instant and nothing is installed on first run.
- Node.js 22 or newer is recommended (20 still runs).
- The `youtube` skill, `/youtube:setup` and the `video-watcher` agent are rewritten around the new tools.
- The README leads with a one-step install and a prompt you can paste to your agent; per-agent guides are updated.

### Removed
- The `SessionStart` dependency-install hook and the separate cookie and config scripts, replaced by the built-in command line.

## [0.2.0] - 2026-03-31

### Added
- Video download, clipping, highlight reel tools, and video duration retrieval

## [0.1.6] - 2026-03-30

### Changed
- Renamed `transcript-analyzer` agent to `video-watcher` across all references (README, docs, skills, Gemini tools).
- Removed `tools` allowlist from video-watcher agent so subagents correctly inherit MCP tools from the parent session.

## [0.1.5] - 2026-03-30

### Changed
- Humanized plugin personality — YouTube skill and video-watcher agent now speak like a colleague who watches videos for you, not a tool that fetches transcripts.
- Added welcome greeting with auth status, capability menu, URL auto-detection, and conversational result formatting.

## [0.1.4] - 2026-03-30

### Fixed
- MCP server failing with `ERR_MODULE_NOT_FOUND` after marketplace install — `NODE_PATH` does not work with ES modules. Changed `ensure-deps.mjs` to install `node_modules` into the plugin root (next to `dist/`) so ESM resolution finds packages via standard directory walking.
- Removed unused `NODE_PATH` from `.mcp.json` env config.

## [0.1.3] - 2026-03-30

### Fixed
- Plugin MCP server failing to start after marketplace install — `dist/` was gitignored so the git-cloned cache had no compiled output and no way to build it.
- Added `SessionStart` hook to auto-install runtime dependencies into `CLAUDE_PLUGIN_DATA` with hash-based skip logic (only reinstalls when `package.json` changes).
- Set `NODE_PATH` in MCP server env so `dist/` can resolve dependencies from `CLAUDE_PLUGIN_DATA/node_modules`.
- Simplified `start-mcp.mjs` — removed unreliable build fallback (no `tsc` available in plugin cache), now just validates `dist/` exists.
- Fixed `spawnSync EINVAL` crash on Node.js v24/Windows by using `shell: true` for npm calls in `ensure-deps.mjs`.

## [0.1.1] - 2026-03-31

### Fixed
- Claude plugin manifest validation by removing unsupported keys from `.claude-plugin/plugin.json`.
- Skill script path resolution by switching setup/youtube skill commands to `${CLAUDE_PLUGIN_ROOT}/scripts/...`.
- MCP startup reliability by routing `.mcp.json` through `scripts/start-mcp.mjs`, which auto-builds `dist/` if missing.
- Config consistency by syncing `scripts/config.mjs` defaults and limits with runtime config (`search.defaultLimit: 20`, `search.maxLimit: 50`).

### Changed
- Standardized plugin license metadata to Apache-2.0 across plugin manifests.
- Updated docs to clarify `CLAUDE_PLUGIN_DATA` cookie/config storage behavior and plugin-root CLI usage.

## [0.1.0] - 2026-03-29

### Added
- YouTube search with filters (upload date, duration, sort order, content type)
- Video transcript retrieval with format options, time range filtering, and segment limits
- Video metadata with brief/standard/full detail levels
- Channel info lookup by @handle, URL, or channel ID
- Channel video listing with sort options (newest, popular, oldest)
- Playlist retrieval with video details and positions
- Anonymous mode (works out of the box, no setup required)
- Personalized mode with Chrome-based cookie extraction
- Setup skill (`/youtube:setup`) for guided configuration and authentication
- YouTube research skill with tool composition guidance
- Transcript analyzer agent for structured video analysis
- Configuration CLI (`scripts/config.mjs`) for customizing default settings
- Dedicated Chrome profile for cookie extraction (isolated from user's main browser)
