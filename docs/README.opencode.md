# YouTube for OpenCode

## Quick Install (MCP Tools)

Add to your `opencode.json` (project-level or `~/.config/opencode/opencode.json` for global):

```json
{
  "mcp": {
    "youtube": {
      "type": "local",
      "command": ["npx", "-y", "@jcodesmore/youtube-for-ai-agents"]
    }
  }
}
```

Restart OpenCode. All 6 YouTube MCP tools will be available.

> **Note:** Requires the package to be published to npm. Until then, use the [Full Install](#full-install-with-plugin-system) below.

## Full Install (with Plugin System)

The OpenCode plugin system adds skills and context injection on top of MCP tools.

Add both the plugin and MCP server to your `opencode.json`:

```json
{
  "plugin": ["youtube@git+https://github.com/JCodesMore/youtube-for-ai-agents.git"],
  "mcp": {
    "youtube": {
      "type": "local",
      "command": ["node", "<path-to-clone>/dist/index.js"]
    }
  }
}
```

For the MCP server path, either:
- Clone the repo locally and point to its `dist/index.js`
- Or use the npx method from Quick Install (recommended)

```json
{
  "plugin": ["youtube@git+https://github.com/JCodesMore/youtube-for-ai-agents.git"],
  "mcp": {
    "youtube": {
      "type": "local",
      "command": ["npx", "-y", "@jcodesmore/youtube-for-ai-agents"]
    }
  }
}
```

Restart OpenCode. The plugin auto-installs via Bun and registers skills automatically.

## What You Get

- **MCP Tools**: `youtube_search`, `youtube_get_transcript`, `youtube_get_video_info`, `youtube_get_channel_info`, `youtube_get_channel_videos`, `youtube_get_playlist`
- **Skills** (plugin system only): YouTube research guide with tool reference and workflows

## Verify

Ask OpenCode:

```
What YouTube tools do I have?
```

All `youtube_*` tools should be listed.

## Authentication (optional)

The plugin works out of the box in anonymous mode. For personalized results:

```bash
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git /tmp/youtube-for-ai-agents
cd /tmp/youtube-for-ai-agents && npm install && node scripts/extract-cookies.mjs
```

Copy the resulting `.cookies.json` to the plugin's data directory.

## Updating

OpenCode re-fetches the plugin from git on each restart.

To pin a specific version:

```json
{
  "plugin": ["youtube@git+https://github.com/JCodesMore/youtube-for-ai-agents.git#v0.1.0"]
}
```

## Uninstalling

Remove the `youtube` entries from the `plugin` and `mcp` sections of your `opencode.json`.
