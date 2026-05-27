# Gemini CLI Tool Mapping

Skills reference Claude Code tool names. When you encounter these, use your Gemini CLI equivalent:

| Skill references | Gemini CLI equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `read_file` |
| `Write` (file creation) | `write_file` |
| `Edit` (file editing) | `replace` |
| `Bash` (run commands) | `run_shell_command` |
| `Skill` tool (invoke a skill) | `activate_skill` |

## MCP Tools

The YouTube MCP tools (`youtube_search`, `youtube_get_transcript`, `youtube_get_video_info`, `youtube_get_channel_info`, `youtube_get_channel_videos`, `youtube_get_playlist`) work natively via MCP — no name translation needed.

## No subagent support

Gemini CLI does not support subagents. The `video-watcher` agent is not available. To watch a video, call `youtube_get_transcript` directly and analyze the result in the current session.

## Authentication

The plugin works out of the box in anonymous mode. For personalized results (recommendations, watch history), extract cookies manually:

```bash
node scripts/extract-cookies.mjs
```

This launches Chrome, extracts YouTube cookies, and stores them locally in `.cookies.json`. You must be logged into YouTube in Chrome for this to work.
