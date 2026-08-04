#!/usr/bin/env node
/**
 * Playlist Monitor — track a YouTube playlist for changes over time.
 *
 * Detects:
 *   added     — videos newly in the playlist since last check
 *   removed   — videos no longer in the playlist
 *   reordered — videos whose position shifted by more than REORDER_THRESHOLD
 *
 * Usage:
 *   node scripts/monitor-playlist.mjs --playlist PLxxxxxx
 *   node scripts/monitor-playlist.mjs --playlist PLxxxxxx --once
 *   node scripts/monitor-playlist.mjs --playlist PLxxxxxx --webhook https://hooks.slack.com/...
 *
 * State: CLAUDE_PLUGIN_DATA/monitor/playlist_{id}.json  (or .monitor/)
 * Output: JSON lines to stdout — pipe to logger, webhook relay, or Agno scheduler.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const { values: args } = parseArgs({
  options: {
    playlist:  { type: 'string' },
    interval:  { type: 'string', default: '3600' },
    limit:     { type: 'string', default: '200' },
    once:      { type: 'boolean', default: false },
    webhook:   { type: 'string' },
    quiet:     { type: 'boolean', default: false },
    threshold: { type: 'string', default: '3' },   // min position shift to flag as reorder
  },
  allowPositionals: false,
});

if (!args.playlist) {
  console.error('Usage: node monitor-playlist.mjs --playlist PLxxxxxx [--interval SECONDS] [--once] [--webhook URL]');
  process.exit(1);
}

const INTERVAL_MS = parseInt(args.interval) * 1000;
const LIMIT = parseInt(args.limit);
const REORDER_THRESHOLD = parseInt(args.threshold);

// ── State ──────────────────────────────────────────────────────────────────

function getStateDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA;
  return base ? join(base, 'monitor') : join(PROJECT_ROOT, '.monitor');
}

function stateFile(playlistId) {
  return join(getStateDir(), `playlist_${playlistId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function loadState(playlistId) {
  try { return JSON.parse(readFileSync(stateFile(playlistId), 'utf-8')); }
  catch { return { videos: [], lastCheck: null, title: '' }; }
}

function saveState(playlistId, state) {
  const dir = getStateDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(stateFile(playlistId), JSON.stringify(state, null, 2));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emit(event) { console.log(JSON.stringify(event)); }
function log(msg) { if (!args.quiet) console.error(`[monitor-playlist] ${msg}`); }

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

// ── Core ───────────────────────────────────────────────────────────────────

async function checkPlaylist(playlistId) {
  let getPlaylist;
  try {
    const mod = await import(`${PROJECT_ROOT}/dist/lib/innertube.js`);
    getPlaylist = mod.getPlaylist;
  } catch (err) {
    log(`Cannot import innertube: ${err.message}. Run 'npm run build' first.`);
    process.exit(1);
  }

  const state = loadState(playlistId);
  const prevMap = new Map(state.videos.map(v => [v.id, v.position]));

  log(`Checking playlist ${playlistId} (last: ${state.lastCheck ?? 'never'})`);

  let result;
  try {
    result = await getPlaylist(playlistId, LIMIT);
  } catch (err) {
    log(`Failed to fetch playlist: ${err.message}`);
    return;
  }

  const currentVideos = result.videos.map(v => ({ id: v.id, title: v.title, position: v.position, channel: v.channel }));
  const currentIds = new Set(currentVideos.map(v => v.id));
  const prevIds = new Set(state.videos.map(v => v.id));

  const added = currentVideos.filter(v => !prevIds.has(v.id));
  const removed = state.videos.filter(v => !currentIds.has(v.id));
  const reordered = currentVideos.filter(v => {
    const prevPos = prevMap.get(v.id);
    return prevPos !== undefined && Math.abs(v.position - prevPos) >= REORDER_THRESHOLD;
  });

  const detectedAt = new Date().toISOString();
  const base = { playlistId, playlistTitle: result.title, detectedAt };

  if (added.length === 0 && removed.length === 0 && reordered.length === 0) {
    log(`No changes — ${currentVideos.length} videos, title: "${result.title}"`);
  }

  for (const v of added) {
    const event = { event: 'playlist_video_added', ...base, ...v, url: `https://www.youtube.com/watch?v=${v.id}` };
    emit(event);
    if (args.webhook) await postWebhook(args.webhook, event);
  }

  for (const v of removed) {
    const event = { event: 'playlist_video_removed', ...base, ...v };
    emit(event);
    if (args.webhook) await postWebhook(args.webhook, event);
  }

  for (const v of reordered) {
    const prevPos = prevMap.get(v.id);
    const event = { event: 'playlist_video_reordered', ...base, ...v, previousPosition: prevPos };
    emit(event);
    if (args.webhook) await postWebhook(args.webhook, event);
  }

  saveState(playlistId, {
    videos: currentVideos,
    lastCheck: detectedAt,
    title: result.title,
    videoCount: currentVideos.length,
  });
}

async function run() {
  // Strip query params if user pastes a full playlist URL
  let playlistId = args.playlist;
  try {
    const u = new URL(playlistId.startsWith('http') ? playlistId : `https://www.youtube.com/playlist?list=${playlistId}`);
    playlistId = u.searchParams.get('list') ?? playlistId;
  } catch { /* raw ID, keep as-is */ }

  await checkPlaylist(playlistId);
  if (args.once) return;

  log(`Polling every ${args.interval}s. Ctrl+C to stop.`);
  setInterval(() => checkPlaylist(playlistId).catch(e => log(`Error: ${e.message}`)), INTERVAL_MS);
}

run().catch(err => { console.error(err); process.exit(1); });
