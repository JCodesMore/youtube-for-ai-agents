import { chmodSync, createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { ensureDataDir, getDataDir } from './paths.js';
import { debug, warn } from './log.js';

/**
 * yt-dlp and ffmpeg are only needed by the download, clip and highlight-reel tools. Rather than
 * installing ~100 MB of binaries for everyone, they are found on the system or fetched once,
 * on first use, from their official GitHub releases into the data folder.
 */

export type BinaryName = 'yt-dlp' | 'ffmpeg';

const EXE = process.platform === 'win32' ? '.exe' : '';

/** yt-dlp breaks when YouTube changes; refresh our private copy when it is older than this. */
const YTDLP_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

const FFMPEG_RELEASE = 'b6.1.1';

const ENV_OVERRIDE: Record<BinaryName, string> = {
  'yt-dlp': 'YOUTUBE_AI_AGENTS_YTDLP',
  ffmpeg: 'YOUTUBE_AI_AGENTS_FFMPEG',
};

function ytDlpAsset(): string {
  const { platform, arch } = process;
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : arch === 'ia32' ? 'yt-dlp_x86.exe' : 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  return 'yt-dlp';
}

function downloadUrl(name: BinaryName): { url: string; gzip: boolean } {
  if (name === 'yt-dlp') {
    return { url: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpAsset()}`, gzip: false };
  }
  const plat = process.platform === 'win32' ? 'win32' : process.platform;
  return { url: `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-${plat}-${process.arch}.gz`, gzip: true };
}

function cachedPath(name: BinaryName): string {
  return join(getDataDir(), 'bin', `${name}${EXE}`);
}

function onPath(name: BinaryName): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
      const upper = join(dir, name + ext);
      if (existsSync(upper)) return upper;
    }
  }
  return null;
}

const inFlight = new Map<BinaryName, Promise<string>>();

async function download(name: BinaryName): Promise<string> {
  const existing = inFlight.get(name);
  if (existing) return existing;
  const job = (async () => {
    ensureDataDir('bin');
    const target = cachedPath(name);
    const partial = `${target}.download`;
    const { url, gzip } = downloadUrl(name);
    warn(`Downloading ${name} (one time) from ${url}`);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Downloading ${name} failed: HTTP ${res.status} from ${url}`);
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    await (gzip ? pipeline(body, createGunzip(), createWriteStream(partial)) : pipeline(body, createWriteStream(partial)));
    if (process.platform !== 'win32') chmodSync(partial, 0o755);
    if (existsSync(target)) unlinkSync(target);
    renameSync(partial, target);
    return target;
  })();
  inFlight.set(name, job);
  try {
    return await job;
  } finally {
    inFlight.delete(name);
  }
}

export interface BinaryStatus {
  name: BinaryName;
  path: string | null;
  source: 'env' | 'cache' | 'system' | 'missing';
}

export function locateBinary(name: BinaryName): BinaryStatus {
  const env = process.env[ENV_OVERRIDE[name]];
  if (env && existsSync(env)) return { name, path: env, source: 'env' };
  const cached = cachedPath(name);
  // ffmpeg on the system is fine; for yt-dlp prefer our own copy, which we keep current.
  if (name === 'ffmpeg') {
    const sys = onPath(name);
    if (sys) return { name, path: sys, source: 'system' };
    if (existsSync(cached)) return { name, path: cached, source: 'cache' };
  } else {
    if (existsSync(cached)) return { name, path: cached, source: 'cache' };
    const sys = onPath(name);
    if (sys) return { name, path: sys, source: 'system' };
  }
  return { name, path: null, source: 'missing' };
}

/**
 * Find a binary, downloading it if allowed and needed. A stale private yt-dlp is refreshed
 * first; if that refresh fails, the old copy is still used.
 */
export async function findBinary(name: BinaryName, options: { download?: boolean } = {}): Promise<string | null> {
  const allowDownload = options.download ?? true;
  const found = locateBinary(name);

  if (found.source === 'cache' && name === 'yt-dlp' && allowDownload) {
    const age = Date.now() - statSync(found.path!).mtimeMs;
    if (age > YTDLP_REFRESH_MS) {
      try {
        return await download(name);
      } catch (e) {
        debug(`yt-dlp refresh failed, using existing copy: ${(e as Error).message}`);
      }
    }
  }
  if (found.path) return found.path;
  if (!allowDownload) return null;
  return download(name);
}

export async function requireBinary(name: BinaryName): Promise<string> {
  try {
    const path = await findBinary(name, { download: true });
    if (path) return path;
  } catch (e) {
    throw new Error(
      `${name} is needed for this and couldn't be downloaded automatically (${(e as Error).message}). ` +
        `Install ${name} yourself (it just needs to be on PATH), or set ${ENV_OVERRIDE[name]} to its full path.`,
    );
  }
  throw new Error(`${name} not found.`);
}
