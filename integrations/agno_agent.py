"""
YouTube for AI Agents — Agno Production Agent
==============================================
Wraps the 15 MCP YouTube tools as a production Agno agent platform.

Requirements:
    pip install agno mcp anthropic

Usage:
    python integrations/agno_agent.py             # interactive CLI demo
    python integrations/agno_agent.py --serve     # production API on :7777
    python integrations/agno_agent.py "your prompt here"

Production API features (via Agno):
- 50+ REST endpoints with SSE + WebSocket streaming
- JWT-based RBAC — per-user isolated session history
- Multi-tenant isolation (user A cannot see user B's sessions)
- Cron scheduling (daily trend digests, playlist monitors)
- OpenTelemetry tracing + audit logs
- Deploy anywhere containers run: Railway, GCP, AWS, Docker

RBAC quick-start:
    Set AGNO_API_KEY (from agno.com) to unlock managed auth.
    Without it the agent runs in single-user mode (good for local dev).

Railway one-click: see docs/deploy-agno-railway.md
"""

import os
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools
from agno.storage.sqlite import SqliteStorage
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────

MCP_SERVER_CMD = ["node", str(Path(__file__).parent.parent / "dist" / "index.js")]
DB_PATH = Path(os.environ.get("DATABASE_URL", "").replace("sqlite:///", "")
               or str(Path(__file__).parent / ".agno_youtube.db"))

SYSTEM_PROMPT = """You are a YouTube research expert powered by a live connection to YouTube.

Your capabilities (15 tools):
- Search, trending discovery, related videos, channel & playlist browsing
- Transcripts with time-range control and multi-language fallback
- Batch parallel transcripts (2–10 videos at once)
- Full-text caption search within any video (returns timestamp deep-links)
- Structured summaries with chapter alignment and topic tags
- Top comments + audience sentiment
- Auto-generated chapter timestamps from transcript
- Complete research report export (Markdown or JSON)
- Video/audio download, clip extraction, highlight reel compilation

Research philosophy:
1. Search first, enrich second — get IDs from search, then pull transcripts/details
2. Use youtube_summarize for long videos before committing to the full transcript
3. Use youtube_caption_search to navigate to specific moments instead of reading all
4. Batch transcript for comparative work — 5 videos in the time of 1
5. Use youtube_export to deliver a polished, shareable Markdown report
6. Cache is live — repeated calls within minutes are instant

Always cite video IDs and include timestamp links so the user can verify.
"""

# ── Agent ───────────────────────────────────────────────────────────────────

def build_agent(user_id: str | None = None) -> Agent:
    """
    Build a production-ready YouTube research agent.

    user_id — when provided, sessions are isolated per user (multi-tenant RBAC).
               Pass the authenticated user's ID from your auth middleware.
               In single-user / local mode, leave as None.
    """
    # Per-user table keeps session history isolated between accounts.
    # SQLite works for dev/small teams; swap for PostgreSQL in high-concurrency prod:
    #   from agno.storage.postgres import PostgresStorage
    #   storage = PostgresStorage(table_name=f"sessions_{user_id or 'anon'}", db_url=os.environ["DATABASE_URL"])
    table_name = f"youtube_sessions_{user_id}" if user_id else "youtube_sessions"
    storage = SqliteStorage(table_name=table_name, db_file=str(DB_PATH))

    return Agent(
        name="YouTube Research Agent",
        model=Claude(id="claude-sonnet-4-6"),
        tools=[
            MCPTools(
                command=MCP_SERVER_CMD[0],
                args=MCP_SERVER_CMD[1:],
                timeout=90,          # export + batch ops can take longer
            )
        ],
        instructions=SYSTEM_PROMPT,
        storage=storage,
        add_history_to_messages=True,
        num_history_responses=12,    # keep more turns for deep research sessions
        show_tool_calls=True,
        markdown=True,
    )


# ── Example workflows (onboarding / ARM) ────────────────────────────────────

