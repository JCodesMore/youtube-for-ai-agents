---
name: setup
description: Check that the YouTube plugin works, sign in to YouTube or out, and change its settings.
disable-model-invocation: true
---

# YouTube setup

Walk the user through setup like a friendly colleague. The plugin's command line does the work; run it with Bash and summarise what it says rather than pasting raw output.

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" <command>
```

## 1. Check it works

Run `doctor`. It checks Node, sign-in, settings, and a live search, video lookup and transcript from this computer.

- All OK: say so in a sentence, and mention whether they're signed in.
- `node` not found, or a version below 20: they need Node.js 22 or newer from https://nodejs.org, then a restart of Claude Code.
- Transcript failing with a rate limit or bot check: YouTube is limiting their network. Signing in (step 2) usually fixes it; a VPN or cloud machine makes it likelier.
- Anything else: show the FAIL lines and their hints.

## 2. Offer the choices

Everything works anonymously: search, transcripts, frames, comments, downloads. Signing in is optional and helps when YouTube rate-limits their network, for age-restricted videos, and for search results shaped by their own history. Offer:

1. **Sign in** — run `login`. A separate browser window opens (Chrome, Edge or Brave, in its own profile, so their everyday browser is untouched). They sign in to Google there; the command waits up to 10 minutes, saves the sign-in and closes the window. Run it in the background or with a long timeout, and tell them to finish signing in in that window.
2. **Sign out** — run `logout`.
3. **Change settings** — run `config` to show every setting and its value, then `config set <key> <value>` for each change (`config reset [key]` undoes). The useful ones:
   - `transcript.defaultLanguage`: a language code such as `en` to always translate into; empty means the language the video is spoken in.
   - `search.defaultLimit`, `channel.defaultVideoLimit`: how many results by default.
   - `download.defaultQuality`: `720p` by default.
   - `network.proxy`: an `http://user:pass@host:port` proxy for all YouTube traffic, for networks YouTube blocks.
   - `innertube.language`, `innertube.location`: interface language and country, such as `en` and `US`.
4. **Done** — nothing to change.

After a sign-in or settings change, run `doctor` again to confirm, and tell them to restart Claude Code (or run `/mcp` and reconnect `youtube`) so the running server picks it up.

Sign-in and settings live in `~/.youtube-for-ai-agents` (the `YOUTUBE_AI_AGENTS_HOME` environment variable moves it). The sign-in file holds their YouTube session, so it stays on this computer and out of chat.
