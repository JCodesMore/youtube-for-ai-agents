# YouTube for Gemini CLI

## Quick Install

```bash
gemini extensions install https://github.com/JCodesMore/youtube-mcp
```

This installs the MCP server and context files automatically.

## Manual MCP Config

If you prefer not to use the extension system, add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "@jcodesmore/youtube-mcp"]
    }
  }
}
```

> **Note:** The npx method requires the package to be published to npm.

## What You Get

- **6 MCP tools**: `youtube_search`, `youtube_get_transcript`, `youtube_get_video_info`, `youtube_get_channel_info`, `youtube_get_channel_videos`, `youtube_get_playlist`
- **Context file**: Research guide and tool reference loaded automatically via `GEMINI.md`

The `video-watcher` agent is not available on Gemini CLI. To watch a video, call `youtube_get_transcript` directly and analyze the result in the current session.

## Verify

Start a new session and try:

```
Search YouTube for "MCP tutorial"
```

The `youtube_search` tool should be available and return results.

## Authentication (optional)

The plugin works out of the box in anonymous mode. For personalized results (recommendations, watch history):

```bash
git clone https://github.com/JCodesMore/youtube-mcp.git /tmp/youtube-mcp
cd /tmp/youtube-mcp && npm install && node scripts/extract-cookies.mjs
```

This launches Chrome, extracts YouTube cookies, and stores them locally in `.cookies.json`.

## Updating

```bash
gemini extensions install https://github.com/JCodesMore/youtube-mcp
```

To pin a specific version:

```bash
gemini extensions install https://github.com/JCodesMore/youtube-mcp --ref=v0.1.0
```

## Uninstalling

```bash
gemini extensions uninstall youtube
```
