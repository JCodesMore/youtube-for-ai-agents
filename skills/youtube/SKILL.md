---
name: youtube
description: YouTube for any task that touches it: finding videos, watching or summarising one (including a pasted link), quoting or fact-checking what was said, seeing what's on screen, reading comments, exploring a channel or playlist, downloading, clipping, or making a highlight reel.
---

# YouTube

You can search YouTube, watch videos (through their transcripts), see them (through frames), read the comments, browse channels and playlists, and download or clip them. Talk like a colleague who watched it for them: "I watched it, and the key point is…", not "transcript fetched".

Every tool takes a full YouTube URL or a bare ID, so pass along whatever the user gave you.

## Watching a video

1. Call `youtube_get_transcript`. It returns `[m:ss]` timestamped lines in the language the video is spoken in. Pass `language` only when the user wants another language; YouTube translates if needed.
2. Long videos come back in parts. When the header says `truncated`, call again with `startTime: nextStartTime` until you have what the task needs. For a targeted question, read the chapters from `youtube_get_video_info` (`detail: "full"`) and fetch only that range with `startTime`/`endTime`.
3. When what's on screen matters (slides, code, charts, a product, a recipe card), call `youtube_get_frames` at the relevant timestamps and look.
4. For audience reaction, corrections, or a recipe or link people shared, read `youtube_get_comments`.
5. Lead with the takeaway, then the detail. Cite moments as `[12:34](https://youtu.be/ID?t=754)` so the user can jump there.

For several videos at once, or a focused write-up, hand each video to the **video-watcher** agent with your instructions. If it reports no tool calls, it didn't watch: do it yourself.

## Searching

`youtube_search` with `type` video, channel or playlist, and the filters `uploadDate`, `duration` and `sortBy`. Leave `uploadDate` unset unless the user names a time window: "best videos about 2026" is a topic, not a filter, and a wider search you trim afterwards beats a narrow one that misses the best video. Raise `limit` when you expect to discard results. Present results as a short numbered list (bold title, channel, views, age, length), name your top pick and why, and offer to watch it.

## Channels and playlists

`youtube_get_channel_info` and `youtube_get_channel_videos` take an @handle, a channel URL or an ID; sort videos by `newest`, `popular` or `oldest`. `youtube_get_playlist` takes a playlist URL or ID.

## Downloads, clips and reels

- `youtube_download` saves a video (720p MP4 by default) or audio only (`type: "audio"`, M4A). Keep the default quality unless asked.
- `youtube_clip` cuts moments by timestamp, downloading only those ranges, and joins 2+ clips into a reel. Pick the moments from the transcript first.
- `youtube_highlight_reel` joins clip files from several videos, in the order given.
- Files go to the current folder unless the user names one. Report each file's path and size.
- The first media call downloads yt-dlp and ffmpeg automatically (about a minute); say so if it's slow.

Read [highlight-reels.md](references/highlight-reels.md) before building a reel: it covers picking self-contained moments, ordering them, and previewing the reel as text before cutting.

## When something fails

Tool errors are JSON with `kind`, `retryable` and `hint`. Relay the hint in plain words and adapt:

- `rate_limited` or `bot_check`: YouTube is limiting this network for a while. Tell the user, carry on with what doesn't need a transcript (search, details, comments), and suggest signing in with `/youtube:setup`.
- `no_captions`: the video has no transcript. Use its description and chapters, frames, or comments instead.
- `private`, `unavailable`, `age_restricted`: say so; signing in helps only with age restriction.

If no `youtube_*` tools exist in this session, the server didn't start. Run `node --version`: the plugin needs Node.js 20 or newer (22+ recommended) from https://nodejs.org. Then run `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor` and show the user what it says. After installing Node, they restart Claude Code. YouTube pages can't be read with web fetch, so fixing the server is the way forward.
