import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { DEFAULTS } from '../config.js';
function getCookiePath() {
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (!dataDir) {
        return join(process.cwd(), `.${DEFAULTS.auth.cookieFilename}`);
    }
    return join(dataDir, DEFAULTS.auth.cookieFilename);
}
export function hasCookies() {
    const cookiePath = getCookiePath();
    if (!existsSync(cookiePath))
        return false;
    try {
        const content = readFileSync(cookiePath, 'utf8');
        const parsed = JSON.parse(content);
        return typeof parsed.cookie_string === 'string' && parsed.cookie_string.length > 0;
    }
    catch {
        return false;
    }
}
export function loadCookies() {
    const cookiePath = getCookiePath();
    if (!existsSync(cookiePath))
        return null;
    try {
        const content = readFileSync(cookiePath, 'utf8');
        const parsed = JSON.parse(content);
        if (typeof parsed.cookie_string === 'string' && parsed.cookie_string.length > 0) {
            return parsed.cookie_string;
        }
        return null;
    }
    catch {
        return null;
    }
}
export function deleteCookies() {
    const cookiePath = getCookiePath();
    if (!existsSync(cookiePath))
        return false;
    try {
        unlinkSync(cookiePath);
        return true;
    }
    catch {
        return false;
    }
}
export function saveCookies(cookieString) {
    const cookiePath = getCookiePath();
    const dir = dirname(cookiePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(cookiePath, JSON.stringify({ cookie_string: cookieString }, null, 2));
}
export function validateCookies(cookieString) {
    const cookieNames = cookieString
        .split(';')
        .map(c => c.trim().split('=')[0]);
    const present = [];
    const missing = [];
    for (const required of DEFAULTS.auth.requiredCookies) {
        if (cookieNames.includes(required)) {
            present.push(required);
        }
        else {
            missing.push(required);
        }
    }
    return {
        valid: missing.length === 0,
        present,
        missing,
    };
}
//# sourceMappingURL=cookies.js.map