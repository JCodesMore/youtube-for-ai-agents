#!/usr/bin/env node
// Set the release version everywhere it lives, and date the Unreleased changelog section.
//   node scripts/set-version.mjs 0.3.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/set-version.mjs <x.y.z>');
  process.exit(2);
}

const MANIFESTS = ['package.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', 'gemini-extension.json', 'server.json'];
for (const file of MANIFESTS) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  for (const pkg of json.packages ?? []) pkg.version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${file} -> ${version}`);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (changelog.includes(`## [${version}]`)) {
  console.log(`CHANGELOG.md already has ${version}`);
} else if (changelog.includes('## [Unreleased]')) {
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync('CHANGELOG.md', changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`));
  console.log(`CHANGELOG.md: Unreleased -> ${version} (${date})`);
} else {
  console.warn('CHANGELOG.md has no [Unreleased] section; add the release notes by hand.');
}
console.log('\nNext: npm run check, then commit "chore: release v' + version + '".');
