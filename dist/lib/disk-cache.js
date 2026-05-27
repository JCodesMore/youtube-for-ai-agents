/**
 * Disk-persistent cache for transcripts.
 * Survives MCP server restarts. Stored as JSON files alongside the TTL.
 *
 * Cache dir resolution order:
 *   1. $CLAUDE_PLUGIN_DATA/cache/transcripts/
 *   2. <project-root>/.cache/transcripts/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
function getCacheDir() {
    const pluginData = process.env.CLAUDE_PLUGIN_DATA;
    if (pluginData)
        return join(pluginData, 'cache', 'transcripts');
    return join(PROJECT_ROOT, '.cache', 'transcripts');
}
function ensureDir(dir) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
const CURRENT_VERSION = 1;
export class DiskCache {
    ttlMs;
    constructor(ttlHours) {
        this.ttlMs = ttlHours * 60 * 60 * 1000;
    }
    path(key) {
        // Sanitize key to safe filename
        const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
        return join(getCacheDir(), `${safe}.json`);
    }
    get(key) {
        const fp = this.path(key);
        try {
            const raw = readFileSync(fp, 'utf-8');
            const entry = JSON.parse(raw);
            if (entry.version !== CURRENT_VERSION) {
                unlinkSync(fp);
                return undefined;
            }
            if (Date.now() > entry.expiresAt) {
                unlinkSync(fp);
                return undefined;
            }
            return entry.value;
        }
        catch {
            return undefined;
        }
    }
    set(key, value) {
        try {
            const dir = getCacheDir();
            ensureDir(dir);
            const entry = {
                value,
                expiresAt: Date.now() + this.ttlMs,
                version: CURRENT_VERSION,
            };
            writeFileSync(this.path(key), JSON.stringify(entry), 'utf-8');
        }
        catch {
            // Non-fatal — disk write failure degrades to in-memory only
        }
    }
    invalidate(key) {
        try {
            unlinkSync(this.path(key));
        }
        catch { /* ok */ }
    }
}
// 7-day transcript cache — transcripts almost never change
export const transcriptDiskCache = new DiskCache(24 * 7);
//# sourceMappingURL=disk-cache.js.map