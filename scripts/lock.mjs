#!/usr/bin/env node
// Refresh the lockfile CI builds from. It lives in .github/lock/ because Claude Code runs
// `npm install` in any plugin whose root holds a lockfile. Run after changing dependencies.
import { execSync } from 'node:child_process';
import { renameSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';

const KEPT = '.github/lock/package-lock.json';
if (existsSync(KEPT)) copyFileSync(KEPT, 'package-lock.json');
try {
  execSync('npm install --package-lock=true --no-audit --no-fund', { stdio: 'inherit' });
} finally {
  if (existsSync('package-lock.json')) {
    mkdirSync('.github/lock', { recursive: true });
    renameSync('package-lock.json', KEPT);
  }
}
console.log(`Updated ${KEPT}. Run npm run check and commit it with package.json and dist/.`);
