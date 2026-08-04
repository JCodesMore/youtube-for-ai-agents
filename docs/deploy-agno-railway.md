# Deploy YouTube Research Agent to Railway (Agno)

Deploy YouTube for AI Agents as a production API service in ~5 minutes using [Agno](https://agno.com) and [Railway](https://railway.app).

---

## What you get

- **REST API** with 50+ endpoints — search, transcripts, trending, comments, summaries
- **SSE + WebSocket** streaming for real-time agent responses
- **Persistent sessions** — research history stored per user
- **Zero infra** — Railway handles scaling, HTTPS, and uptime

---

## One-click deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/JCodesMore/youtube-for-ai-agents)

After clicking:
1. Set `ANTHROPIC_API_KEY` in the Railway environment variables
2. Railway builds and deploys both services (`youtube-mcp` + `youtube-agent`)
3. Open the generated `*.railway.app` URL

---

## Manual deploy

### Prerequisites
- [Railway CLI](https://docs.railway.app/develop/cli): `npm install -g @railway/cli`
- `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com)

### Steps

```bash
# 1. Login
railway login

# 2. Create project
railway init

# 3. Set env var
railway variables set ANTHROPIC_API_KEY=sk-ant-...

# 4. Deploy
railway up --dockerfile Dockerfile.agno
```

Railway auto-detects the `railway.json` config below and sets up:
- Port `7777` → public HTTPS URL
- Persistent volume at `/data` for sessions and cache

---

## `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.agno"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## Local test with Docker Compose

```bash
# Build and start both services
ANTHROPIC_API_KEY=sk-ant-... docker compose -f docker-compose.agno.yml up --build

# Open the Agno Playground
open http://localhost:7777
```

---

## Architecture on Railway

```
Railway Project
├── youtube-mcp    (Node 20, port 3000 — internal only)
│   └── dist/index.js  — MCP stdio server wrapped by Agno MCPTools
└── youtube-agent  (Python 3.12, port 7777 — public)
    └── integrations/agno_agent.py
        ├── Serves Agno Playground API
        ├── Routes to MCP tools via subprocess
        └── Stores sessions in /data/agno_youtube.db
```

---

## Optional: Channel monitor as a cron job

In Railway → your project → **New** → **Cron Job**:

```
Schedule:   0 * * * *   (every hour)
Command:    node scripts/monitor-channel.mjs --channel @mkbhd --once --webhook $WEBHOOK_URL
```

Set `WEBHOOK_URL` to a Slack incoming webhook, Discord webhook, or any HTTP endpoint.

---

## Cost estimate

| Plan | Compute | Storage | Monthly |
|------|---------|---------|---------|
| Railway Hobby | 2 vCPU / 512 MB | 1 GB | ~$5 |
| Railway Pro | 4 vCPU / 2 GB | 10 GB | ~$20 |

YouTube InnerTube API used by this project is free (no API key required).
