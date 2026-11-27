import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULTS, type ResolvedConfig } from '../config.js';
import { dataFile, legacyFiles } from './paths.js';

const CONFIG_FILENAME = 'config.json';

export function getConfigPath(): string {
  return dataFile(CONFIG_FILENAME);
}

/** The settings file in use: the current location, or one left by an older version. */
function readablePath(): string | null {
  for (const path of [getConfigPath(), ...legacyFiles(CONFIG_FILENAME)]) {
    if (existsSync(path)) return path;
  }
  return null;
}

export type UserOverrides = {
  search?: Partial<ResolvedConfig['search']>;
  transcript?: Partial<ResolvedConfig['transcript']>;
  channel?: Partial<ResolvedConfig['channel']>;
  playlist?: Partial<ResolvedConfig['playlist']>;
  download?: Partial<ResolvedConfig['download']>;
  innertube?: Partial<ResolvedConfig['innertube']>;
  network?: Partial<ResolvedConfig['network']>;
  cache?: Partial<ResolvedConfig['cache']>;
};

export function loadUserConfig(): UserOverrides {
  const configPath = readablePath();
  if (!configPath) return {};
  try {
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content) as UserOverrides;
  } catch {
    return {};
  }
}

export function saveUserConfig(overrides: UserOverrides): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  cachedConfig = null;
}

export function deleteUserConfig(): boolean {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return false;
  try {
    unlinkSync(configPath);
    return true;
  } catch {
    return false;
  }
}

function deepMerge<T extends Record<string, any>>(base: T, overrides: Record<string, any>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    if (
      key in base &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key]) &&
      typeof overrides[key] === 'object' &&
      overrides[key] !== null &&
      !Array.isArray(overrides[key])
    ) {
      (result as any)[key] = deepMerge(base[key], overrides[key]);
    } else if (key in base) {
      (result as any)[key] = overrides[key];
    }
  }
  return result;
}

let cachedConfig: ResolvedConfig | null = null;

export function getConfig(): ResolvedConfig {
  if (cachedConfig) return cachedConfig;
  const overrides = loadUserConfig();
  cachedConfig = deepMerge({ ...DEFAULTS } as unknown as ResolvedConfig, overrides);
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
