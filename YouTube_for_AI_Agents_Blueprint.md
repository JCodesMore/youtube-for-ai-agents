# YouTube for AI Agents — Living Blueprint
**Version:** 0.6.0 · **Updated:** 2026-05-23 · **Status:** Production

---

## Executive Summary

An MCP (Model Context Protocol) plugin that gives any AI coding agent full YouTube research capabilities — search, transcripts, video/channel/playlist metadata, trend discovery, video clipping, and batch processing. Works anonymously out of the box; personalized mode available via cookie-based auth.

**Current tool count:** 17 tools  
**Supported platforms:** Claude Code, Cursor, Codex, OpenCode, Gemini CLI  
**Distribution:** npm (`@jcodesmore/youtube-for-ai-agents`) + git clone  

---

## Architecture

```
src/
  index.ts             Entry point — registers 11 MCP tools, stdio transport
  config.ts            DEFAULTS + type exports for all configurable settings
  lib/
    cache.ts           TTL-based in-memory cache (video: 5min, search: 2min, channel: 10min)
    disk-cache.ts      ★ Persistent JSON file cache (transcripts: 7 days)
    innertube.ts       Singleton YouTube API wrapper (youtubei.js) + all data-fetch functions
    transcript.ts      Transcript fetch, disk-cache read/write, ★ exponential-backoff retry
    cookies.ts         Cookie load/save/validate/delete for personalized auth
    user-config.ts     User config overrides, deep-merge with DEFAULTS
    download.ts        yt-dlp wrapper for video/audio download + muxing
  tools/
    search.ts          youtube_search
    transcript.ts      youtube_get_transcript  (parallel fetch: transcript + video info)
    video-info.ts      youtube_get_video_info
    channel-info.ts    youtube_get_channel_info
    channel-videos.ts  youtube_get_channel_videos
    playlist.ts        youtube_get_playlist
    trending.ts        youtube_get_trending
    batch-transcript.ts youtube_batch_transcript
    summarize.ts       youtube_summarize
    comments.ts        youtube_get_comments
    related.ts         youtube_get_related
    caption-search.ts  youtube_caption_search
    chapters-edit.ts   ★ youtube_chapters_edit (NEW)
    export.ts          ★ youtube_export (NEW)
    download.ts        youtube_download
    clip.ts            youtube_clip
    highlight-reel.ts  youtube_highlight_reel

scripts/
  ensure-deps.mjs      SessionStart hook — auto-installs runtime deps, SHA-256 skip logic
  extract-cookies.mjs  Chrome DevTools cookie extractor for personalized auth
  start-mcp.mjs        MCP launch wrapper
  config.mjs           CLI config editor
  monitor-channel.mjs  Cron-ready new-video detector with webhook + state persistence
  monitor-playlist.mjs ★ Playlist change detector (added/removed/reordered) with webhook
  dashboard.mjs        Local research dashboard HTTP server (port 4242)

skills/
  setup/SKILL.md       Guided auth + settings setup wizard
  youtube/SKILL.md     Tool usage guide + ARM-optimized onboarding examples

agents/
  video-watcher.md     Subagent for structured video analysis + reporting

integrations/
  agno_agent.py        ★ Agno SDK wrapper — production agent platform
  superagi_toolkit.py  ★ SuperAGI toolkit adapter
```

★ = new or changed in v0.3.0

---

## Tool Manifest

| Tool | Purpose | Cache TTL |
|------|---------|-----------|
| `youtube_search` | Search videos, channels, playlists with filters | 2 min |
| `youtube_get_transcript` | Transcript with time range & format control | — |
| `youtube_get_video_info` | Video metadata (brief/standard/full detail) | 5 min |
| `youtube_get_channel_info` | Channel metadata by @handle/URL/ID | 10 min |
| `youtube_get_channel_videos` | Channel video list with sort | 2 min |
| `youtube_get_playlist` | Playlist + video list | 5 min |
| `youtube_get_trending` | Trending videos by category (now/music/gaming/movies) | 10 min |
| `youtube_batch_transcript` | Parallel transcripts for 2–10 videos at once | — |
| `youtube_summarize` | Chapter-aligned key-sentence extraction, topic tags, condensed text | — (disk) |
| `youtube_get_comments` | Top or newest comments with engagement stats | — |
| `youtube_get_related` | Recommended "Up next" videos for a given video | — |
| `youtube_caption_search` | Full-text search within a transcript → matches + context + timestamp links | — (disk) |
| `youtube_chapters_edit` | Auto-generate chapter timestamps via vocabulary-shift segmentation | — (disk) |
| `youtube_export` | Full research report (Markdown/JSON): metadata + sections + comments + transcript | — (disk) |
| `youtube_download` | Download video/audio to local file | — |
| `youtube_clip` | Extract timestamped clips + per-video highlight reel | — |
| `youtube_highlight_reel` | Combine clips across videos into one reel | — |

