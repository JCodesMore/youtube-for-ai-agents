---
name: youtube:setup
description: Configure YouTube plugin — search mode (anonymous/personalized) and plugin settings (defaults, language, locale)
---

# YouTube Plugin Setup

A guided walkthrough for configuring how the YouTube plugin works. Present this as a friendly, conversational experience.

## Step 1 — Check Current State

Run silently (don't show raw output to the user):
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs" --status
```
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --show
```

Determine the current auth mode:
- **"No cookies configured"** → currently anonymous
- **"Authenticated"** → currently personalized
- **"Cookie file exists but appears invalid"** → broken state, treat as anonymous

Store both the auth state and config output for use in the next step.

## Step 2 — Present the Welcome and Options

Greet the user and present the available options. Tailor based on current state. Always include the **Configure settings** option.

### If currently anonymous:

Present this to the user (use your own natural phrasing, but cover these points):

> **YouTube Plugin Setup**
>
> The YouTube plugin has two modes:
>
> **Anonymous** (current) — Ready to use right now. You get full access to search, transcripts, video info, and channel browsing. Results are based on general relevance.
>
> **Personalized** — Connects to your YouTube account via a dedicated Chrome window. Search results will reflect your watch history, subscriptions, and preferences — just like searching on youtube.com when you're logged in.
>
> What would you like to do?
> 1. **Keep anonymous** — nothing to set up, you're good to go
> 2. **Set up personalized results** — takes about a minute the first time
> 3. **Configure settings** — customize search defaults, transcript language, result limits, and more

### If currently personalized:

> **YouTube Plugin Setup**
>
> You're currently using **personalized mode** — search results reflect your YouTube account.
>
> What would you like to do?
> 1. **Keep personalized** — no changes needed
> 2. **Refresh cookies** — if results seem off or you switched Google accounts
> 3. **Switch to anonymous** — removes your cookies, uses general results instead
> 4. **Configure settings** — customize search defaults, transcript language, result limits, and more

### If broken state:

> **YouTube Plugin Setup**
>
> It looks like a previous setup didn't complete cleanly. Let's get you sorted out.
>
> The YouTube plugin has two modes:
>
> **Anonymous** — Works right now. Full access to search, transcripts, video info, and channel browsing with general results.
>
> **Personalized** — Connects to your YouTube account for results that match your watch history and subscriptions.
>
> Which would you prefer?
> 1. **Use anonymous** — I'll clean up the old config and you're good to go
> 2. **Set up personalized** — I'll walk you through it
> 3. **Configure settings** — customize search defaults, transcript language, result limits, and more

Wait for the user's response before proceeding.

## Step 3a — Anonymous Path

If the user chooses anonymous:

1. If cookies exist (switching from personalized or broken state), run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs" --reset
   ```

2. Confirm to the user:
   > All set! Cookies have been removed. You'll need to **restart your AI coding agent** for the change to take effect (the MCP server caches cookies in memory, so a simple plugin reload isn't enough).
   >
   > If you want personalized results later, just run `/youtube:setup` again.

Done.

## Step 3b — Personalized Path

If the user chooses personalized (or refresh):

### Privacy Consent

Before any extraction, present this to the user:

> **Privacy & Cookie Usage**
>
> To personalize your results, this plugin needs YouTube authentication cookies from a dedicated Chrome window. Here's what you should know:
>
> - **What we access:** YouTube authentication cookies only — used to identify your account
> - **How it works:** A separate Chrome window opens where you log into YouTube. We read cookies from that session — your main browser is never touched.
> - **Where they're stored:** Locally on your machine in the plugin data directory (`CLAUDE_PLUGIN_DATA`) for cookies, plus a dedicated Chrome profile at `~/.youtube/chrome-profile/`. They never leave your device and are never sent to any third party.
> - **What they're used for:** Passed to YouTube's API so search results reflect your subscriptions, watch history, and preferences
> - **You're in control:** Run `/youtube:setup` anytime to switch back to anonymous mode or delete stored cookies
>
> Do you want to proceed?

Wait for the user's response. If they decline, switch to anonymous mode instead.

### Run extraction

If the user consents, run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs"
```

Handle the output:

#### Success (exit code 0, "Authentication looks good")
Proceed to verification (Step 4).

#### Login required (exit code 3, output contains "LOGIN_REQUIRED")
Tell the user:
> A Chrome window has opened with a dedicated profile. Please:
> 1. **Log into your Google/YouTube account** in that window
> 2. Let me know when you're signed in
>
> This is a one-time step — your login will persist for future sessions. Your main Chrome browser is not affected.

Wait for the user to confirm they've logged in, then re-run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs"
```

If it returns LOGIN_REQUIRED again, ask the user to double-check they're logged in on youtube.com in the Chrome window that opened (not their regular browser).

#### Chrome not found (exit code 1, "Could not find Chrome")
Tell the user:
> I couldn't find Chrome installed in the usual location. Is it installed somewhere custom? If you can share the path, I can try again.

#### Other errors
Report the error clearly and suggest the user check that Chrome is installed and try again.

## Step 3c — Settings Path

If the user chooses "Configure settings":

### Gather current state

If you haven't already, run silently:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --show
```

Parse the output. Settings marked with `(*)` are user-customized overrides.

### Present settings by category

Show the user their current settings, grouped into categories. Use friendly names and explain what each does. Present one category at a time or all at once depending on how many the user seems interested in.

> **Plugin Settings**
>
> Here are your current settings (starred values are ones you've customized):
>
> **Search Defaults**
> - Default result count: 20 — how many results are returned when no limit is specified
> - Default type: video — filter by video, channel, or playlist
> - Default upload date: all — filter by recency (today, week, month, year, all)
> - Default duration: all — filter by length (short, medium, long, all)
> - Default sort: relevance — how results are ordered (relevance, date, views, rating)
>
> **Transcript Settings**
> - Default language: en — language code for transcripts
> - Max segments: 5000 — cap on transcript segments returned
> - Cleanup enabled: true — strip bracketed annotations and normalize whitespace
>
> **Channel Settings**
> - Default video limit: 30 — how many videos to return from a channel
> - Default sort: newest — order for channel videos (newest, popular, oldest)
>
> **Locale**
> - Language: en — YouTube interface language
> - Location: US — YouTube region for results
>
> Which category would you like to change? Or tell me a specific setting to update.

### Apply changes

When the user says what they want to change, run the appropriate command:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set <section.key> <value>
```

For example:
- "I want 30 search results by default" → `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set search.defaultLimit 30`
- "Change language to Spanish" → `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set innertube.language es` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --set transcript.defaultLanguage es`

If the script returns an error (e.g., invalid value or out of range), relay the constraint to the user in a friendly way and ask them to pick a valid option.

### After changes

After applying changes, confirm what was changed and offer to continue:

> Updated! Here's what changed:
> - Default search results: 20 → 30
>
> The MCP server reads settings at startup, so you'll need to **restart your AI coding agent** for changes to take effect.
>
> Want to change anything else, or are you all set?

If they want to change more, loop back to presenting the settings. If done, wrap up.

### Reset all settings

If the user asks to reset everything to defaults:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" --reset
```

Confirm:
> All settings have been reset to defaults. Restart your AI coding agent for changes to take effect.

## Step 4 — Verification

After successful cookie extraction, verify by running a quick search:

Use the `youtube_search` tool with a simple query (e.g., the user's name or a generic term like "programming tutorials").

Check the response for `"mode": "personalized"`.

If personalized:
> You're all set! Personalized mode is active — your YouTube searches will now reflect your account.
>
> If you ever want to switch back to anonymous or refresh your cookies, just run `/youtube:setup` again.

If still anonymous despite cookie extraction succeeding:
> The cookies were saved but the MCP server needs to restart to pick them up. Please **restart your AI coding agent**, then try a search — it should show personalized mode after that.
>
> If you ever want to switch back to anonymous or refresh your cookies, just run `/youtube:setup` again.

## Important Notes

- Never show raw script output to the user. Interpret it and present friendly messages.
- The script uses a **dedicated Chrome profile** — the user's main Chrome browser is never modified or accessed.
- Chrome does NOT need to be closed. The dedicated profile runs as a separate process.
- Cookie files are stored locally in the plugin's data directory. They never leave the user's machine.
- The dedicated Chrome profile persists at `~/.youtube/chrome-profile/` so the user only needs to log in once.
- Settings are stored in the plugin's persistent data directory alongside cookies. They survive plugin updates.
- When changing settings, always remind the user to restart their AI coding agent for changes to take effect.
