#!/usr/bin/env node

// SessionStart hook — installs runtime dependencies into the plugin root
// (next to dist/) so ESM import resolution finds them naturally.
// Skips if node_modules + binaries are present and package.json hash matches.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const nodeModules = join(pluginRoot, 'node_modules');
const hashFile = join(nodeModules, '.package-hash');

// These binaries arrive via package postinstall scripts, which can silently
// no-op (network errors, ignore-scripts config) leaving an apparently-successful
// npm install with broken download/clip tools. Verify presence and `npm rebuild`
// to retry if missing.
const exe = platform() === 'win32' ? '.exe' : '';
const requiredBinaries = [
  join(nodeModules, 'ffmpeg-static', `ffmpeg${exe}`),
  join(nodeModules, 'ytdlp-nodejs', 'bin', `yt-dlp${exe}`),
];

function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function binariesPresent() {
  return requiredBinaries.every(existsSync);
}

function readHashMarker() {
  try {
    return readFileSync(hashFile, 'utf8').trim();
  } catch {
    return null;
  }
}

function runNpm(args) {
  const result = spawnSync('npm', args, {
    cwd: pluginRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    shell: true,
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return !result.error && result.status === 0;
}

const currentHash = fileHash(join(pluginRoot, 'package.json'));

if (currentHash && readHashMarker() === currentHash && binariesPresent()) {
  process.exit(0);
}

process.stderr.write('[youtube] Installing dependencies...\n');

if (!runNpm(['install', '--omit=dev', '--no-audit', '--no-fund'])) {
  process.stderr.write('[youtube] Dependency install failed. MCP tools may not work until resolved.\n');
  process.exit(0);
}

if (!binariesPresent()) {
  process.stderr.write('[youtube] Binaries missing — rebuilding ffmpeg-static and ytdlp-nodejs...\n');
  if (!runNpm(['rebuild', 'ffmpeg-static', 'ytdlp-nodejs']) || !binariesPresent()) {
    process.stderr.write('[youtube] Binary download failed. youtube_download, youtube_clip, and youtube_highlight_reel will not work.\n');
    process.exit(0);
  }
}

// Hash marker is the "all good" signal — only write once binaries are verified,
// so a partial state retries next session instead of being remembered as done.
try { writeFileSync(hashFile, currentHash); } catch {}

process.stderr.write('[youtube] Dependencies ready.\n');