---

## Performance Profile

| Optimization | Impact | Where |
|---|---|---|
| In-memory TTL cache | Eliminates repeat API calls (200–800ms saved per hit) | `src/lib/cache.ts` + `innertube.ts` |
| Disk-persistent transcript cache | Survives server restarts; transcripts reuse across sessions (7-day TTL) | `src/lib/disk-cache.ts` |
| Parallel transcript+info fetch | ~40% faster transcript response on first call | `src/tools/transcript.ts` |
| Parallel batch transcript | N videos in ~time of 1 video (vs. N×time) | `src/tools/batch-transcript.ts` |
| Exponential backoff retry | Handles YouTube rate limits gracefully (3 retries, 1.5s/3s/6s) | `src/lib/transcript.ts` |
| Innertube singleton | No reconnect overhead between tool calls | `src/lib/innertube.ts` |
| `retrieve_player: false` | Skips unnecessary player data on every request | `src/config.ts` |
| Sentence-level extraction (summarize) | 50k-token transcript → ~10k while preserving key signal | `src/tools/summarize.ts` |
| Export parallel fetch | video info + summary + optional transcript + optional comments in one `Promise.allSettled` | `src/tools/export.ts` |
| TextTiling-inspired chapter segmentation | Vocabulary-shift novelty scores — no LLM or network call needed | `src/tools/chapters-edit.ts` |

---

## Auth System

```
Anonymous (default):   works immediately, no setup
Personalized:          cookies from CLAUDE_PLUGIN_DATA/cookies.json
                       extracted via scripts/extract-cookies.mjs
                       dedicated Chrome profile at ~/.youtube/chrome-profile/
```

Cookie/config files: gitignored, stored locally in `CLAUDE_PLUGIN_DATA` or `.cookies.json`/`.config.json`.

---

## ARM Framework (Adoption → Retention → Monetization)

### Adoption drivers
- Zero-config anonymous mode — works first `claude` session
- `youtube_get_trending` — immediate value, no research needed
- `youtube_search` with smart defaults — relevant results first call

### Retention drivers
- `youtube_batch_transcript` — power users process playlists in one call
- `youtube_clip` + `youtube_highlight_reel` — unique capability not available in other MCP plugins
- Personalized auth — search results improve, user invested in the tool

### Monetization paths (low/no cost to user)
- Plugin marketplace distribution (free, drives npm downloads)
- Agno platform wrapper (premium agent-as-service deployment)
- SuperAGI toolkit (enterprise autonomous agent deployments)
- Creator tool: transcript → blog post / study guide generation

---

## Platform Integrations

