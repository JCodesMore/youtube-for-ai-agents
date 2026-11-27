import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { DEFAULTS } from '../config.js';
import { dataFile, ensureDataDir, legacyFiles } from './paths.js';

const FILE = DEFAULTS.auth.cookieFilename;
export const BROWSER_PROFILE = 'browser-profile';

export function getCookiePath(): string {
  return dataFile(FILE);
}

function readCookieFile(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { cookie_string?: unknown };
    return typeof parsed.cookie_string === 'string' && parsed.cookie_string.length > 0 ? parsed.cookie_string : null;
  } catch {
    return null;
  }
}

let cached: { value: string | null; source: string | null } | null = null;

function load(): { value: string | null; source: string | null } {
  if (cached) return cached;
  for (const path of [getCookiePath(), ...legacyFiles(FILE)]) {
    const value = readCookieFile(path);
    if (value) return (cached = { value, source: path });
  }
  return (cached = { value: null, source: null });
}

/** The saved YouTube sign-in as a Cookie header value, or null when browsing anonymously. */
export function loadCookies(): string | null {
  return load().value;
}

/** Which file the sign-in was read from (older versions kept it elsewhere). */
export function cookieSource(): string | null {
  return load().source;
}

export function hasCookies(): boolean {
  return loadCookies() !== null;
}

export function saveCookies(cookieString: string): string {
  ensureDataDir();
  const path = getCookiePath();
  writeFileSync(path, JSON.stringify({ cookie_string: cookieString, saved_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  cached = null;
  return path;
}

/**
 * Sign out: remove the saved cookies and the browser profile `login` signed in with, which holds
 * a full Google session of its own.
 */
export function deleteCookies(): boolean {
  cached = null;
  let removed = false;
  for (const path of [getCookiePath(), ...legacyFiles(FILE)]) {
    if (readCookieFile(path) !== null || path === getCookiePath() && existsSync(path)) {
      try { unlinkSync(path); removed = true; } catch { /* keep going */ }
    }
  }
  const profile = dataFile(BROWSER_PROFILE);
  if (existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true }); removed = true; } catch { /* the window may still be open */ }
  }
  return removed;
}

export interface CookieValidation {
  valid: boolean;
  present: string[];
  missing: string[];
}

export function validateCookies(cookieString: string): CookieValidation {
  const names = cookieString.split(';').map((c) => c.trim().split('=')[0]);
  const present: string[] = [];
  const missing: string[] = [];
  for (const required of DEFAULTS.auth.requiredCookies) {
    (names.includes(required) ? present : missing).push(required);
  }
  return { valid: missing.length === 0, present, missing };
}
