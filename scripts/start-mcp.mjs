#!/usr/bin/env node

import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const entrypoint = join(pluginRoot, 'dist', 'index.js');

function runBuild() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'build'], {
    cwd: pluginRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    process.stderr.write(`[youtube-mcp] Failed to run build: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(entrypoint)) {
  process.stderr.write('[youtube-mcp] dist/index.js missing, running build before startup.\n');
  runBuild();
}

if (!existsSync(entrypoint)) {
  process.stderr.write('[youtube-mcp] dist/index.js is still missing after build.\n');
  process.exit(1);
}

await import(pathToFileURL(entrypoint).href);
