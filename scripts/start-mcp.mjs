#!/usr/bin/env node

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const entrypoint = join(pluginRoot, 'dist', 'index.js');

if (!existsSync(entrypoint)) {
  process.stderr.write(
    '[youtube-for-ai-agents] dist/index.js not found. The plugin may need to be reinstalled.\n'
  );
  process.exit(1);
}

await import(pathToFileURL(entrypoint).href);
