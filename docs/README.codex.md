# YouTube for Codex

Needs [Node.js](https://nodejs.org/) 22 or newer (`node --version`).

## Install

```bash
codex mcp add youtube -- npx -y @jcodesmore/youtube-for-ai-agents
```

Or add it to `~/.codex/config.toml` yourself:

```toml
[mcp_servers.youtube]
command = "npx"
args = ["-y", "@jcodesmore/youtube-for-ai-agents"]
startup_timeout_sec = 60
```

Restart Codex. `/mcp` should list `youtube`. The first start downloads the package, so it takes a few seconds longer.

## Add the skill (recommended)

The skill teaches Codex to research and watch videos well. Copy it into your skills folder:

```bash
git clone --depth 1 https://github.com/JCodesMore/youtube-for-ai-agents.git /tmp/youtube-for-ai-agents
mkdir -p ~/.agents/skills
cp -r /tmp/youtube-for-ai-agents/skills/youtube ~/.agents/skills/youtube
```

On Windows (PowerShell):

```powershell
git clone --depth 1 https://github.com/JCodesMore/youtube-for-ai-agents.git "$env:TEMP\youtube-for-ai-agents"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
Copy-Item -Recurse "$env:TEMP\youtube-for-ai-agents\skills\youtube" "$env:USERPROFILE\.agents\skills\youtube"
```

## Check, sign in, settings

```bash
npx @jcodesmore/youtube-for-ai-agents doctor   # full check from this computer
npx @jcodesmore/youtube-for-ai-agents login    # optional sign-in
npx @jcodesmore/youtube-for-ai-agents config   # settings
```

## Update and remove

`npx -y` picks up new releases on its own. To remove: `codex mcp remove youtube`, and delete `~/.agents/skills/youtube` if you added the skill.
