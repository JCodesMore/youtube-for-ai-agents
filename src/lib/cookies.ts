import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { DEFAULTS } from '../config.js';

function getCookiePath(): string {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    return join(process.cwd(), `.${DEFAULTS.auth.cookieFilename}`);
  }
  return join(dataDir, DEFAULTS.auth.cookieFilename);
}

export function hasCookies(): boolean {
  const cookiePath = getCookiePath();
  if (!existsSync(cookiePath)) return false;
  try {
    const content = readFileSync(cookiePath, 'utf8');
    const parsed = JSON.parse(content);
    return typeof parsed.cookie_string === 'string' && parsed.cookie_string.length > 0;
  } catch {
    return false;
  }
}

export function loadCookies(): string | null {
  const cookiePath = getCookiePath();
  if (!existsSync(cookiePath)) return null;
  try {
    const content = readFileSync(cookiePath, 'utf8');
    const parsed = JSON.parse(content);
    if (typeof parsed.cookie_string === 'string' && parsed.cookie_string.length > 0) {
      return parsed.cookie_string;
    }
    return null;
  } catch {
    return null;
  }
}

export function deleteCookies(): boolean {
  const cookiePath = getCookiePath();
  if (!existsSync(cookiePath)) return false;
  try {
    unlinkSync(cookiePath);
    return true;
  } catch {
    return false;
  }
}

export function saveCookies(cookieString: string): void {
  const cookiePath = getCookiePath();
  const dir = dirname(cookiePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(cookiePath, JSON.stringify({ cookie_string: cookieString }, null, 2));
}

export interface CookieValidation {
  valid: boolean;
  present: string[];
  missing: string[];
}

export function validateCookies(cookieString: string): CookieValidation {
  const cookieNames = cookieString
    .split(';')
    .map(c => c.trim().split('=')[0]);

  const present: string[] = [];
  const missing: string[] = [];

  for (const required of DEFAULTS.auth.requiredCookies) {
    if (cookieNames.includes(required)) {
      present.push(required);
    } else {
      missing.push(required);
    }
  }

  return {
    valid: missing.length === 0,
    present,
    missing,
  };
}
