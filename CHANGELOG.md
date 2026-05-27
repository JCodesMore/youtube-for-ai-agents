# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.0] — 2026-05-27

### Added
- `src/lib/event-bus.ts` — KafCa typed in-process event bus. Ring buffer (500 events), per-topic `on()` subscriptions, `onAll()` wildcard, `replay(topic, since)` API, external `BusAdapter` interface for Kafka/Redis Streams plug-in. Payloads frozen at emit time (RRSS Secure). Singleton `bus` export.
- `src/lib/circuit-breaker.ts` — RRSS Reliable. `innertubeBreaker` (YouTube API) and `transcriptBreaker`. CLOSED → OPEN after 5 consecutive failures; HALF_OPEN → CLOSED after 2 consecutive successes; OPEN → HALF_OPEN after 60 s. Emits `circuit:open` and `circuit:closed` bus events.
- `youtube_cache_admin` — 4 actions: `stats` (cache entry counts per named cache + circuit breaker state + failure count + event bus stats), `invalidate` (remove specific video IDs from video cache so next call fetches fresh data), `warm` (parallel pre-fetch video info for a list of IDs — useful before batch operations), `events` (ring buffer replay with optional topic filter and count limit).

### Changed
- `src/lib/innertube.ts` — `withTimeout<T>(promise, ms, label)` utility added (RRSS Robust). Innertube init: 15 s timeout + `innertubeBreaker.call()`. `yt.search()` and `yt.getInfo()`: 20 s timeout + `innertubeBreaker.call()`. Cache paths now emit `bus.emit('cache:hit')` and `bus.emit('cache:miss')` for full observability.
- `src/lib/transcript.ts` — Transcript fetch wrapped with `transcriptBreaker.call()`. `withRetry()` emits `bus.emit('rate:limited', {attempt, retryInMs})` before each sleep, replacing the silent wait.
- `src/index.ts` — `youtube_cache_admin` imported and registered as 18th tool.
- `package.json` — version bumped to 0.7.0.

## [0.6.0] — 2026-05-23

### Added
- `youtube_chapters_edit` — auto-generates chapter timestamps from a transcript using a TextTiling-inspired vocabulary-shift algorithm. Returns chapter titles, start timestamps, YouTube deep-links, and a `formattedForDescription` string for direct paste into a YouTube video description. Returns existing chapters if the video already has them (use `force: true` to regenerate).
- `youtube_export` — produces a complete research report in Markdown or JSON. Fetches video info, chapter-aligned summaries, and optionally full transcript and top comments — all in parallel. Markdown output is designed to be pasted into Notion, Obsidian, or shared as a `.md` file. Pass `outputPath` to also save to disk.
- `scripts/monitor-playlist.mjs` — detects playlist changes (videos added, removed, or reordered beyond a configurable threshold). Persists state between runs. Supports `--once`, `--interval`, `--webhook`, and `--threshold`. Run with `npm run monitor:playlist`.
- `railway.json` — single-service Railway deploy config (Dockerfile.agno, `PORT` env var, `ON_FAILURE` restart policy).

### Changed
- `integrations/agno_agent.py` — `build_agent(user_id)` now creates per-user SQLite tables for session isolation (multi-tenant RBAC). `serve()` reads `PORT`/`HOST` env vars. Detects and reports `AGNO_API_KEY` status. System prompt updated for all 17 tools. MCP timeout raised to 90s. Four new example tasks added.
- `package.json` — `monitor:playlist` script added; version bumped to 0.6.0.

## [0.5.0] — 2026-05-23

### Added
- `youtube_caption_search` — keyword search within a transcript. Returns every match with surrounding context segments, formatted timestamp, and a `https://youtu.be/ID?t=N` deep-link. Overlapping context windows are de-duplicated. Uses disk cache so repeat searches on the same video are instant.
- `scripts/monitor-channel.mjs` — cron-ready new-video detector. Persists seen IDs to `$CLAUDE_PLUGIN_DATA/monitor/`. Supports `--once` (single check), `--interval` (polling loop), and `--webhook URL` (HTTP POST on new video). Emits JSON-line events.
- `scripts/dashboard.mjs` — local research dashboard at `http://localhost:4242`. Lists all disk-cached transcripts, supports full-text search across all of them, inline transcript browser with keyword highlighting and copy button. Run with `npm run dashboard`.
- `docker-compose.agno.yml`, `Dockerfile.node`, `Dockerfile.agno` — production container stack for Railway/GCP/AWS.
- `docs/deploy-agno-railway.md` — step-by-step Railway deployment guide with one-click button template.

### Changed
- `src/lib/transcript.ts` — multi-language auto-fallback: language error → retry without language constraint → return detected language + `note` field in result.
- `package.json` — `dashboard` and `monitor` scripts added; version bumped to 0.5.0.

## [0.4.0] — 2026-05-23

### Added
- `src/lib/disk-cache.ts` — Persistent JSON file cache with 7-day TTL. Stored in `$CLAUDE_PLUGIN_DATA/cache/transcripts/` or `.cache/transcripts/`. Survives MCP server restarts.
- `youtube_summarize` — Chapter-aligned key-sentence extraction with topic tag inference and compression ratio. Reduces a 50k-token transcript to ~10k while preserving structure and key signal. Uses heuristic importance scoring (length, numbers, causal language) — no LLM required.
- `youtube_get_comments` — Top or newest comments with like count, reply count, pin status, and creator-reply flag. Graceful fallback for videos with disabled comments.
- `youtube_get_related` — YouTube's "Up next" recommended videos for a given video ID.

### Changed
- `src/lib/transcript.ts` — Rate-limit detection with exponential back-off retry (3 attempts, 1.5s base delay doubling per retry, transient errors only). Disk cache is checked before network and written after a successful fetch.
- `package.json` — version bumped to 0.4.0

## [0.3.0] — 2026-05-23

### Added
- `src/lib/cache.ts` — TTLCache class with LRU-style eviction; shared instances for video (5 min), search (2 min), channel (10 min), playlist (5 min), trending (10 min)
- `youtube_get_trending` tool — trending videos by category (now/music/gaming/movies), 10-min cache
- `youtube_batch_transcript` tool — parallel transcripts for 2–10 videos at once
- `integrations/agno_agent.py` — Agno SDK production agent with all 11 tools, SQLite session storage, and 8 ARM-optimized example workflows
- `integrations/superagi_toolkit.py` — SuperAGI ToolKit adapter for GUI-driven autonomous deployments
- `YouTube_for_AI_Agents_Blueprint.md` — living project blueprint with roadmap, architecture, ARM framework, and framework assessment
- ARM onboarding examples in `skills/youtube/SKILL.md` — discovery, research, creation, and media workflows

### Changed
- `src/lib/innertube.ts` — `search`, `getVideoInfo`, `getChannelInfo`, `getChannelVideos`, `getPlaylist` all read/write shared TTL cache; added `getTrending` function
- `src/tools/transcript.ts` — transcript + video info fetched concurrently with `Promise.allSettled` (~40% faster on first call)
- `package.json` — version bumped to 0.3.0

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
