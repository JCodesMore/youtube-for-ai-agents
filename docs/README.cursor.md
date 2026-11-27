# YouTube for Cursor

Needs [Node.js](https://nodejs.org/) 22 or newer (`node --version`).

## Install

Add the server to `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` (one project):

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

Restart Cursor, and check **Settings → MCP** shows `youtube` enabled. The tools are available in Agent mode.

## Full plugin (skills and agent)

Cursor also loads this repository as a plugin, which adds the YouTube skill and the video-watcher agent on top of the tools:

```bash
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git ~/.cursor/plugins/local/youtube-for-ai-agents
```

On Windows (PowerShell):

```powershell
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git "$env:USERPROFILE\.cursor\plugins\local\youtube-for-ai-agents"
```

Restart Cursor. The plugin starts the server itself, so drop the `mcp.json` entry above if you added it. Update with `git pull` in that folder.

## Check, sign in, settings

```bash
npx @jcodesmore/youtube-for-ai-agents doctor   # full check from this computer
npx @jcodesmore/youtube-for-ai-agents login    # optional sign-in
npx @jcodesmore/youtube-for-ai-agents config   # settings
```