| Platform | Config | Notes |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` + `.mcp.json` | Marketplace install |
| Cursor | `.cursor-plugin/` | Shares skills/ and agents/ |
| OpenCode | `.opencode/plugins/youtube.js` | Dynamic loader |
| Gemini CLI | `gemini-extension.json` + `GEMINI.md` | `@` context includes |
| Codex | via `.mcp.json` | MCP server config |

---

## Framework Integration Assessment

### Agno ✅ Recommended
**Fit:** High. Agno is designed as an SDK for building agent platforms around any agent framework — exactly this use case.

**Best for:** Deploying YouTube-for-AI-Agents as a production API service with:
- 50+ REST endpoints (SSE + WebSocket) usable from any frontend
- JWT-based RBAC (multi-user, multi-tenant isolation)
- Cron scheduling (daily trending briefs, playlist monitoring)
- Human-approval gates (e.g., require confirmation before download)
- OpenTelemetry tracing + audit logs
- One-click deployment to Railway/GCP/AWS

**Use case example:** SaaS "YouTube Research Assistant" — users sign in, get their own research history, schedule daily trend digests.

**How to integrate:** See `integrations/agno_agent.py` — wraps all 11 MCP tools as Agno-compatible Python functions, exposes as a production agent endpoint.

### SuperAGI ⚠️ Optional / Heavier
**Fit:** Medium. SuperAGI is a full-stack autonomous agent framework with a web GUI, Docker deployment, and marketplace toolkits. More infrastructure than needed for pure API use.

**Best for:** Teams that want a visible, GUI-driven agent that:
- Shows step-by-step reasoning in a web interface
- Chains YouTube research into multi-step autonomous workflows (e.g., "research topic → write blog → post to Notion")
- Runs without requiring developers to write code (non-technical users)

**Tradeoff:** Docker-based, heavier setup, less actively maintained than Agno. Use Agno for API-first deployments; SuperAGI if you need the GUI.

**How to integrate:** See `integrations/superagi_toolkit.py` — YouTube tools as a SuperAGI ToolKit class, installable from their marketplace.

**Verdict:** Build Agno first. Add SuperAGI only if GUI-driven autonomous agents are a requirement.

---

## Roadmap

### ✅ v0.1.0 — Core
- [x] Search, transcript, video info, channel info, channel videos, playlist
- [x] Anonymous + personalized auth
- [x] Multi-platform plugin manifests (Claude Code, Cursor, OpenCode, Gemini, Codex)
- [x] Setup skill + YouTube research skill

### ✅ v0.2.0 — Media
- [x] Download, clip, highlight reel tools
- [x] Video duration retrieval
- [x] video-watcher subagent

### ✅ v0.3.0 — Production
- [x] In-memory TTL cache (search 2min / video 5min / channel 10min / playlist 5min / trending 10min)
- [x] Parallel transcript + video info fetch
- [x] `youtube_get_trending` tool (now/music/gaming/movies)
- [x] `youtube_batch_transcript` tool (2–10 videos in parallel)
- [x] ARM-optimized onboarding examples in skill
- [x] Agno production agent wrapper
- [x] SuperAGI toolkit adapter
- [x] Living blueprint (this file)

### ✅ v0.4.0 — Intelligence
- [x] `youtube_summarize` — chapter-aligned key-sentence extraction, topic tags, compression ratio
- [x] `youtube_get_comments` — top/newest comments with like count, reply count, pinned/creator flags
- [x] `youtube_get_related` — "Up next" recommended videos from video info watch_next_feed
- [x] Disk-persistent transcript cache (7-day TTL, stored in `CLAUDE_PLUGIN_DATA` or `.cache/`)
- [x] Rate-limit detection + exponential back-off retry (3 attempts, doubling delay)

### ✅ v0.5.0 — Platform
- [x] `youtube_caption_search` — full-text keyword search within a transcript, returns matches + context + `youtu.be?t=` deep-link per match
- [x] Multi-language auto-fallback — if requested language unavailable, retries without language constraint and returns detected language with a note
- [x] `scripts/monitor-channel.mjs` — cron-ready new-video detector with state file, webhook support, and JSON-line event stream
- [x] `scripts/dashboard.mjs` — local research dashboard (Node HTTP, port 4242), inline HTML+CSS+JS, transcript browse + full-text search + copy
- [x] Agno Railway deploy: `docker-compose.agno.yml`, `Dockerfile.node`, `Dockerfile.agno`, `docs/deploy-agno-railway.md`
- [x] `npm run dashboard` and `npm run monitor` scripts added to `package.json`

### ✅ v0.6.0 — Enterprise
- [x] `youtube_chapters_edit` — TextTiling-inspired vocab-shift segmentation → chapter titles + `formattedForDescription` paste-ready string
- [x] `youtube_export` — parallel fetch of info + summary + optional transcript + optional comments → Markdown or JSON research report with timestamp deep-links; optional disk write via `outputPath`
- [x] `scripts/monitor-playlist.mjs` — detects added/removed/reordered videos; state file + webhook + `--once` / `--interval` / `--threshold`
- [x] `railway.json` — single-service Railway deploy config (no Compose required)
- [x] `integrations/agno_agent.py` — per-user RBAC via isolated SQLite tables (swap to Postgres for prod); `AGNO_API_KEY` detection; `PORT`/`HOST` env vars; updated system prompt for all 17 tools

### 🔲 v0.7.0 — Ecosystem
- [ ] Notion export — POST research report to a Notion page via Notion API
- [ ] `youtube_transcript_translate` — translate transcript to any language via LibreTranslate (free, self-hostable)
- [ ] Live stream support — detect and transcribe live streams or premieres
- [ ] Plugin for VS Code / Zed — direct tool access from editor sidebar
- [ ] `youtube_channel_compare` — side-by-side stats for 2–5 channels in one call

---

## Changelog

### [0.6.0] — 2026-05-23
**Added**
- `src/tools/chapters-edit.ts` — `youtube_chapters_edit`. TextTiling-inspired algorithm: tokenise segments → compute Jaccard novelty at candidate break points → smooth → greedy peak selection with min-gap constraint → extract chapter titles from highest-scored sentences in each section. Returns `formattedForDescription` for direct YouTube paste.
- `src/tools/export.ts` — `youtube_export`. Parallel fetch (video info + summarize + optional transcript + optional comments). Markdown builder with metadata table, topic tags, section-by-section insights with `[timestamp](youtu.be?t=N)` links, chapters, condensed transcript block, top comments, tag cloud, and attribution footer. Also emits structured JSON. Optional `outputPath` writes to disk.
- `scripts/monitor-playlist.mjs` — playlist change detector. Diffs current vs stored video IDs and positions. Emits `playlist_video_added`, `playlist_video_removed`, `playlist_video_reordered` JSON-line events. `npm run monitor:playlist`.

**Changed**
- `integrations/agno_agent.py` — per-user session isolation via `build_agent(user_id=...)` → separate SQLite table per user; `DATABASE_URL` env var support; `PORT`/`HOST` env vars in serve(); `AGNO_API_KEY` detection message; updated system prompt for all 17 tools; MCP timeout raised to 90s; 4 new v0.6.0 example tasks.
- `package.json` — `monitor:playlist` script added; version bumped to 0.6.0.
- `railway.json` — added for single-service Railway deploy.

### [0.5.0] — 2026-05-23
**Added**
- `src/tools/caption-search.ts` — `youtube_caption_search` full-text search within a transcript. De-duplicates overlapping context windows; returns `youtubeLink` with `?t=` param per match for direct navigation.
- `scripts/monitor-channel.mjs` — cron-ready channel monitor. Persists seen video IDs to `$CLAUDE_PLUGIN_DATA/monitor/{channel}.json`. Supports `--once`, `--interval`, and `--webhook URL`. Emits JSON-line events to stdout.
- `scripts/dashboard.mjs` — single-file local research dashboard. Reads disk-cached transcripts, serves HTML+CSS+JS at `http://localhost:4242`, supports full-text search and copy-to-clipboard. No build step.
- `docker-compose.agno.yml` — two-service production stack (`youtube-mcp` + `youtube-agent`), optional monitor service (commented out).
- `Dockerfile.node` / `Dockerfile.agno` — minimal production images (Alpine Node 20, Python 3.12-slim).
- `docs/deploy-agno-railway.md` — Railway one-click deploy guide with cost estimates.