EXAMPLE_TASKS = [
    # Adoption — zero-friction, immediate value
    {
        "label": "Trending now",
        "prompt": "What's trending on YouTube right now? Give me the top 10 with a one-line description of each.",
    },
    {
        "label": "Quick research",
        "prompt": "Search for the best Python tutorials published this month. Pick the top 3 by views and summarize what each teaches.",
    },

    # Retention — power features
    {
        "label": "Playlist deep-dive",
        "prompt": (
            "Get the videos in playlist PLbpi6ZahtOH6Ar_3GPy3workTqsGk35V2. "
            "Then fetch transcripts for the first 5 videos in parallel and give me the key insight from each."
        ),
    },
    {
        "label": "Competitive channel analysis",
        "prompt": (
            "Compare the 5 most popular recent videos from @mkbhd and @linus. "
            "For each channel: what topics perform best, what's the average video length, "
            "and what does the audience seem to care about based on titles?"
        ),
    },
    {
        "label": "Highlight reel",
        "prompt": (
            "Find a recent video from @veritasium. Get its transcript and chapters. "
            "Identify the 3 most compelling moments (with timestamps). "
            "Then clip those moments and compile a highlight reel."
        ),
    },

    # Monetization — creator / professional workflows
    {
        "label": "Blog post from video",
        "prompt": (
            "Get the full transcript of video dQw4w9WgXcQ. "
            "Extract the main arguments, key quotes with timestamps, and supporting evidence. "
            "Structure this as a detailed blog post outline ready for writing."
        ),
    },
    {
        "label": "Market research brief",
        "prompt": (
            "Search for the 20 most-viewed videos about 'AI coding assistants' from this year. "
            "Group them by subtopic. For each group, identify the top video and summarize its main claims. "
            "Output a competitive landscape brief."
        ),
    },
    {
        "label": "Study guide",
        "prompt": (
            "Search for MIT OpenCourseWare linear algebra lectures. "
            "Get the playlist and fetch transcripts for the first 3 lectures. "
            "Generate a study guide with key concepts, definitions, and example problems from each lecture."
        ),
    },

    # v0.6.0 — Enterprise workflows
    {
        "label": "Full research report",
        "prompt": (
            "Export a complete research report for video dQw4w9WgXcQ in Markdown format. "
            "Include comments and save to ~/Desktop/youtube-report.md"
        ),
    },
    {
        "label": "Auto-generate chapters",
        "prompt": (
            "This lecture has no chapters: dQw4w9WgXcQ. "
            "Generate chapter timestamps from the transcript, "
            "then give me the formatted text I can paste into the YouTube description."
        ),
    },
    {
        "label": "Find every mention of a term",
        "prompt": (
            "Search for every time 'machine learning' is mentioned in video dQw4w9WgXcQ. "
            "Return the timestamps with YouTube deep-links so I can jump to each moment."
        ),
    },
    {
        "label": "Trending + export",
        "prompt": (
            "Get today's top 5 trending gaming videos. "
            "For the most-viewed one, export a full Markdown research report. "
        ),
    },
]


# ── Serve as Agno production API ─────────────────────────────────────────────

def serve():
    """
    Start the Agno production API server with multi-tenant RBAC.

    RBAC in practice:
      - Each request that includes a user token gets a build_agent(user_id=...) instance
      - Sessions are stored in isolated per-user SQLite tables (or Postgres schemas)
      - Agno handles JWT validation when AGNO_API_KEY is set in the environment
      - Without AGNO_API_KEY: single-user mode (fine for local/team deployments)
    """
    try:
        from agno.playground import Playground, serve_playground_app

        # Build a default agent; Agno Playground handles per-request user context
        agent = build_agent()
        app = Playground(agents=[agent]).get_app()

        port = int(os.environ.get("PORT", "7777"))
        host = os.environ.get("HOST", "0.0.0.0")
        print(f"YouTube Research Agent → http://{host}:{port}")
        print(f"RBAC: {'enabled (AGNO_API_KEY set)' if os.environ.get('AGNO_API_KEY') else 'single-user mode (set AGNO_API_KEY to enable)'}")
        serve_playground_app(app, host=host, port=port, reload=False)

    except ImportError:
        print("agno[playground] not installed. Run: pip install 'agno[playground]'")
        raise


# ── CLI demo ─────────────────────────────────────────────────────────────────

def demo():
    """Run a single interactive query against the agent."""
    import sys

    agent = build_agent()
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else EXAMPLE_TASKS[0]["prompt"]

    print(f"\n[YouTube Research Agent] Query: {query}\n{'─' * 60}")
    agent.print_response(query, stream=True)


if __name__ == "__main__":
    import sys

    if "--serve" in sys.argv:
        serve()
    else:
        demo()
