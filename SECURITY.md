# Security Policy

## Supported versions

Security fixes go into the latest release. Update the plugin (`claude plugin update youtube@jcodesmore-plugins`) or let `npx -y` fetch the newest package.

## Reporting a vulnerability

Please don't post vulnerability details in a public issue, pull request or Discord message.

Use GitHub's private [Report a vulnerability](https://github.com/JCodesMore/youtube-for-ai-agents/security/advisories/new) form instead. Include, when you can:

- What the vulnerability is and what it could lead to
- The affected version, files or dependency
- Steps to reproduce, or a minimal proof of concept
- Any fix you'd suggest

We'll acknowledge the report as soon as we can, investigate, and coordinate with you before anything is disclosed. If the form isn't available, use [Discord](https://discord.gg/babcVNJBet) only to ask a maintainer for a private contact.

## Scope

In scope:

- The MCP server and command line in `src/` and the bundled `dist/`
- How sign-in cookies, settings and downloaded binaries are stored in `~/.youtube-for-ai-agents`
- The yt-dlp and ffmpeg downloads the plugin performs
- Plugin manifests, skills and agent instructions that introduce a concrete vulnerability

Out of scope: YouTube itself, vulnerabilities in yt-dlp or ffmpeg (report those upstream), and automated audit output without a demonstrated impact on this project.

## What the plugin stores

Your YouTube sign-in is saved only on your computer, in `~/.youtube-for-ai-agents/cookies.json` (readable only by your user where the OS supports it). It's sent only to YouTube. `login` signs in through a separate browser profile in `~/.youtube-for-ai-agents/browser-profile`. `logout` deletes both.
