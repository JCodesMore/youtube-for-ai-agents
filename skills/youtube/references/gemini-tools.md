# Gemini CLI tool mapping

Skills name Claude Code tools. Use your Gemini CLI equivalent:

| Skill names | Gemini CLI |
|---|---|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `replace` |
| `Bash` | `run_shell_command` |
| `Skill` | `activate_skill` |

The YouTube tools (`youtube_search`, `youtube_get_transcript`, `youtube_get_video_info`, `youtube_get_frames`, `youtube_get_comments`, `youtube_get_channel_info`, `youtube_get_channel_videos`, `youtube_get_playlist`, `youtube_download`, `youtube_clip`, `youtube_highlight_reel`) come from the MCP server and keep their names.

There is no `video-watcher` subagent here: watch videos yourself with `youtube_get_transcript` in the current session.

`${CLAUDE_PLUGIN_ROOT}` in the skills means this extension's folder (`~/.gemini/extensions/youtube`). To check the server or sign in:

```bash
node ~/.gemini/extensions/youtube/dist/index.js doctor
node ~/.gemini/extensions/youtube/dist/index.js login
```
