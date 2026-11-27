import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DEFAULTS } from '../config.js';
import { ensureDataDir } from './paths.js';
import { BROWSER_PROFILE, saveCookies, validateCookies } from './cookies.js';

/**
 * Sign in to YouTube once, in a separate browser profile, and keep the cookies. Uses the
 * Chrome DevTools protocol over a plain WebSocket, so no browser-automation package is needed.
 */

const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F';
const POLL_MS = 2_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const START_TIMEOUT_MS = 20_000;
const COMMAND_TIMEOUT_MS = 15_000;
const WINDOW_CLOSED = 'The sign-in window was closed before sign-in finished. Run login again when ready.';

function browserCandidates(): string[] {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean) as string[];
    return roots.flatMap((r) => [
      join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      join(r, 'Chromium', 'Application', 'chrome.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/snap/bin/chromium'];
}

export function findBrowser(): string | null {
  const override = process.env.YOUTUBE_AI_AGENTS_BROWSER;
  if (override && existsSync(override)) return override;
  return browserCandidates().find((p) => existsSync(p)) ?? null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function devtoolsUrl(port: number): Promise<string> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const json = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('The browser started but its debugging port never answered.');
}

interface Cookie { name: string; value: string; domain: string }

class Cdp {
  private id = 0;
  private waiting = new Map<number, (msg: { result?: unknown; error?: { message: string } }) => void>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id !== undefined) this.waiting.get(msg.id)?.(msg);
    });
    // Closing the window ends the browser and the socket; a send on a closed socket is silently
    // dropped, so settle everything still waiting.
    ws.addEventListener('close', () => {
      for (const settle of [...this.waiting.values()]) settle({ error: { message: WINDOW_CLOSED } });
    });
  }
  static open(url: string): Promise<Cdp> {
    if (typeof WebSocket === 'undefined') {
      return Promise.reject(new Error('Signing in needs Node.js 22 or newer. Update Node from https://nodejs.org and try again.'));
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Cdp(ws)));
      ws.addEventListener('error', () => reject(new Error('Could not connect to the browser.')));
    });
  }
  send<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = COMMAND_TIMEOUT_MS): Promise<T> {
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(WINDOW_CLOSED));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settle({ error: { message: `The browser stopped answering (${method}). Run login again.` } }), timeoutMs);
      const settle = (msg: { result?: unknown; error?: { message: string } }) => {
        clearTimeout(timer);
        this.waiting.delete(id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result as T);
      };
      this.waiting.set(id, settle);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

function youtubeCookieString(cookies: Cookie[]): string {
  const relevant = cookies.filter((c) => /(^|\.)(youtube|google)\.com$/.test(c.domain.replace(/^\./, '')) || c.domain.endsWith('youtube.com') || c.domain.endsWith('google.com'));
  const byName = new Map<string, string>();
  // Prefer youtube.com values when the same name exists on google.com.
  for (const c of relevant.sort((a, b) => Number(a.domain.includes('youtube')) - Number(b.domain.includes('youtube')))) byName.set(c.name, c.value);
  return [...byName].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function login(log: (line: string) => void): Promise<{ path: string }> {
  const browser = findBrowser();
  if (!browser) {
    throw new Error('No Chrome, Edge, Brave or Chromium found. Install one, or set YOUTUBE_AI_AGENTS_BROWSER to a Chromium-based browser.');
  }
  const profile = ensureDataDir(BROWSER_PROFILE);
  const port = await freePort();
  log(`Opening a separate browser window (its own profile, so your normal browser isn't touched).`);
  const child = spawn(browser, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    SIGN_IN_URL,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  const cdp = await Cdp.open(await devtoolsUrl(port));
  try {
    log('Sign in to YouTube in that window. This waits for up to 10 minutes...');
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { cookies } = await cdp.send<{ cookies: Cookie[] }>('Storage.getCookies');
      const cookieString = youtubeCookieString(cookies);
      const hasYoutubeSession = cookies.some((c) => c.name === 'LOGIN_INFO' && c.domain.includes('youtube'));
      if (hasYoutubeSession && validateCookies(cookieString).valid) {
        const path = saveCookies(cookieString);
        log(`Signed in. Saved to ${path}`);
        try { await cdp.send('Browser.close', {}, 3_000); } catch { /* window already closed */ }
        return { path };
      }
      await sleep(POLL_MS);
    }
    throw new Error(`Timed out waiting for sign-in. Run login again when ready. Needed cookies: ${DEFAULTS.auth.requiredCookies.join(', ')}`);
  } finally {
    cdp.close();
  }
}
