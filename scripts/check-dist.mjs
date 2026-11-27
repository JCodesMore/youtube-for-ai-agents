#!/usr/bin/env node
// The plugin runs the committed dist/index.js directly, so it must match the source.
// In CI, fail when a fresh build differs from what is committed.
import { execSync } from 'node:child_process';

const changed = execSync('git status --porcelain -- dist', { encoding: 'utf8' }).trim();
if (!changed) {
  console.log('dist/ matches the source.');
} else if (process.env.CI) {
  console.error(`dist/ is out of date. Run "npm run build" and commit the result.\n${changed}`);
  process.exit(1);
} else {
  console.log('dist/ was rebuilt: commit it together with your source changes.');
}
