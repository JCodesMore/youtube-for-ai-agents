# YouTube for Codex

## Quick Install

```bash
codex mcp add youtube -- npx -y @jcodesmore/youtube-for-ai-agents
```

That's it. All 6 YouTube MCP tools are now available.

> **Note:** Requires the package to be published to npm. Until then, use the [Full Install](#full-install-with-skills) below.

## Manual MCP Config

If you prefer to edit the config file directly, add to `~/.codex/config.toml`:

```toml
[mcp_servers.youtube]
command = "npx"
args = ["-y", "@jcodesmore/youtube-for-ai-agents"]
```

Restart Codex after editing.

## Full Install (with Skills)

For skills support (research guide, tool reference), clone and build:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/JCodesMore/youtube-for-ai-agents.git ~/.codex/youtube-for-ai-agents
   cd ~/.codex/youtube-for-ai-agents && npm install && npm run build
   ```

2. **Symlink skills:**

   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/youtube-for-ai-agents/skills/youtube ~/.agents/skills/youtube
   ```

   **Windows (PowerShell):**

   ```powershell
   git clone https://github.com/JCodesMore/youtube-for-ai-agents.git "$env:USERPROFILE\.codex\youtube-for-ai-agents"
   cd "$env:USERPROFILE\.codex\youtube-for-ai-agents"; npm install; npm run build
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\youtube" "$env:USERPROFILE\.codex\youtube-for-ai-agents\skills\youtube"
   ```

3. **Configure MCP server** in `~/.codex/config.toml`:

   ```toml
   [mcp_servers.youtube]
   command = "node"
   args = ["~/.codex/youtube-for-ai-agents/dist/index.js"]
   ```

4. **Restart Codex.**

## Verify

Run `/mcp` in Codex to check that the YouTube server is connected. Then try:

```
Search YouTube for "MCP tutorial"
```

## Authentication (optional)

The plugin works out of the box in anonymous mode. For personalized results:

```bash
cd ~/.codex/youtube-for-ai-agents && node scripts/extract-cookies.mjs
```

## Updating

**Quick install:** `codex mcp remove youtube` then re-add (npx fetches the latest version).

**Full install:**

```bash
cd ~/.codex/youtube-for-ai-agents && git pull && npm run build
```

Skills update instantly through the symlink.

## Uninstalling

**Quick install:**

```bash
codex mcp remove youtube
```

**Full install:**

```bash
codex mcp remove youtube
rm -f ~/.agents/skills/youtube
rm -rf ~/.codex/youtube-for-ai-agents
```
