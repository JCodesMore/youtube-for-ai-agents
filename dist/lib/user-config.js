import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { DEFAULTS } from '../config.js';
const CONFIG_FILENAME = 'config.json';
export function getConfigPath() {
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (!dataDir) {
        return join(process.cwd(), `.${CONFIG_FILENAME}`);
    }
    return join(dataDir, CONFIG_FILENAME);
}
export function loadUserConfig() {
    const configPath = getConfigPath();
    if (!existsSync(configPath))
        return {};
    try {
        const content = readFileSync(configPath, 'utf8');
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
export function saveUserConfig(overrides) {
    const configPath = getConfigPath();
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(overrides, null, 2));
}
export function deleteUserConfig() {
    const configPath = getConfigPath();
    if (!existsSync(configPath))
        return false;
    try {
        unlinkSync(configPath);
        return true;
    }
    catch {
        return false;
    }
}
function deepMerge(base, overrides) {
    const result = { ...base };
    for (const key of Object.keys(overrides)) {
        if (key in base &&
            typeof base[key] === 'object' &&
            base[key] !== null &&
            !Array.isArray(base[key]) &&
            typeof overrides[key] === 'object' &&
            overrides[key] !== null &&
            !Array.isArray(overrides[key])) {
            result[key] = deepMerge(base[key], overrides[key]);
        }
        else if (key in base) {
            result[key] = overrides[key];
        }
    }
    return result;
}
let cachedConfig = null;
export function getConfig() {
    if (cachedConfig)
        return cachedConfig;
    const overrides = loadUserConfig();
    cachedConfig = deepMerge({ ...DEFAULTS }, overrides);
    return cachedConfig;
}
export function resetConfigCache() {
    cachedConfig = null;
}
//# sourceMappingURL=user-config.js.map