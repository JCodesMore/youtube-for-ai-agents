#!/usr/bin/env node
/**
 * Channel Monitor — poll a YouTube channel for new videos and emit alerts.
 *
 * Usage:
 *   node scripts/monitor-channel.mjs --channel @mkbhd --interval 3600
 *   node scripts/monitor-channel.mjs --channel @mkbhd --once          # one-shot check
 *   node scripts/monitor-channel.mjs --channel @mkbhd --webhook URL   # POST to URL on new video
 *
 * State is persisted to CLAUDE_PLUGIN_DATA/monitor/{channel}.json (or .monitor/).
 * Emits JSON lines to stdout — pipe to a logger, webhook relay, or Agno scheduler.
 *
 * Designed to run:
 *   - Standalone: node monitor-channel.mjs & (background process)
 *   - Via cron:   0 * * * * node /path/to/monitor-channel.mjs --channel @x --once
 *   - Via Agno:   wrap in agno.tools.function_tool + schedule via agno.cron
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── Arg parsing ────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    channel:  { type: 'string' },
    interval: { type: 'string', default: '3600' },    // seconds between polls
    limit:    { type: 'string', default: '10' },       // recent videos to check
    once:     { type: 'boolean', default: false },     // single check + exit
    webhook:  { type: 'string' },                      // POST URL for new videos
    quiet:    { type: 'boolean', default: false },     // suppress status messages
  },
  allowPositionals: false,
});

if (!args.channel) {
  console.error('Usage: node monitor-channel.mjs --channel @handle [--interval SECONDS] [--once] [--webhook URL]');
  process.exit(1);
}

const INTERVAL_MS = parseInt(args.interval) * 1000;
const LIMIT = parseInt(args.limit);

// ── State persistence ─────────────────────────────────────────────────────

function getStateDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA;
  return base ? join(base, 'monitor') : join(PROJECT_ROOT, '.monitor');
}

function safeChannelKey(channel) {
  return channel.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

function loadState(channel) {
  const fp = join(getStateDir(), `${safeChannelKey(channel)}.json`);
  try { return JSON.parse(readFileSync(fp, 'utf-8')); }
  catch { return { seenIds: [], lastCheck: null }; }
}

function saveState(channel, state) {
  const dir = getStateDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fp = join(dir, `${safeChannelKey(channel)}.json`);
  writeFileSync(fp, JSON.stringify(state, null, 2));
}

// ── Emit ───────────────────────────────────────────────────────────────────

function emit(event) {
  // Always emit as JSON line — machine-readable, pipelineable
  console.log(JSON.stringify(event));
}

function log(msg) {
  if (!args.quiet) console.error(`[monitor] ${msg}`);
}

// ── Webhook ────────────────────────────────────────────────────────────────

async function postWebhook(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    log(`Webhook → ${res.status}`);
  } catch (err) {
    log(`Webhook failed: ${err.message}`);
  }
}

// ── Core check ────────────────────────────────────────────────────────────

async function checkChannel(channel) {
  // Import the dist tools at runtime — MCP server must be built
  let getChannelVideos;
  try {
    const mod = await import(`${PROJECT_ROOT}/dist/lib/innertube.js`);
    getChannelVideos = mod.getChannelVideos;
  } catch (err) {
    log(`Could not import innertube: ${err.message}. Is 'npm run build' done?`);
    process.exit(1);
  }

  const state = loadState(channel);
  const seenSet = new Set(state.seenIds ?? []);

  log(`Checking ${channel} for new videos (last check: ${state.lastCheck ?? 'never'})`);

  let result;
  try {
    result = await getChannelVideos(channel, LIMIT, 'newest');
  } catch (err) {
    log(`Failed to fetch channel: ${err.message}`);
    return;
  }

  const newVideos = result.videos.filter(v => v.id && !seenSet.has(v.id));

  if (newVideos.length === 0) {
    log(`No new videos on ${result.channelName}`);
  } else {
    log(`Found ${newVideos.length} new video(s) on ${result.channelName}`);
    for (const v of newVideos) {
      const event = {
        event: 'new_video',
        channel: result.channelName,
        channelId: result.channelId,
        videoId: v.id,
        title: v.title,
        published: v.published,
        duration: v.duration,
        views: v.views,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        detectedAt: new Date().toISOString(),
      };
      emit(event);
      if (args.webhook) await postWebhook(args.webhook, event);
    }
  }

  // Update state — keep last 500 IDs to bound memory
  const allIds = [...new Set([...result.videos.map(v => v.id), ...state.seenIds])].slice(0, 500);
  saveState(channel, { seenIds: allIds, lastCheck: new Date().toISOString(), channelName: result.channelName });
}

// ── Main loop ─────────────────────────────────────────────────────────────

async function run() {
  await checkChannel(args.channel);
  if (args.once) return;

  log(`Polling every ${args.interval}s. Ctrl+C to stop.`);
  setInterval(() => checkChannel(args.channel).catch(err => log(`Error: ${err.message}`)), INTERVAL_MS);
}

run().catch(err => { console.error(err); process.exit(1); });
