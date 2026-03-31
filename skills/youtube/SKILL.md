---
name: youtube
description: YouTube research — search, transcripts, video info, channel browsing. Use for any YouTube-related research task.
---

# YouTube Research

You have access to YouTube research tools via MCP.

## First-Use Auth Check

On the first tool call in a session, check the `authenticated` field in the response:
- If `authenticated: true` — good, proceed normally.
- If `authenticated: false` — run `node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs" --status` to check whether auth is configured.
- If auth is not configured, ask for user consent first, then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/extract-cookies.mjs"` (or route them through `/youtube:setup`). The script handles Chrome detection, launching, and cookie extraction. The only thing it can't automate is the user being logged into YouTube — if auth cookies are missing after extraction, tell the user to log into YouTube in Chrome and re-run setup.

After setup, the InnerTube instance needs to be recreated to pick up the new cookies. Re-invoke the tool — it will use the fresh cookies.

## Tools

All parameters use **camelCase**. Required params marked with *.

- **youtube_search** — Find videos by query. Params: `query`*, `limit` (max 50), `type` ("video"|"channel"|"playlist"), `uploadDate` ("all"|"today"|"week"|"month"|"year"), `duration` ("all"|"short"|"medium"|"long"), `sortBy` ("relevance"|"date"|"views"|"rating"). Returns titles, channels, views, duration, channelIds. **When the user asks for "today's" or "recent" content, always use `uploadDate: "today"` or `uploadDate: "week"`.** When they want newest first, combine with `sortBy: "date"`.
- **youtube_get_transcript** — Get what was said in a video. Params: `videoId`*, `language` (default "en"). Returns timestamped segments and cleaned full text.
- **youtube_get_video_info** — Get detailed metadata. Params: `videoId`*. Returns description, tags, chapters, likes.
- **youtube_get_channel_videos** — List a channel's videos. Params: `channelUrl`* (@handle, URL, or channel ID), `limit` (max 500), `sort` ("newest"|"popular"|"oldest").

## Transcript Analysis

Two approaches, in order of reliability:

### Approach 1: Fetch-then-delegate (preferred)
Call `youtube_get_transcript(videoId: "...")` yourself, then spawn a **general-purpose agent** (or transcript-analyzer) with the transcript text embedded in the prompt. This guarantees the transcript is real data, not hallucinated.

### Approach 2: Transcript-analyzer agent
Spawn the **transcript-analyzer** subagent with the video ID. It calls the MCP tools itself and returns analysis. Runs on sonnet. Accepts custom instructions.

- **Default analysis:** Key points, actionable takeaways, notable quotes with timestamps, topic tags.
- **Custom analysis:** Pass specific instructions for what to extract. Examples:
  - "Extract every business idea mentioned with estimated costs"
  - "List all tools and software recommended"
  - "Rate the advice quality 1-10 with reasoning"
  - "Just give timestamps where they discuss pricing"

If a transcript-analyzer agent returns `tool_uses: 0`, it hallucinated — discard the result and fall back to Approach 1.

## Composing Tools

Think step by step about what information you need and in what order. Compose tools freely:

- **Research a topic:** Search → pick best videos → analyze transcripts → synthesize
- **Explore a creator:** Get channel videos → sort by popular → analyze top content
- **Compare perspectives:** Search → get transcripts from multiple creators → compare advice
- **Deep dive:** Search → info for context → transcript for details → follow up on related channels

Present intermediate results and ask if the user wants to go deeper.
