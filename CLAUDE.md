# YouTube for AI Agents

MCP plugin providing YouTube tools for AI coding agents. Supports Claude Code, Cursor, Codex, OpenCode, and Gemini CLI.

## Architecture

```
src/index.ts          — Entry point. Registers 6 MCP tools, connects via stdio transport.
src/config.ts         — DEFAULTS object with all configurable settings and types.
src/tools/*.ts        — Tool handlers. Each exports inputSchema (zod) + handler function.
src/lib/innertube.ts  — Singleton YouTube API wrapper using youtubei.js.
src/lib/transcript.ts — Transcript fetching, HTML entity decoding, text cleanup.
src/lib/cookies.ts    — Cookie load/save/validate/delete for auth.
src/lib/user-config.ts — User config overrides, deep merge with defaults.
```

## Build

Always run `npm run build` after changing any file in `src/`. The compiled output goes to `dist/` and is committed to git (required for plugin marketplace distribution).

```bash
npm run build    # compile once
npm run dev      # watch mode
```

## Plugin Distribution

When installed via marketplace (`git clone`), the plugin needs:
- **`dist/`** committed to git — Claude Code doesn't run build steps after cloning.
- **`SessionStart` hook** (`scripts/ensure-deps.mjs`) — auto-installs runtime dependencies into the plugin root (next to `dist/`) on first session. Uses SHA-256 hash of `package.json` to skip on subsequent sessions. Deps install into `CLAUDE_PLUGIN_ROOT` (not `CLAUDE_PLUGIN_DATA`) because `NODE_PATH` does not work with ES modules — ESM resolution requires `node_modules` in the directory tree above the importing file.

**On every version bump:** run `npm run build`, commit `dist/`, push to GitHub, run `npm publish`, and update the version in `JCodesMore/jcodesmore-plugins` marketplace.json. Git and npm must stay in sync.

## Key Patterns

- **Zod schemas** define all tool inputs. Each tool file exports `fooInputSchema` and `handleFoo`.
- **InnerTube singleton** (`src/lib/innertube.ts`) — lazy-initialized, tracks auth state (personalized vs anonymous).
- **getConfig()** (`src/lib/user-config.ts`) — merges user overrides from `.config.json` with `DEFAULTS` from `config.ts`.
- **All tools are read-only** — annotated with `readOnlyHint: true`, `destructiveHint: false`.

## Auth System

Two modes:
- **Anonymous** — no cookies, works immediately. Some YouTube features unavailable.
- **Personalized** — uses cookies from `CLAUDE_PLUGIN_DATA/cookies.json` (falls back to `.cookies.json` if `CLAUDE_PLUGIN_DATA` is unavailable), extracted via `scripts/extract-cookies.mjs`. Creates a dedicated Chrome profile at `~/.youtube/chrome-profile/`.

Cookie/config files are gitignored and stored locally (`CLAUDE_PLUGIN_DATA` when available, otherwise local dotfiles like `.cookies.json` / `.config.json`).

## Skills & Agents

- `skills/setup/SKILL.md` — Guided setup wizard (auth + settings config)
- `skills/youtube/SKILL.md` — Tool usage guide and research workflows
- `agents/video-watcher.md` — Subagent that watches videos and reports back with analysis

## Platform Adapters

The MCP server (`src/`) is portable to any MCP client. Platform-specific files provide discovery, skills, and agents:

- `.claude-plugin/` — Claude Code plugin manifest
- `.cursor-plugin/` — Cursor plugin manifest (shares `skills/` and `agents/`)
- `.opencode/plugins/youtube.js` — OpenCode dynamic plugin loader (config hook + prompt transform)
- `gemini-extension.json` + `GEMINI.md` — Gemini CLI extension with `@` context includes and MCP server config
- `skills/youtube/references/gemini-tools.md` — Tool name mapping for Gemini

Per-platform setup guides live in `docs/README.{platform}.md`.

## Testing

No automated tests yet. To test manually:

```bash
npm run build
claude --plugin-dir .
# Then use any youtube_* tool in Claude Code
```
