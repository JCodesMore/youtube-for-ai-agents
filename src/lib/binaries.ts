import { chmodSync, createReadStream, createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, posix, win32 } from 'node:path';
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

/**
 * The first yt-dlp release with `--js-runtimes`, which every call passes. An older yt-dlp on PATH
 * (distro packages lag) would reject the flag, so it is passed over for our own copy.
 */
export const MIN_YTDLP_VERSION = '2025.11.12';

/** How long `yt-dlp --version` may take; a Python-based install starts slowly. */
const VERSION_CHECK_TIMEOUT_MS = 15_000;

const YTDLP_RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases';
const YTDLP_CHECKSUMS = 'SHA2-256SUMS';

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

function ffmpegUrl(): string {
  return `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-${process.platform}-${process.arch}.gz`;
}

function cachedPath(name: BinaryName): string {
  return join(getDataDir(), 'bin', `${name}${EXE}`);
}

/**
 * Find a program on PATH. On Windows only `.exe` counts: the server spawns without a shell, and
 * Node refuses to spawn `.cmd`/`.bat` files that way (EINVAL).
 */
export function findOnPath(
  name: string,
  pathEnv: string = process.env.PATH ?? '',
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const paths = platform === 'win32' ? win32 : posix;
  const ext = platform === 'win32' ? '.exe' : '';
  for (const dir of pathEnv.split(paths.delimiter).filter(Boolean)) {
    const candidate = paths.join(dir, name + ext);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** Compare yt-dlp date versions (YYYY.MM.DD, maybe with a nightly suffix); null if unparseable. */
export function ytDlpVersionAtLeast(version: string, minimum: string = MIN_YTDLP_VERSION): boolean | null {
  const parse = (v: string) => v.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/)?.slice(1).map(Number) ?? null;
  const have = parse(version);
  const need = parse(minimum);
  if (!have || !need) return null;
  for (let i = 0; i < need.length; i++) {
    if (have[i] !== need[i]) return have[i] > need[i];
  }
  return true;
}

const versionOk = new Map<string, boolean>();

/** Whether a system yt-dlp is new enough for the flags we pass. Checked once per path. */
function systemYtDlpUsable(path: string): boolean {
  const known = versionOk.get(path);
  if (known !== undefined) return known;
  let ok = false;
  try {
    const out = execFileSync(path, ['--version'], {
      encoding: 'utf8', timeout: VERSION_CHECK_TIMEOUT_MS, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    ok = ytDlpVersionAtLeast(out) === true;
    if (!ok) debug(`ignoring yt-dlp ${out.trim()} at ${path}: older than ${MIN_YTDLP_VERSION}`);
  } catch (e) {
    debug(`ignoring yt-dlp at ${path}: --version failed (${(e as Error).message})`);
  }
  versionOk.set(path, ok);
  return ok;
}

function onPath(name: BinaryName): string | null {
  const found = findOnPath(name);
  if (found && name === 'yt-dlp' && !systemYtDlpUsable(found)) return null;
  return found;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

/**
 * The latest yt-dlp asset and its expected SHA-256. The tag is resolved once and both files come
 * from it, so a release published in between can't make them disagree.
 */
async function ytDlpRelease(): Promise<{ url: string; sha256: string }> {
  const latest = await fetch(`${YTDLP_RELEASES}/latest`, { redirect: 'manual' });
  const tag = latest.headers.get('location')?.match(/\/releases\/tag\/([^/?#]+)/)?.[1];
  if (!tag) throw new Error(`couldn't find the latest yt-dlp release (HTTP ${latest.status} from ${YTDLP_RELEASES}/latest)`);
  const sums = await fetchOk(`${YTDLP_RELEASES}/download/${tag}/${YTDLP_CHECKSUMS}`);
  const asset = ytDlpAsset();
  const entry = (await sums.text())
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file?.replace(/^\*/, '') === asset);
  const sha256 = entry?.[0]?.toLowerCase();
  if (!sha256) throw new Error(`${YTDLP_CHECKSUMS} for yt-dlp ${tag} has no entry for ${asset}`);
  return { url: `${YTDLP_RELEASES}/download/${tag}/${asset}`, sha256 };
}

const inFlight = new Map<BinaryName, Promise<string>>();

async function download(name: BinaryName): Promise<string> {
  const existing = inFlight.get(name);
  if (existing) return existing;
  const job = (async () => {
    ensureDataDir('bin');
    const target = cachedPath(name);
    // Unique per download, so two servers fetching at once never write into the same file.
    const partial = `${target}.${randomUUID()}.download`;
    try {
      // ffmpeg-static publishes no checksums, so only yt-dlp is verified.
      const { url, sha256 } = name === 'yt-dlp' ? await ytDlpRelease() : { url: ffmpegUrl(), sha256: null };
      warn(`Downloading ${name} (one time) from ${url}`);
      const res = await fetchOk(url);
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
      await (name === 'ffmpeg'
        ? pipeline(body, createGunzip(), createWriteStream(partial))
        : pipeline(body, createWriteStream(partial)));
      if (sha256) {
        const actual = await sha256File(partial);
        if (actual !== sha256) throw new Error(`checksum mismatch for ${url} (expected ${sha256}, got ${actual})`);
      }
      if (process.platform !== 'win32') chmodSync(partial, 0o755);
      try {
        // Atomic on POSIX; on Windows it replaces too, unless the old copy is running.
        renameSync(partial, target);
      } catch (e) {
        if (!existsSync(target)) throw e;
        debug(`kept the existing ${name}: ${(e as Error).message}`);
      }
      return target;
    } catch (e) {
      throw new Error(`Downloading ${name} failed: ${(e as Error).message}`);
    } finally {
      if (existsSync(partial)) try { unlinkSync(partial); } catch { /* already gone */ }
    }
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
