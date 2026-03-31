#!/usr/bin/env node

// SessionStart hook — installs runtime dependencies into CLAUDE_PLUGIN_DATA.
// Skips if package.json hasn't changed since last install.

import { existsSync, readFileSync, copyFileSync, mkdirSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const dataDir = process.env.CLAUDE_PLUGIN_DATA;

if (!dataDir) {
  process.exit(0);
}

mkdirSync(dataDir, { recursive: true });

const srcPkg = join(pluginRoot, 'package.json');
const dataPkg = join(dataDir, 'package.json');
const srcLock = join(pluginRoot, 'package-lock.json');
const dataLock = join(dataDir, 'package-lock.json');

function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// Skip if package.json is unchanged and node_modules exists
if (fileHash(srcPkg) === fileHash(dataPkg) && existsSync(join(dataDir, 'node_modules'))) {
  process.exit(0);
}

process.stderr.write('[youtube] Installing dependencies...\n');

copyFileSync(srcPkg, dataPkg);
if (existsSync(srcLock)) {
  copyFileSync(srcLock, dataLock);
}

const result = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: dataDir,
  env: process.env,
  encoding: 'utf8',
  timeout: 120_000,
  shell: true,
});

if (result.stdout) process.stderr.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error || result.status !== 0) {
  process.stderr.write('[youtube] Dependency install failed. MCP tools may not work until resolved.\n');
  try { unlinkSync(dataPkg); } catch {}
  process.exit(0);
}

process.stderr.write('[youtube] Dependencies ready.\n');
