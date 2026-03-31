# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
