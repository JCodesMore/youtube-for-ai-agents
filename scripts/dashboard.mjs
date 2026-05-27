#!/usr/bin/env node
/**
 * Local Research Dashboard — browse and search your cached YouTube transcripts.
 *
 * Usage:
 *   node scripts/dashboard.mjs [--port 4242]
 *   Then open http://localhost:4242 in your browser.
 *
 * Shows all transcripts cached by youtube_get_transcript / youtube_summarize.
 * Lets you search across titles, topics, and full transcript text.
 * No build step — pure HTML/JS served inline.
 */

import { createServer } from 'http';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const { values: args } = parseArgs({
  options: { port: { type: 'string', default: '4242' } },
  allowPositionals: false,
});

const PORT = parseInt(args.port);

// ── Cache reading ─────────────────────────────────────────────────────────

function getCacheDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA;
  return base ? join(base, 'cache', 'transcripts') : join(PROJECT_ROOT, '.cache', 'transcripts');
}

function loadCachedItems() {
  const dir = getCacheDir();
  if (!existsSync(dir)) return [];

  const items = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
      if (raw.version !== 1 || Date.now() > raw.expiresAt) continue;
      const v = raw.value;
      if (!v || !v.segments) continue;

      // Extract videoId from filename (format: videoId_lang.json)
      const videoId = file.replace(/\.json$/, '').split('_')[0];
      items.push({
        videoId,
        language: v.language ?? 'en',
        segmentCount: v.segments.length,
        fullText: v.fullText ?? '',
        preview: (v.fullText ?? '').slice(0, 200),
        expiresAt: new Date(raw.expiresAt).toISOString(),
      });
    } catch { /* corrupt cache file — skip */ }
  }
  return items;
}

// ── HTML UI ───────────────────────────────────────────────────────────────

