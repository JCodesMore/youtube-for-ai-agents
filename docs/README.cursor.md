# YouTube for Cursor

## Quick Install (MCP Tools)

Add to your `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

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

Restart Cursor. All 6 YouTube MCP tools will be available in Agent mode.

> **Note:** Requires the package to be published to npm. Until then, use the [Full Install](#full-install-with-skills--agents) below.

## What You Get (MCP only)

- `youtube_search` — Search YouTube for videos, channels, or playlists
- `youtube_get_transcript` — Get timestamped transcript text from a video
- `youtube_get_video_info` — Get video metadata (title, description, tags, chapters)
- `youtube_get_channel_info` — Get channel metadata (name, subscribers, description)
- `youtube_get_channel_videos` — List a channel's uploads
- `youtube_get_playlist` — Get playlist metadata and video list

## Full Install (with Skills + Agents)

Clone the repo into Cursor's local plugins directory for the full plugin experience (skills, agents, and MCP tools):

```bash
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git ~/.cursor/plugins/local/youtube-for-ai-agents
cd ~/.cursor/plugins/local/youtube-for-ai-agents && npm install && npm run build
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git "$env:USERPROFILE\.cursor\plugins\local\youtube-for-ai-agents"
cd "$env:USERPROFILE\.cursor\plugins\local\youtube-for-ai-agents"; npm install; npm run build
```

Restart Cursor after installation.

## Verify

Open Agent mode and try:

```
Search YouTube for "MCP tutorial"
```

The `youtube_search` tool should be available and return results.

## Authentication (optional)

The plugin works out of the box in anonymous mode. For personalized results, clone the repo and run the cookie extraction script:

```bash
cd ~/.cursor/plugins/local/youtube-for-ai-agents
node scripts/extract-cookies.mjs
```

## Updating

**MCP only:** npx fetches the latest version automatically on each restart.

**Full install:**

```bash
cd ~/.cursor/plugins/local/youtube-for-ai-agents && git pull && npm run build
```

## Uninstalling

**MCP only:** Remove the `youtube` entry from `.cursor/mcp.json`.

**Full install:**

```bash
rm -rf ~/.cursor/plugins/local/youtube-for-ai-agents
```

**Windows (PowerShell):**

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.cursor\plugins\local\youtube-for-ai-agents"
```
