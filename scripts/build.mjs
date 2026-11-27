#!/usr/bin/env node
// Bundles the server and all its JavaScript dependencies into one file, dist/index.js.
// The plugin and the npm package then run with plain `node`: no `npm install` on the user's
// machine, nothing to download before the first tool call.

import { build } from 'esbuild';
import { rmSync, statSync } from 'node:fs';

const outfile = 'dist/index.js';
rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  legalComments: 'linked',
  // Some bundled dependencies are CommonJS and call require(); give them one.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    ].join('\n'),
  },
  logLevel: 'warning',
});

const kb = Math.round(statSync(outfile).size / 1024);
console.log(`Built ${outfile} (${kb} KB)`);
