# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.4] - 2026-11-27

### Changed
- `youtube_clip` always returns `{ clips, highlightReel?, notes? }`, with each file's measured `duration` and `durationSeconds` in place of `clipDuration`. A single clip used to come back as a bare array.

### Added
- `youtube_get_channel_videos` lists a channel's Shorts or live streams with `tab: "shorts"` or `"live"`. Before, only the Videos tab was listed, so creators who post mostly Shorts looked inactive.
- `youtube_get_channel_videos` and `youtube_get_playlist` page with `offset` and report `returned` and `hasMore`, so long playlists and channels can be read to the end.
- `youtube_get_playlist` reads Mixes (`list=RD…` links), and gives each video's views and age where YouTube shows them.
- `youtube_get_comments` reads into threads with `replies`.
- Search results flag streams that are live right now with `live: true`.

### Fixed
- Search results have their channel and view count again. YouTube serves some searches in a newer card format, which came back without them and sometimes put description text in `views`.
- Channel search returns subscriber counts in the right field. They had swapped with the handle.
- `sortBy: "date"` returns results newest first.
- Sorting channel videos by `popular` or `oldest` works. Both silently returned the newest videos.
- A mistyped handle, playlist or video ID gets a `not_found` error that says so, instead of "the video may have been removed" or "try again". Comments that are turned off get `comments_disabled`.
- Playlist entries name their channel when YouTube leaves it out, and an album names its artist.
- Styled captions (outlined text, common on big channels) come back once per line, without the doubled lines and zero-width characters.
- `youtube_get_video_info` flags `ageRestricted` and `paywalled` videos, and no longer shows a "details withheld" note on videos with nothing missing, or a "NaN" view count on paid films.
- Transcripts: a live stream gets a clear "no transcript until it ends" error, and paid or members-only videos get a `paywalled` error. A `maxSegments` cut says the transcript continues. `duration` is the video's length rather than the last caption's end, and every other available language is listed.
- `youtube_get_frames` skips times past the end of the video and says which, instead of failing the whole call.
- Highlight reels from `youtube_clip` stay in sync. Fast-cut reels played each clip after the first about a second ahead of its picture.
- `youtube_download` saves into a folder when `outputPath` is one, instead of a file named after the folder in its parent. M4A and Opus audio is saved as YouTube serves it, about half the size and several times faster than before. Audio-only downloads warn only past 3 hours. Video downloads report the `resolution` actually saved.
- Clip mistakes (start after end, times past the video, missing reel files) return `invalid_input` with a hint instead of "try again". An end past the video's end clips to the end. YouTube-style times like `1m02s` work.
- Clips and reels report their measured duration, so a reel's length can be checked. `youtube_highlight_reel` picks its frame from the clips (vertical for Shorts) instead of always 1280×720.
- Links wrapped in `<…>` or brackets, or with trailing punctuation, are accepted. Clip links resolve to their video. A playlist or channel link given to a video tool names the tool to use instead.

## [0.3.3] - 2026-11-27

### Fixed
- `youtube_get_playlist` returns each video's ID, title and channel again. They came back empty after a YouTube layout change.
- Upload dates are back in search results and channel video lists.
- `youtube_get_video_info` gives a like count of 0 instead of "NaN" for videos with no likes, and fills tags from the video's keywords when YouTube leaves the tags out. It no longer warns that details were withheld when nothing is missing.
- Comments with no likes show "0" instead of a blank.
- A deleted video is recognized as gone at once, instead of the transcript tool trying every route.

## [0.3.2] - 2026-11-27

### Fixed
- Transcripts of auto-dubbed videos, which YouTube gives an audio track and auto captions in many languages, are labeled with the language actually spoken. They came back labeled with whichever dub was listed first, such as Bangla or Arabic.
- Asking for a dub's language no longer returns the original transcript labeled as that language. It comes from the caption files when they answer, otherwise the original comes back with a note saying so.
- Transcripts cached by earlier versions are fetched again, so wrong labels don't linger.

## [0.3.1] - 2026-11-27

### Fixed
- The server is listed in the MCP Registry, as `io.github.JCodesMore/youtube-for-ai-agents`. The registry refused the lowercase name 0.3.0 was published with.
- npm publishes the package's commands without "auto-corrected" warnings.

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
- `logout` also removes the browser profile `login` signed in with, not just the saved cookies.
- An outdated yt-dlp on your PATH no longer breaks downloads, clips and frames: the plugin uses its own current copy instead, checked against yt-dlp's published checksums.
- Highlight reels accept clips without sound, and clips with the same label no longer overwrite each other.

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
- Sign-in and settings dotfiles (`.cookies.json`, `.config.json`) in the folder the agent runs in are no longer read, since any project could plant one. If you signed in with an older version that saved there, run `login` again.

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
