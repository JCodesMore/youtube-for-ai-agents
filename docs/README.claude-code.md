# YouTube for Claude Code

Needs [Node.js](https://nodejs.org/) 22 or newer (`node --version`). Claude Code's own installer doesn't include Node, so install it first if that command fails.

## Install

From a terminal:

```bash
claude plugin install youtube --marketplace JCodesMore/jcodesmore-plugins
```

Or inside a Claude Code session:

```text
/plugin marketplace add JCodesMore/jcodesmore-plugins
/plugin install youtube@jcodesmore-plugins
```

Restart Claude Code. The Claude desktop app's Code tab shares these settings, so the terminal command installs it there too.

## What you get

- The 11 `youtube_*` tools (search, transcripts, video details, frames, comments, channels, playlists, downloads, clips, reels)
- The **youtube** skill, loaded when a task involves YouTube
- The **video-watcher** agent, for watching several videos in parallel
- **`/youtube:setup`**, which checks everything works and handles sign-in and settings

## Check it works

Ask *"Search YouTube for MCP tutorials"*. `/mcp` should list `youtube` as connected. For a full check from your computer (search, video details, a transcript, sign-in), run `/youtube:setup`.

## Sign in and settings

Optional. `/youtube:setup` walks you through both. Sign-in and settings live in `~/.youtube-for-ai-agents`.

## Update and remove

```bash
claude plugin update youtube@jcodesmore-plugins
claude plugin uninstall youtube@jcodesmore-plugins
```

## Working on the plugin

```bash
git clone https://github.com/JCodesMore/youtube-for-ai-agents.git
cd youtube-for-ai-agents
npm install
npm run build
claude --plugin-dir .
```
