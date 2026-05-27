import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { DEFAULTS, type ResolvedConfig } from '../config.js';

const CONFIG_FILENAME = 'config.json';

export function getConfigPath(): string {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    return join(process.cwd(), `.${CONFIG_FILENAME}`);
  }
  return join(dataDir, CONFIG_FILENAME);
}

export type UserOverrides = {
  search?: Partial<ResolvedConfig['search']>;
  transcript?: Partial<ResolvedConfig['transcript']>;
  channel?: Partial<ResolvedConfig['channel']>;
  playlist?: Partial<ResolvedConfig['playlist']>;
  download?: Partial<ResolvedConfig['download']>;
  innertube?: Partial<ResolvedConfig['innertube']>;
};

export function loadUserConfig(): UserOverrides {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
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
