# YouTube for AI Agents

An MCP server that gives AI agents YouTube: search, transcripts, video details, frames, comments, channels, playlists, downloads, clips and reels. No API key. It ships as a Claude Code plugin, a Cursor plugin, a Gemini CLI extension, an OpenCode plugin and the npm package `@jcodesmore/youtube-for-ai-agents`, all from this one repository.

## Commands

- `npm install`: dev dependencies (everything is a dev dependency; see below)
- `npm run build`: bundle `src/` into `dist/index.js`
- `npm test`: unit tests (vitest), offline
- `npm run smoke`: the built server over real MCP against live YouTube; `--media` adds clips, frames and audio, `--offline` only starts it
- `npm run check`: typecheck, tests, build, and a check that committed `dist/` matches the source. Run it before every commit.
- `node dist/index.js doctor | login | logout | status | config`: the same CLI users get

## How it's put together

- `src/server.ts` registers the tools and the server instructions; `src/tools/*.ts` each export a zod input schema and a handler; `src/lib/` holds the YouTube client (`innertube.ts`), transcripts, media (`download.ts`, via yt-dlp and ffmpeg), sign-in, settings and the CLI pieces.
- `src/index.ts` is the CLI entry: no command runs the MCP server on stdio.
- `skills/youtube` is the agent-facing guide, `skills/setup` the `/youtube:setup` command, `agents/video-watcher.md` the subagent. `GEMINI.md` and `.opencode/plugins/youtube.js` reuse the same skill.

## Constraints that aren't obvious

- **`dist/` is committed and self-contained.** Plugin installs are a `git clone` with no build step, so esbuild bundles every dependency into `dist/index.js`. Commit `dist/` with any `src/` change; CI fails if they drift.
- **No lockfile, ever.** Claude Code runs `npm install` in any plugin whose root has `package.json` plus a lockfile, which would pull 130 MB of dev tools onto every user's machine. `.npmrc` sets `package-lock=false`; versions are pinned exactly in `package.json` instead.
- **stdout belongs to MCP.** Log with `src/lib/log.ts` (stderr, only with `YOUTUBE_AI_AGENTS_DEBUG=1`). A stray `console.log` in server code corrupts the protocol.
- **Errors go through `toolError`** (`src/lib/errors.ts`), which returns JSON with `kind`, `retryable` and a `hint` the agent can relay. Give new failure modes a kind and a hint.
- **User data lives in `~/.youtube-for-ai-agents`** (`YOUTUBE_AI_AGENTS_HOME` overrides): settings, sign-in, transcript cache, downloaded yt-dlp and ffmpeg. Never in the plugin folder, which updates replace.
- **Transcripts come from YouTube's transcript panel first** (`/youtubei/v1/get_panel`, the "Show transcript" button), then the caption files (`/api/timedtext`). The caption files rate-limit an IP with HTTP 429 for hours after a few dozen requests, even for a real browser; the panel kept working through that in Nov 2026. Only caption files can machine-translate. Keep live tests to a handful of videos.
- **Node 22+ is the documented floor** (`engines` says 20 so older installs still start). `login` needs the global `WebSocket` from Node 22.
- **All tools are read-only toward YouTube**; media tools only write files locally.

## Releasing

Versions live in `package.json`, both plugin manifests, `gemini-extension.json` and `server.json`; a unit test keeps them in step. The changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): add entries under `## [Unreleased]` as you go.

1. `node scripts/set-version.mjs X.Y.Z` sets every version and dates the Unreleased section.
2. `npm run check`, then commit `chore: release vX.Y.Z` on `main`.
3. Tag `vX.Y.Z` (annotated) and push the commit and tag.
4. Publish a GitHub Release for the tag, titled `vX.Y.Z - <theme>`, with a short intro, **Highlights**, **What's Changed** (the changelog section, with PR numbers) and a **Full Changelog** compare link.
5. Publishing the release runs `.github/workflows/release.yml`, which checks the tag against the manifests and publishes to npm (trusted publishing, with provenance) and the MCP Registry.
6. Bump `youtube`'s `version` in `JCodesMore/jcodesmore-plugins` `.claude-plugin/marketplace.json` so Claude Code offers the update.