function renderPage(items) {
  const itemsJson = JSON.stringify(items);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YouTube Research Dashboard</title>
<style>
  :root {
    --bg: #0f0f0f; --card: #1a1a1a; --border: #2a2a2a;
    --text: #e8e8e8; --muted: #888; --accent: #ff4444;
    --accent2: #ff8800; --green: #4caf50;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); min-height: 100vh; }

  header {
    background: var(--card); border-bottom: 1px solid var(--border);
    padding: 16px 24px; display: flex; align-items: center; gap: 16px;
    position: sticky; top: 0; z-index: 10;
  }
  .logo { font-size: 20px; font-weight: 700; white-space: nowrap; }
  .logo span { color: var(--accent); }
  .badge {
    background: var(--border); color: var(--muted); font-size: 12px;
    padding: 2px 8px; border-radius: 999px;
  }
  .search-wrap { flex: 1; max-width: 520px; }
  input[type=search] {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    color: var(--text); padding: 8px 14px; border-radius: 8px; font-size: 14px;
    outline: none; transition: border-color .15s;
  }
  input[type=search]:focus { border-color: var(--accent); }

  main { padding: 24px; max-width: 960px; margin: 0 auto; }
  .stats { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
  .stats strong { color: var(--text); }

  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; cursor: pointer; transition: border-color .15s, transform .1s;
  }
  .card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .card-id { font-size: 11px; color: var(--muted); font-family: monospace; margin-bottom: 6px; }
  .card-lang { display: inline-block; background: var(--border); border-radius: 4px; font-size: 11px; padding: 1px 6px; color: var(--muted); margin-bottom: 8px; }
  .card-preview { font-size: 13px; line-height: 1.5; color: var(--text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-meta { margin-top: 10px; font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; }
  .seg-count { color: var(--accent2); }

  .empty { text-align: center; padding: 80px 24px; color: var(--muted); }
  .empty h2 { font-size: 18px; margin-bottom: 8px; }
  .empty code { background: var(--card); padding: 2px 6px; border-radius: 4px; font-size: 13px; }

  /* Modal */
  .modal-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.75);
    z-index: 100; padding: 24px; overflow-y: auto;
  }
  .modal-overlay.open { display: flex; align-items: flex-start; justify-content: center; }
  .modal {
    background: var(--card); border: 1px solid var(--border); border-radius: 16px;
    width: 100%; max-width: 720px; padding: 24px; position: relative;
  }
  .modal-close {
    position: absolute; top: 16px; right: 16px; background: var(--border);
    border: none; color: var(--text); width: 32px; height: 32px; border-radius: 50%;
    font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .modal h2 { font-size: 16px; margin-bottom: 4px; }
  .modal-id { font-size: 12px; color: var(--muted); font-family: monospace; margin-bottom: 16px; }
  .modal-search { width: 100%; margin-bottom: 16px; }
  .transcript-body { max-height: 60vh; overflow-y: auto; font-size: 13px; line-height: 1.7; }
  .seg { padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; gap: 10px; }
  .seg:last-child { border-bottom: none; }
  .ts {
    flex-shrink: 0; font-size: 11px; font-family: monospace; color: var(--accent);
    text-decoration: none; min-width: 44px; padding-top: 2px;
  }
  .ts:hover { text-decoration: underline; }
  .seg-text { flex: 1; }
  .seg.highlight .seg-text { background: rgba(255,68,68,.15); border-radius: 4px; padding: 0 4px; }

  .action-bar { display: flex; gap: 10px; margin-top: 16px; }
  .btn {
    padding: 8px 16px; border-radius: 8px; border: none; font-size: 13px;
    cursor: pointer; font-weight: 500;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-secondary { background: var(--border); color: var(--text); }
  .btn:hover { opacity: .85; }

  mark { background: rgba(255,136,0,.3); color: inherit; border-radius: 2px; }
</style>
</head>
<body>

<header>
  <div class="logo">▶ <span>YouTube</span> Research</div>
  <span class="badge" id="count-badge">0 cached</span>
  <div class="search-wrap">
    <input type="search" id="global-search" placeholder="Search transcripts…" autocomplete="off">
  </div>
</header>

<main>
  <p class="stats" id="stats-line"></p>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none">
    <h2>No cached transcripts yet</h2>
    <p>Ask Claude to fetch a transcript:<br><code>Get the transcript for dQw4w9WgXcQ</code></p>
  </div>
</main>

<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal">
    <button class="modal-close" id="modal-close">×</button>
    <h2 id="modal-title">Transcript</h2>
    <div class="modal-id" id="modal-vid-id"></div>
    <input type="search" class="modal-search" id="modal-search"
           placeholder="Search within this transcript…" autocomplete="off">
    <div class="transcript-body" id="transcript-body"></div>
    <div class="action-bar">
      <a class="btn btn-primary" id="yt-link" target="_blank">Open in YouTube</a>
      <button class="btn btn-secondary" id="copy-btn">Copy text</button>
    </div>
  </div>
</div>

<script>
const ITEMS = ${itemsJson};
let currentItem = null;

function fmt(n) {
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n);
}
function fmtTs(sec) {
  const m = Math.floor(sec/60), s = sec%60;
  return m + ':' + String(Math.floor(s)).padStart(2,'0');
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function highlight(text, q) {
  if (!q) return esc(text);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'), 'gi');
  return esc(text).replace(re, m => '<mark>' + m + '</mark>');
}

const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const badgeEl = document.getElementById('count-badge');
const statsEl = document.getElementById('stats-line');
const globalSearch = document.getElementById('global-search');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalVidId = document.getElementById('modal-vid-id');
const modalSearch = document.getElementById('modal-search');
const transcriptBody = document.getElementById('transcript-body');
const ytLink = document.getElementById('yt-link');
const copyBtn = document.getElementById('copy-btn');

badgeEl.textContent = ITEMS.length + ' cached';

function renderGrid(q) {
  const filtered = q
    ? ITEMS.filter(it => it.fullText.toLowerCase().includes(q.toLowerCase()) || it.videoId.toLowerCase().includes(q.toLowerCase()))
    : ITEMS;

  statsEl.innerHTML = q
    ? '<strong>' + filtered.length + '</strong> of <strong>' + ITEMS.length + '</strong> transcripts match'
    : '<strong>' + ITEMS.length + '</strong> cached transcripts';

  grid.innerHTML = '';
  if (filtered.length === 0 && ITEMS.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  for (const it of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = \`
      <div class="card-id">\${esc(it.videoId)}</div>
      <div class="card-lang">\${esc(it.language)}</div>
      <div class="card-preview">\${highlight(it.preview, q)}\${it.fullText.length > 200 ? '…' : ''}</div>
      <div class="card-meta">
        <span class="seg-count">\${fmt(it.segmentCount)} segments</span>
        <span>expires \${new Date(it.expiresAt).toLocaleDateString()}</span>
      </div>
    \`;
    card.addEventListener('click', () => openModal(it, q));
    grid.appendChild(card);
  }
}

function openModal(item, globalQ) {
  currentItem = item;
  modalTitle.textContent = item.videoId;
  modalVidId.textContent = item.language + ' · ' + fmt(item.segmentCount) + ' segments';
  ytLink.href = 'https://www.youtube.com/watch?v=' + item.videoId;
  modalSearch.value = globalQ || '';
  renderTranscript(globalQ || '');
  modalOverlay.classList.add('open');
}

function renderTranscript(q) {
  const segs = currentItem._segments || currentItem.fullText.split(/(?<=[.!?]) +/);
  // We stored fullText only; display as paragraphs
  const text = currentItem.fullText;
  if (!text) { transcriptBody.innerHTML = '<p style="color:var(--muted)">No text available.</p>'; return; }

  if (!q) {
    transcriptBody.innerHTML = '<p style="line-height:1.8">' + esc(text) + '</p>';
    return;
  }

  // Highlight query in the text
  transcriptBody.innerHTML = '<p style="line-height:1.8">' + highlight(text, q) + '</p>';
  // Scroll to first mark
  const firstMark = transcriptBody.querySelector('mark');
  if (firstMark) firstMark.scrollIntoView({ block: 'center' });
}

modalSearch.addEventListener('input', () => renderTranscript(modalSearch.value.trim()));

document.getElementById('modal-close').addEventListener('click', () => {
  modalOverlay.classList.remove('open');
  currentItem = null;
});
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) { modalOverlay.classList.remove('open'); currentItem = null; }
});

copyBtn.addEventListener('click', () => {
  if (!currentItem) return;
  navigator.clipboard.writeText(currentItem.fullText).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 1500);
  });
});

globalSearch.addEventListener('input', () => renderGrid(globalSearch.value.trim()));

renderGrid('');
</script>
</body>
</html>`;
}

// ── HTTP server ────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  if (req.url === '/api/items') {
    const items = loadCachedItems();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(items));
    return;
  }

  // Serve dashboard page
  const items = loadCachedItems();
  const html = renderPage(items);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`YouTube Research Dashboard → http://localhost:${PORT}`);
  console.log(`Cache dir: ${getCacheDir()}`);
  console.log(`Loaded ${loadCachedItems().length} cached transcript(s)`);
});

function getCacheDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA;
  return base ? join(base, 'cache', 'transcripts') : join(PROJECT_ROOT, '.cache', 'transcripts');
}
