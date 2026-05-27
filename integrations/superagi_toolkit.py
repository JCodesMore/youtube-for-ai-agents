"""
YouTube for AI Agents — SuperAGI ToolKit Adapter
=================================================
Exposes YouTube MCP tools as a SuperAGI ToolKit, installable from
the SuperAGI marketplace or dropped into a local SuperAGI deployment.

Requirements:
    - SuperAGI installation (docker compose or cloud)
    - The youtube-for-ai-agents MCP server running locally or via subprocess
    - pip install superagi (within SuperAGI's venv)

Installation (local SuperAGI):
    1. Copy this file into SuperAGI's `superagi/tools/` directory
    2. Restart the SuperAGI worker container
    3. The "YouTube" toolkit will appear in the agent configuration UI

NOTE: Agno is the recommended production path (see agno_agent.py).
SuperAGI is best for teams that need a visual GUI for autonomous agent runs
and step-by-step reasoning transparency. For API-first / headless deployments,
use Agno.
"""

import subprocess
import json
from typing import Optional, Type
from pydantic import BaseModel, Field

# SuperAGI imports — available inside SuperAGI's environment
try:
    from superagi.tools.base_tool import BaseTool, BaseToolkit, ToolConfiguration
except ImportError:
    # Stub for development outside SuperAGI
    class BaseTool:  # type: ignore
        name: str = ""
        description: str = ""
        args_schema: type = BaseModel  # type: ignore
        def _run(self, *args, **kwargs): raise NotImplementedError
    class BaseToolkit:  # type: ignore
        name: str = ""
        description: str = ""
        def get_tools(self): return []
        def get_env_keys(self): return []
    class ToolConfiguration:  # type: ignore
        def __init__(self, **kwargs): pass


MCP_CMD = ["node", "dist/index.js"]  # adjust path if needed


def _call_mcp(tool_name: str, args: dict) -> str:
    """Call the YouTube MCP server via stdio and return the result text."""
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": args},
    }
    try:
        proc = subprocess.run(
            MCP_CMD,
            input=json.dumps(request) + "\n",
            capture_output=True,
            text=True,
            timeout=30,
        )
        response = json.loads(proc.stdout.strip().split("\n")[-1])
        content = response.get("result", {}).get("content", [])
        return content[0].get("text", "") if content else ""
    except Exception as exc:
        return json.dumps({"error": str(exc)})


# ── Tool schemas ──────────────────────────────────────────────────────────────

class SearchInput(BaseModel):
    query: str = Field(..., description="YouTube search query")
    limit: Optional[int] = Field(None, description="Max results (1–50)")
    type: Optional[str] = Field(None, description="video | channel | playlist")
    upload_date: Optional[str] = Field(None, description="today | week | month | year | all")
    duration: Optional[str] = Field(None, description="short | medium | long | all")
    sort_by: Optional[str] = Field(None, description="relevance | date | views | rating")

class TranscriptInput(BaseModel):
    video_id: str = Field(..., description="YouTube video ID")
    language: Optional[str] = Field(None, description="Language code, e.g. 'en'")
    format: Optional[str] = Field(None, description="text | segments | both")
    start_time: Optional[float] = Field(None, description="Start offset in seconds")
    end_time: Optional[float] = Field(None, description="End offset in seconds")
    max_segments: Optional[int] = Field(None, description="Max segments to return")

class VideoInfoInput(BaseModel):
    video_id: str = Field(..., description="YouTube video ID")
    detail: Optional[str] = Field(None, description="brief | standard | full")

class ChannelInfoInput(BaseModel):
    channel: str = Field(..., description="@handle, URL, or channel ID")

class TrendingInput(BaseModel):
    category: Optional[str] = Field(None, description="now | music | gaming | movies")
    limit: Optional[int] = Field(None, description="Number of results (1–50)")

class BatchTranscriptInput(BaseModel):
    video_ids: list[str] = Field(..., description="2–10 YouTube video IDs")
    format: Optional[str] = Field(None, description="text | segments | both")
    max_segments: Optional[int] = Field(None, description="Max segments per video")


# ── Tool implementations ──────────────────────────────────────────────────────

class YouTubeSearchTool(BaseTool):
    name = "YouTube Search"
    description = "Search YouTube for videos, channels, or playlists with filters."
    args_schema: Type[BaseModel] = SearchInput

    def _run(self, query: str, limit=None, type=None, upload_date=None, duration=None, sort_by=None):
        args = {"query": query}
        if limit: args["limit"] = limit
        if type: args["type"] = type
        if upload_date: args["uploadDate"] = upload_date
        if duration: args["duration"] = duration
        if sort_by: args["sortBy"] = sort_by
        return _call_mcp("youtube_search", args)


class YouTubeTranscriptTool(BaseTool):
    name = "YouTube Get Transcript"
    description = "Get the transcript of a YouTube video, with optional time-range filtering."
    args_schema: Type[BaseModel] = TranscriptInput

    def _run(self, video_id: str, language=None, format=None, start_time=None, end_time=None, max_segments=None):
        args = {"videoId": video_id}
        if language: args["language"] = language
        if format: args["format"] = format
        if start_time is not None: args["startTime"] = start_time
        if end_time is not None: args["endTime"] = end_time
        if max_segments: args["maxSegments"] = max_segments
        return _call_mcp("youtube_get_transcript", args)


class YouTubeVideoInfoTool(BaseTool):
    name = "YouTube Get Video Info"
    description = "Get metadata for a YouTube video — title, views, duration, chapters, tags."
    args_schema: Type[BaseModel] = VideoInfoInput

    def _run(self, video_id: str, detail=None):
        args = {"videoId": video_id}
        if detail: args["detail"] = detail
        return _call_mcp("youtube_get_video_info", args)


class YouTubeChannelInfoTool(BaseTool):
    name = "YouTube Get Channel Info"
    description = "Get metadata for a YouTube channel — subscribers, videos, country, description."
    args_schema: Type[BaseModel] = ChannelInfoInput

    def _run(self, channel: str):
        return _call_mcp("youtube_get_channel_info", {"channelInput": channel})


class YouTubeTrendingTool(BaseTool):
    name = "YouTube Get Trending"
    description = "Get currently trending YouTube videos, optionally filtered by category."
    args_schema: Type[BaseModel] = TrendingInput

    def _run(self, category=None, limit=None):
        args: dict = {}
        if category: args["category"] = category
        if limit: args["limit"] = limit
        return _call_mcp("youtube_get_trending", args)


class YouTubeBatchTranscriptTool(BaseTool):
    name = "YouTube Batch Transcript"
    description = "Fetch transcripts for 2–10 videos in parallel. Ideal for playlist research."
    args_schema: Type[BaseModel] = BatchTranscriptInput

    def _run(self, video_ids: list, format=None, max_segments=None):
        args: dict = {"videoIds": video_ids}
        if format: args["format"] = format
        if max_segments: args["maxSegments"] = max_segments
        return _call_mcp("youtube_batch_transcript", args)


# ── Toolkit registration ──────────────────────────────────────────────────────

class YouTubeToolKit(BaseToolkit):
    name = "YouTube"
    description = (
        "Full YouTube research toolkit — search, transcripts, video & channel metadata, "
        "trending discovery, and parallel batch processing."
    )

    def get_tools(self):
        return [
            YouTubeSearchTool(),
            YouTubeTranscriptTool(),
            YouTubeVideoInfoTool(),
            YouTubeChannelInfoTool(),
            YouTubeTrendingTool(),
            YouTubeBatchTranscriptTool(),
        ]

    def get_env_keys(self):
        # No API key required — uses youtubei.js (InnerTube) anonymously
        return []