**Changed**
- `src/lib/transcript.ts` — multi-language auto-fallback: if requested language unavailable, retries with `language: undefined` and returns detected language with a `note` field.
- `package.json` — added `dashboard` and `monitor` npm scripts; version bumped to 0.5.0.

### [0.4.0] — 2026-05-23
**Added**
- `src/lib/disk-cache.ts` — Persistent JSON file cache (7-day TTL). Cache dir: `$CLAUDE_PLUGIN_DATA/cache/transcripts/` or `.cache/transcripts/`. Survives MCP server restarts; SHA-safe filename sanitization.
- `src/tools/summarize.ts` — `youtube_summarize` extracts key sentences per chapter/section using a heuristic importance scorer (length + numbers + causal connectors – filler/promotional). Returns topic tags, compression ratio, and condensed text (~20% of original segments).
- `src/tools/comments.ts` — `youtube_get_comments` with top/new sort, like count, reply count, pin status, creator-reply flag.
- `src/tools/related.ts` — `youtube_get_related` extracts `CompactVideo` items from `watch_next_feed` in the video info response.

**Changed**
- `src/lib/transcript.ts` — Added `withRetry()` (exponential backoff, 3 retries, transient-only); disk cache read before fetch, disk cache write after successful fetch.
- `package.json` — version bumped to 0.4.0

### [0.3.0] — 2026-05-23
**Added**
- `src/lib/cache.ts` — TTLCache class with LRU-style eviction; shared instances for video, search, channel, playlist, trending
- `src/tools/trending.ts` — `youtube_get_trending` with category filter and 10-min cache
- `src/tools/batch-transcript.ts` — `youtube_batch_transcript` processes 2–10 videos concurrently
- `integrations/agno_agent.py` — Agno SDK production agent wrapper with all 11 tools
- `integrations/superagi_toolkit.py` — SuperAGI ToolKit adapter
- ARM onboarding examples in `skills/youtube/SKILL.md`
- This blueprint

**Changed**
- `src/lib/innertube.ts` — all 5 data-fetch functions now read/write shared TTL cache
- `src/tools/transcript.ts` — transcript + video info fetched concurrently with `Promise.allSettled`
- `package.json` — version bumped to 0.3.0

### [0.2.0] — 2026-03-31
- Added download, clip, highlight reel tools, duration retrieval

### [0.1.6] — 2026-03-30
- Renamed transcript-analyzer → video-watcher

### [0.1.5] — 2026-03-30
- Humanized plugin personality; conversational result formatting

### [0.1.4] — 2026-03-30
- Fixed ESM `ERR_MODULE_NOT_FOUND` after marketplace install

### [0.1.3] — 2026-03-30
- SessionStart hook for auto-dep-install; dist/ uncommitted fix

### [0.1.1] — 2026-03-31
- Plugin manifest validation fixes; MCP startup reliability

### [0.1.0] — 2026-03-29
- Initial release: search, transcript, video/channel/playlist info, auth, skills, agents

---

*Blueprint maintained by DevFlow Bl · YouTube for AI Agents · Apache-2.0*
