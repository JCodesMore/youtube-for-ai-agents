# YouTube for AI Agents

<a href="https://www.npmjs.com/package/@jcodesmore/youtube-for-ai-agents"><img src="https://img.shields.io/npm/v/@jcodesmore/youtube-for-ai-agents" alt="npm" /></a> <a href="https://github.com/JCodesMore/youtube-for-ai-agents/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 License" /></a> <a href="https://discord.gg/babcVNJBet"><img src="https://img.shields.io/discord/1400896964597383279?label=discord" alt="Discord" /></a>

Give your AI coding agent the ability to use YouTube — search for videos, watch and analyze content, browse channels, and explore playlists. Built on MCP, works with Claude Code and other compatible agents.

## Tools

| Tool | Description |
|------|-------------|
| `youtube_search` | Search YouTube for videos, channels, or playlists. Filter by upload date, duration, and sort order. |
| `youtube_get_transcript` | Get timestamped transcript text from a video. Supports format options, time range filtering, and segment limits. |
| `youtube_get_video_info` | Get video metadata with brief/standard/full detail levels (title, description, tags, chapters, likes). |
| `youtube_get_channel_info` | Get channel metadata — name, handle, description, subscriber count, country. |
| `youtube_get_channel_videos` | List a channel's uploads. Sort by newest, popular, or oldest. Accepts @handle, URL, or channel ID. |
| `youtube_get_playlist` | Get a playlist's metadata and video list with positions. |

## Skills

| Skill | Description |
|-------|-------------|
| `/youtube:setup` | Guided setup wizard — configure search mode (anonymous/personalized) and plugin settings. |
| `/youtube` | YouTube research guide — tool usage, parameter reference, and transcript analysis workflows. |

## Agents

| Agent | Description |
|-------|-------------|
| `video-watcher` | Watches a video and reports back — key points, takeaways, notable quotes, and topic tags. Accepts custom analysis instructions. |

## Installation

### Recommended: Claude Code

```bash
/plugin marketplace add JCodesMore/jcodesmore-plugins
/plugin install youtube@jcodesmore-plugins
```

Full plugin experience out of the box — MCP tools, skills, and agents.

### Platform Support

| Platform | MCP Tools | Plugin (Skills/Agents) | Setup |
|----------|:---------:|:----------------------:|-------|
| Claude Code | ✓ | ✓ | [Setup Guide](docs/README.claude-code.md) |
| Cursor | ✓ | ✓ | [Setup Guide](docs/README.cursor.md) |
| Codex | ✓ | — | [Setup Guide](docs/README.codex.md) |
| OpenCode | ✓ | ✓ (via plugin) | [Setup Guide](docs/README.opencode.md) |
| Gemini CLI | ✓ | — | [Setup Guide](docs/README.gemini-cli.md) |

### Any MCP Client (npx)

Works with Claude Desktop, Cursor, Windsurf, and any other MCP-compatible client:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "@jcodesmore/youtube-for-ai-agents"]
    }
  }
}
```

### Manual Install (from source)

```bash
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git
cd youtube-for-ai-agents
npm install
npm run build
```

Configure your MCP client to run the server:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["<path-to-youtube-for-ai-agents>/dist/index.js"]
    }
  }
}
```

### Verify

Start a new session and try any YouTube tool — search for a video or pull a transcript. All `youtube_*` tools should be available.

## Authentication

The plugin works in two modes:

### Anonymous (default)

Works out of the box with no setup. YouTube search results and metadata are publicly available. Some features like personalized recommendations are not available.

### Personalized (optional)

Uses your YouTube login cookies to access personalized results. To set up:

1. Run the setup skill inside Claude Code: `/youtube:setup`
2. Follow the guided walkthrough to extract cookies from Chrome

The setup creates a **dedicated Chrome profile** — your main browser profile is never accessed. Cookies are stored locally in the plugin data directory (`CLAUDE_PLUGIN_DATA`) and never transmitted anywhere. If `CLAUDE_PLUGIN_DATA` is not set, the script falls back to `.cookies.json` in the current directory.

## Configuration

Use the setup skill (`/youtube:setup`) to configure defaults for search limits, transcript language, channel video sorting, and more. Or use the CLI directly from the plugin root:

```bash
# View current settings
node scripts/config.mjs --show

# Change a setting
node scripts/config.mjs --set search.defaultLimit 20

# Reset to defaults
node scripts/config.mjs --reset
```

## Project Structure

```
youtube-for-ai-agents/
├── src/                        # TypeScript MCP server (portable)
│   ├── index.ts                # Server setup and tool registration
│   ├── config.ts               # Configuration defaults and types
│   ├── lib/                    # Core libraries
│   │   ├── innertube.ts        # YouTube API wrapper (youtubei.js)
│   │   ├── transcript.ts       # Transcript fetching and cleanup
│   │   ├── cookies.ts          # Cookie loading, validation, persistence
│   │   └── user-config.ts      # User configuration management
│   └── tools/                  # MCP tool handlers
│       ├── search.ts           # youtube_search
│       ├── transcript.ts       # youtube_get_transcript
│       ├── video-info.ts       # youtube_get_video_info
│       ├── channel-info.ts     # youtube_get_channel_info
│       ├── channel-videos.ts   # youtube_get_channel_videos
│       └── playlist.ts         # youtube_get_playlist
├── skills/                     # Skills (shared across platforms)
│   ├── setup/SKILL.md          # Setup wizard
│   └── youtube/SKILL.md        # Research guide
├── agents/                     # Agents (Claude Code + Cursor)
│   └── video-watcher.md
├── scripts/                    # Utility scripts
│   ├── config.mjs              # Configuration CLI
│   └── extract-cookies.mjs     # Chrome cookie extraction
├── docs/                       # Per-platform setup guides
│   ├── README.claude-code.md
│   ├── README.cursor.md
│   ├── README.codex.md
│   ├── README.opencode.md
│   └── README.gemini-cli.md
├── .claude-plugin/             # Claude Code plugin manifest
├── .cursor-plugin/             # Cursor plugin manifest
├── .opencode/plugins/          # OpenCode plugin loader
├── gemini-extension.json       # Gemini CLI extension manifest
└── GEMINI.md                   # Gemini CLI context file
```

## Tech Stack

- **[MCP SDK](https://modelcontextprotocol.io/)** — Model Context Protocol server implementation
- **[youtubei.js](https://github.com/LuanRT/YouTube.js)** — YouTube InnerTube API client
- **[youtube-transcript-plus](https://www.npmjs.com/package/youtube-transcript-plus)** — Transcript extraction
- **[Zod](https://zod.dev/)** — Runtime schema validation
- **[puppeteer-core](https://pptr.dev/)** — Chrome automation for cookie extraction (optional)

## Disclaimer

This plugin uses [youtubei.js](https://github.com/LuanRT/YouTube.js), an unofficial YouTube API client. It is **not affiliated with, endorsed by, or associated with YouTube or Google**. YouTube may change their internal APIs at any time, which could break functionality. Use at your own discretion.

## License

[Apache 2.0](LICENSE)
