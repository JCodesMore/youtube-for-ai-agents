#!/usr/bin/env node

/**
 * Plugin configuration CLI for the setup skill.
 *
 * Reads/writes config.json in CLAUDE_PLUGIN_DATA (or cwd fallback).
 * The MCP server merges these overrides onto compiled-in defaults at startup.
 *
 * Usage:
 *   node scripts/config.mjs --show                      # show effective config
 *   node scripts/config.mjs --get search.defaultLimit    # get one value
 *   node scripts/config.mjs --set search.defaultLimit 20 # set one value
 *   node scripts/config.mjs --reset                      # remove all overrides
 *   node scripts/config.mjs --reset search.defaultLimit  # remove one override
 *   node scripts/config.mjs --path                       # print config file path
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

// ── Defaults (mirror of src/config.ts) ──────────────────────────────────────

const DEFAULTS = {
  search: {
    defaultLimit: 20,
    maxLimit: 50,
    defaultType: 'video',
    defaultUploadDate: 'all',
    defaultDuration: 'all',
    defaultSortBy: 'relevance',
  },
  transcript: {
    defaultLanguage: 'en',
    maxSegments: 5000,
    cleanupEnabled: true,
  },
  channel: {
    defaultVideoLimit: 30,
    maxVideoLimit: 500,
    defaultSort: 'newest',
  },
  innertube: {
    language: 'en',
    location: 'US',
  },
};

// ── Validation rules ────────────────────────────────────────────────────────

const VALIDATORS = {
  'search.defaultLimit':     { type: 'number', min: 1, max: 50 },
  'search.maxLimit':         { type: 'number', min: 1, max: 50 },
  'search.defaultType':      { type: 'enum', values: ['video', 'channel', 'playlist'] },
  'search.defaultUploadDate':{ type: 'enum', values: ['all', 'today', 'week', 'month', 'year'] },
  'search.defaultDuration':  { type: 'enum', values: ['all', 'short', 'medium', 'long'] },
  'search.defaultSortBy':    { type: 'enum', values: ['relevance', 'rating', 'date', 'views'] },
  'transcript.defaultLanguage': { type: 'string' },
  'transcript.maxSegments':  { type: 'number', min: 100, max: 50000 },
  'transcript.cleanupEnabled': { type: 'boolean' },
  'channel.defaultVideoLimit': { type: 'number', min: 1, max: 500 },
  'channel.maxVideoLimit':   { type: 'number', min: 1, max: 5000 },
  'channel.defaultSort':     { type: 'enum', values: ['newest', 'popular', 'oldest'] },
  'innertube.language':      { type: 'string' },
  'innertube.location':      { type: 'string' },
};

// ── Path helpers ────────────────────────────────────────────────────────────

function getConfigPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return join(process.cwd(), '.config.json');
  return join(dataDir, 'config.json');
}

function loadOverrides() {
  const p = getConfigPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  const p = getConfigPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const clean = pruneEmpty(overrides);
  if (Object.keys(clean).length === 0) {
    if (existsSync(p)) unlinkSync(p);
    return;
  }
  writeFileSync(p, JSON.stringify(clean, null, 2));
}

function pruneEmpty(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const pruned = pruneEmpty(v);
      if (Object.keys(pruned).length > 0) result[k] = pruned;
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Deep-merge helper ───────────────────────────────────────────────────────

function deepMerge(base, overrides) {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    if (
      key in base &&
      typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) &&
      typeof overrides[key] === 'object' && overrides[key] !== null && !Array.isArray(overrides[key])
    ) {
      result[key] = deepMerge(base[key], overrides[key]);
    } else if (key in base) {
      result[key] = overrides[key];
    }
  }
  return result;
}

// ── Dot-path accessors ──────────────────────────────────────────────────────

function getByPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteByPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== 'object') return;
    cur = cur[parts[i]];
  }
  delete cur[parts[parts.length - 1]];
}

// ── Validation ──────────────────────────────────────────────────────────────

function validate(key, rawValue) {
  const rule = VALIDATORS[key];
  if (!rule) return { ok: false, error: `Unknown setting "${key}". Run --show to see available settings.` };

  if (rule.type === 'number') {
    const n = Number(rawValue);
    if (isNaN(n)) return { ok: false, error: `"${key}" must be a number.` };
    if (rule.min != null && n < rule.min) return { ok: false, error: `"${key}" minimum is ${rule.min}.` };
    if (rule.max != null && n > rule.max) return { ok: false, error: `"${key}" maximum is ${rule.max}.` };
    return { ok: true, value: n };
  }

  if (rule.type === 'boolean') {
    const lower = String(rawValue).toLowerCase();
    if (lower === 'true') return { ok: true, value: true };
    if (lower === 'false') return { ok: true, value: false };
    return { ok: false, error: `"${key}" must be true or false.` };
  }

  if (rule.type === 'enum') {
    if (!rule.values.includes(rawValue)) {
      return { ok: false, error: `"${key}" must be one of: ${rule.values.join(', ')}` };
    }
    return { ok: true, value: rawValue };
  }

  // string
  return { ok: true, value: String(rawValue) };
}

// ── Commands ────────────────────────────────────────────────────────────────

function cmdShow() {
  const overrides = loadOverrides();
  const effective = deepMerge(DEFAULTS, overrides);

  console.log('YouTube MCP Plugin Settings\n');

  for (const [section, values] of Object.entries(effective)) {
    console.log(`  ${section}:`);
    for (const [key, val] of Object.entries(values)) {
      const fullKey = `${section}.${key}`;
      const isCustom = getByPath(overrides, fullKey) !== undefined;
      const marker = isCustom ? ' (*)' : '';
      const rule = VALIDATORS[fullKey];
      let hint = '';
      if (rule?.type === 'enum') hint = `  [${rule.values.join('|')}]`;
      if (rule?.type === 'number') hint = `  [${rule.min ?? ''}..${rule.max ?? ''}]`;
      console.log(`    ${key}: ${JSON.stringify(val)}${marker}${hint}`);
    }
    console.log();
  }

  console.log('(*) = user-customized (overrides default)');
}

function cmdGet(key) {
  const overrides = loadOverrides();
  const effective = deepMerge(DEFAULTS, overrides);
  const val = getByPath(effective, key);
  if (val === undefined) {
    console.error(`Unknown setting: ${key}`);
    process.exit(1);
  }
  console.log(JSON.stringify(val));
}

function cmdSet(key, rawValue) {
  const result = validate(key, rawValue);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  const overrides = loadOverrides();
  setByPath(overrides, key, result.value);
  saveOverrides(overrides);
  console.log(`Set ${key} = ${JSON.stringify(result.value)}`);
}

function cmdReset(key) {
  if (!key) {
    const p = getConfigPath();
    if (existsSync(p)) {
      unlinkSync(p);
      console.log('All settings reset to defaults.');
    } else {
      console.log('Already using defaults — nothing to reset.');
    }
    return;
  }
  if (!VALIDATORS[key]) {
    console.error(`Unknown setting: ${key}`);
    process.exit(1);
  }
  const overrides = loadOverrides();
  deleteByPath(overrides, key);
  saveOverrides(overrides);
  console.log(`Reset ${key} to default.`);
}

function cmdPath() {
  console.log(getConfigPath());
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--path')) {
  cmdPath();
} else if (args.includes('--show')) {
  cmdShow();
} else if (args.includes('--get')) {
  const idx = args.indexOf('--get');
  const key = args[idx + 1];
  if (!key) { console.error('Usage: --get <section.key>'); process.exit(1); }
  cmdGet(key);
} else if (args.includes('--set')) {
  const idx = args.indexOf('--set');
  const key = args[idx + 1];
  const val = args[idx + 2];
  if (!key || val === undefined) { console.error('Usage: --set <section.key> <value>'); process.exit(1); }
  cmdSet(key, val);
} else if (args.includes('--reset')) {
  const idx = args.indexOf('--reset');
  const key = args[idx + 1];
  cmdReset(key);
} else {
  console.log('YouTube MCP Plugin Config\n');
  console.log('Commands:');
  console.log('  --show                       Show current settings');
  console.log('  --get <section.key>          Get a setting value');
  console.log('  --set <section.key> <value>  Set a setting');
  console.log('  --reset [section.key]        Reset one or all settings');
  console.log('  --path                       Show config file path');
}
