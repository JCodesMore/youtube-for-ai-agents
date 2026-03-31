# YouTube for Claude Code

## Quick Install

```bash
/plugin marketplace add JCodesMore/jcodesmore-plugins
/plugin install youtube@jcodesmore-plugins
```

This installs the full plugin: MCP tools, skills, and agents.

## What You Get

- **6 MCP tools**: `youtube_search`, `youtube_get_transcript`, `youtube_get_video_info`, `youtube_get_channel_info`, `youtube_get_channel_videos`, `youtube_get_playlist`
- **Skills**: `/youtube` (research guide), `/youtube:setup` (configuration wizard)
- **Agents**: `transcript-analyzer` (fetches and analyzes video transcripts)

## Verify

Start a new session and try:

```
Search YouTube for "MCP tutorial"
```

All `youtube_*` tools should be available.

## Configuration

Run the setup wizard to configure defaults:

```
/youtube:setup
```

Or use the CLI directly:

```bash
node scripts/config.mjs --show
node scripts/config.mjs --set search.defaultLimit 20
node scripts/config.mjs --reset
```

Run these commands from the plugin root directory.

## Authentication (optional)

The plugin works out of the box in anonymous mode. For personalized results (recommendations, watch history):

1. Run `/youtube:setup`
2. Follow the guided walkthrough to extract cookies from Chrome

Cookies are stored locally in the plugin data directory (`CLAUDE_PLUGIN_DATA`) and never transmitted anywhere. If `CLAUDE_PLUGIN_DATA` is not set, the script falls back to `.cookies.json` in the current directory.

## Updating

```bash
/plugin update youtube
```

## Uninstalling

```bash
/plugin uninstall youtube
```
