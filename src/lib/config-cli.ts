import { DEFAULTS } from '../config.js';
import { getConfig, getConfigPath, loadUserConfig, resetConfigCache, saveUserConfig, deleteUserConfig, type UserOverrides } from './user-config.js';

/** Settings people may change, with the values each accepts. Everything else is internal. */
const SETTABLE: Record<string, { type: 'number'; min: number; max: number } | { type: 'enum'; values: readonly string[] } | { type: 'string' } | { type: 'boolean' }> = {
  'search.defaultLimit': { type: 'number', min: 1, max: DEFAULTS.search.maxLimit },
  'search.defaultType': { type: 'enum', values: ['video', 'channel', 'playlist'] },
  'search.defaultUploadDate': { type: 'enum', values: ['all', 'today', 'week', 'month', 'year'] },
  'search.defaultDuration': { type: 'enum', values: ['all', 'short', 'medium', 'long'] },
  'search.defaultSortBy': { type: 'enum', values: ['relevance', 'rating', 'date', 'views'] },
  'transcript.defaultLanguage': { type: 'string' },
  'transcript.cleanupEnabled': { type: 'boolean' },
  'channel.defaultVideoLimit': { type: 'number', min: 1, max: DEFAULTS.channel.maxVideoLimit },
  'channel.defaultSort': { type: 'enum', values: ['newest', 'popular', 'oldest'] },
  'playlist.defaultLimit': { type: 'number', min: 1, max: DEFAULTS.playlist.maxLimit },
  'download.defaultQuality': { type: 'enum', values: ['best', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'] },
  'download.maxDurationMinutes': { type: 'number', min: 1, max: 600 },
  'innertube.language': { type: 'string' },
  'innertube.location': { type: 'string' },
  'network.proxy': { type: 'string' },
  'cache.transcriptDays': { type: 'number', min: 0, max: 365 },
};

function parseValue(key: string, raw: string): unknown {
  const rule = SETTABLE[key];
  if (!rule) throw new Error(`Unknown setting "${key}". Settable: ${Object.keys(SETTABLE).join(', ')}`);
  switch (rule.type) {
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < rule.min || n > rule.max) throw new Error(`${key} must be a number from ${rule.min} to ${rule.max}`);
      return n;
    }
    case 'enum':
      if (!rule.values.includes(raw)) throw new Error(`${key} must be one of: ${rule.values.join(', ')}`);
      return raw;
    case 'boolean':
      if (!['true', 'false'].includes(raw)) throw new Error(`${key} must be true or false`);
      return raw === 'true';
    default:
      return raw;
  }
}

export function runConfig(args: string[]): number {
  const [action = 'show', key, ...valueParts] = args;
  const overrides = loadUserConfig() as Record<string, Record<string, unknown>>;

  if (action === 'path') {
    console.log(getConfigPath());
    return 0;
  }
  if (action === 'show') {
    const effective = getConfig() as unknown as Record<string, Record<string, unknown>>;
    console.log(`Settings file: ${getConfigPath()}\n`);
    for (const k of Object.keys(SETTABLE)) {
      const [section, field] = k.split('.');
      const changed = overrides[section]?.[field] !== undefined;
      console.log(`${k.padEnd(28)} ${JSON.stringify(effective[section][field])}${changed ? '   (changed)' : ''}`);
    }
    return 0;
  }
  if (action === 'get' && key) {
    const [section, field] = key.split('.');
    console.log(JSON.stringify((getConfig() as unknown as Record<string, Record<string, unknown>>)[section]?.[field]));
    return 0;
  }
  if (action === 'set' && key && valueParts.length) {
    const value = parseValue(key, valueParts.join(' '));
    const [section, field] = key.split('.');
    overrides[section] = { ...(overrides[section] ?? {}), [field]: value };
    saveUserConfig(overrides as UserOverrides);
    resetConfigCache();
    console.log(`${key} = ${JSON.stringify(value)}. Restart your agent (or its MCP server) to apply.`);
    return 0;
  }
  if (action === 'reset') {
    if (!key) {
      deleteUserConfig();
      console.log('All settings back to defaults.');
      return 0;
    }
    const [section, field] = key.split('.');
    if (overrides[section]) delete overrides[section][field];
    saveUserConfig(overrides as UserOverrides);
    console.log(`${key} back to its default.`);
    return 0;
  }
  console.error('Usage: config [show] | config get <key> | config set <key> <value> | config reset [key] | config path');
  return 2;
}
