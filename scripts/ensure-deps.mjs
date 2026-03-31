#!/usr/bin/env node

// SessionStart hook — installs runtime dependencies into the plugin root
// (next to dist/) so ESM import resolution finds them naturally.
// Skips if node_modules already exists and package.json hash matches.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const hashFile = join(pluginRoot, 'node_modules', '.package-hash');

function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const currentHash = fileHash(join(pluginRoot, 'package.json'));

// Skip if node_modules exists and package.json hasn't changed
if (existsSync(hashFile)) {
  try {
    if (readFileSync(hashFile, 'utf8').trim() === currentHash) {
      process.exit(0);
    }
  } catch {}
}

process.stderr.write('[youtube] Installing dependencies...\n');

const result = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: pluginRoot,
  env: process.env,
  encoding: 'utf8',
  timeout: 120_000,
  shell: true,
});

if (result.stdout) process.stderr.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error || result.status !== 0) {
  process.stderr.write('[youtube] Dependency install failed. MCP tools may not work until resolved.\n');
  process.exit(0);
}

// Write hash marker so subsequent sessions skip install
try { writeFileSync(hashFile, currentHash); } catch {}

process.stderr.write('[youtube] Dependencies ready.\n');
