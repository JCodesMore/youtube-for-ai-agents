# YouTube for Gemini CLI

Needs [Node.js](https://nodejs.org/) 22 or newer (`node --version`).

## Install

```bash
gemini extensions install https://github.com/JCodesMore/youtube-for-ai-agents
```

This adds the tools and loads the YouTube guide (`GEMINI.md`) into every session. Restart Gemini CLI, then `/mcp` should list `youtube`.

Gemini CLI has no subagents, so the video-watcher agent isn't available; Gemini watches videos itself.

## Just the tools

To add only the server, put this in `~/.gemini/settings.json`:

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

## Check, sign in, settings

```bash
npx @jcodesmore/youtube-for-ai-agents doctor   # full check from this computer
npx @jcodesmore/youtube-for-ai-agents login    # optional sign-in
npx @jcodesmore/youtube-for-ai-agents config   # settings
```

## Update and remove

```bash
gemini extensions update youtube
gemini extensions uninstall youtube
```
