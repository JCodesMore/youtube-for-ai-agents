# YouTube for OpenCode

Needs [Node.js](https://nodejs.org/) 22 or newer (`node --version`).

## Install

Add the plugin to `opencode.json` (`~/.config/opencode/opencode.json` for every project):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["youtube@git+https://github.com/JCodesMore/youtube-for-ai-agents.git"]
}
```

Restart OpenCode. The plugin registers the `youtube` server and the YouTube skill on its own; `opencode mcp list` should show `youtube` connected.

## Just the tools

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "youtube": {
      "type": "local",
      "command": ["npx", "-y", "@jcodesmore/youtube-for-ai-agents"]
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

Pin a release by adding `#v0.3.0` to the plugin URL. To remove, delete the `youtube` entries from `opencode.json`.
