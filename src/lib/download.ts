import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { requireBinary } from './binaries.js';
import { runProcess } from './process.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import { proxyUrl } from './network.js';
import type { DownloadQuality, DownloadType } from '../config.js';

export interface DownloadOptions {
  quality?: DownloadQuality;
  type?: DownloadType;
  format?: string;
  outputPath?: string;
  force?: boolean;
}

export interface DownloadResult {
  filePath: string;
  title: string;
  duration: string;
  durationSeconds: number;
  fileSize: string;
  format: string;
}

export interface DurationWarning {
  warning: string;
  confirmed: false;
  title: string;
  duration: string;
  durationSeconds: number;
}

export interface ClipDefinition {
  startTime: string;
  endTime: string;
  label?: string;
}

export interface ClipResult {
  filePath: string;
  label: string;
  startTime: string;
  endTime: string;
  clipDuration: string;
  fileSize: string;
}

export interface HighlightReelResult {
  highlightReel: { filePath: string; duration: string; fileSize: string };
  clips: ClipResult[];
}

const INFO_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

// --- Small helpers ---

export function parseTimestamp(input: string): number {
  const trimmed = String(input).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN) || parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid timestamp: "${input}". Use seconds (90), MM:SS (1:30), or HH:MM:SS (1:30:00)`);
  }
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 150) || 'video';
}

/**
 * Make file names unique within one request ("intro", "intro (2)"), ignoring case because
 * Windows and macOS file systems do.
 */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function heightOf(quality: DownloadQuality): number | null {
  const m = quality.match(/^(\d+)p$/);
  return m ? Number(m[1]) : quality === 'bestefficiency' ? 720 : null;
}

/** yt-dlp format sort: highest resolution within the limit, then H.264/AAC so the MP4 plays everywhere. */
export function formatSort(quality: DownloadQuality): string {
  const h = heightOf(quality);
  return [h ? `res:${h}` : 'res', 'vcodec:h264', 'acodec:aac'].join(',');
}

/** Netscape cookie file for yt-dlp, written to a temp file and deleted after use. */
function writeCookieFile(): string | null {
  const cookie = loadCookies();
  if (!cookie) return null;
  const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const pair of cookie.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    lines.push(['.youtube.com', 'TRUE', '/', 'TRUE', String(expiry), name, value].join('\t'));
  }
  const file = join(tmpdir(), `yt-cookies-${randomUUID().slice(0, 8)}.txt`);
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  return file;
}

async function ytdlp(args: string[], timeoutMs: number): Promise<string> {
  const bin = await requireBinary('yt-dlp');
  const ffmpeg = await requireBinary('ffmpeg');
  const cookieFile = writeCookieFile();
  const base = [
    '--no-playlist', '--no-warnings', '--no-progress',
    // Use the Node running this server as yt-dlp's JavaScript runtime (needed for YouTube).
    '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`,
    '--ffmpeg-location', ffmpeg,
  ];
  if (cookieFile) base.push('--cookies', cookieFile);
  const proxy = proxyUrl();
  if (proxy) base.push('--proxy', proxy);
  try {
    const { stdout } = await runProcess(bin, [...base, ...args], { timeoutMs });
    return stdout;
  } finally {
    if (cookieFile) try { unlinkSync(cookieFile); } catch { /* already gone */ }
  }
}

interface YtDlpInfo { title?: string; duration?: number }

async function getInfo(url: string): Promise<{ title: string; durationSeconds: number }> {
  const out = await ytdlp(['-J', '--skip-download', url], INFO_TIMEOUT_MS);
  const info = JSON.parse(out) as YtDlpInfo;
  return { title: info.title ?? 'video', durationSeconds: info.duration ?? 0 };
}

function lastLine(stdout: string): string {
  return stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
}

function guard(title: string, durationSeconds: number, force: boolean | undefined, action: string): DurationWarning | null {
  const maxMinutes = getConfig().download.maxDurationMinutes;
  if (force || durationSeconds <= maxMinutes * 60) return null;
  const duration = formatSeconds(durationSeconds);
  return {
    warning: `This video is ${duration} long (over the ${maxMinutes}-minute limit), so ${action} may take a while and use a lot of disk space. Re-run with force: true to go ahead.`,
    confirmed: false,
    title,
    duration,
    durationSeconds,
  };
}

// --- FFmpeg ---

async function runFfmpeg(args: string[], timeoutMs: number = DOWNLOAD_TIMEOUT_MS): Promise<string> {
  const bin = await requireBinary('ffmpeg');
  const { stderr } = await runProcess(bin, ['-hide_banner', ...args], { timeoutMs });
  return stderr;
}

/** Duration and whether there is an audio stream, read from what `ffmpeg -i` prints. */
export function parseMediaInfo(ffmpegOutput: string): { durationSeconds: number; hasAudio: boolean } {
  const m = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    durationSeconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(ffmpegOutput),
  };
}

async function probeMedia(filePath: string): Promise<{ durationSeconds: number; hasAudio: boolean }> {
  const bin = await requireBinary('ffmpeg');
  // ffmpeg with no output exits non-zero but prints the stream details first.
  const stderr = await runProcess(bin, ['-hide_banner', '-i', filePath], { timeoutMs: INFO_TIMEOUT_MS })
    .then((r) => r.stderr)
    .catch((e: Error) => e.message);
  return parseMediaInfo(stderr);
}

export async function getVideoDuration(filePath: string): Promise<number> {
  return (await probeMedia(filePath)).durationSeconds;
}

/** Fallback length for generated silence when a clip's duration can't be read; concat pads the rest. */
const SILENCE_FALLBACK_SECONDS = 0.1;
const REEL_AUDIO_FORMAT = 'aformat=sample_rates=48000:channel_layouts=stereo';

export async function concatClips(clipPaths: string[], outputPath: string, options?: { reencode?: boolean }): Promise<void> {
  if (options?.reencode) {
    // Different sources: normalise size, frame rate and codecs so the joins are clean.
    const inputs = clipPaths.flatMap((p) => ['-i', p]);
    const media = await Promise.all(clipPaths.map(probeMedia));
    // A clip with no audio stream (video-only download) gets silence of the same length.
    const audio = (i: number) => media[i].hasAudio
      ? `[${i}:a]aresample=48000,${REEL_AUDIO_FORMAT}[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${media[i].durationSeconds || SILENCE_FALLBACK_SECONDS},${REEL_AUDIO_FORMAT}[a${i}]`;
    const scale = clipPaths
      .map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];${audio(i)}`)
      .join(';');
    const joined = clipPaths.map((_, i) => `[v${i}][a${i}]`).join('');
    await runFfmpeg([
      ...inputs,
      '-filter_complex', `${scale};${joined}concat=n=${clipPaths.length}:v=1:a=1[v][a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart', '-y', outputPath,
    ]);
    return;
  }
  // Same source and codec: join without re-encoding.
  const listFile = join(tmpdir(), `yt-concat-${randomUUID().slice(0, 8)}.txt`);
  writeFileSync(listFile, clipPaths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-fflags', '+genpts', '-movflags', '+faststart', '-y', outputPath]);
  } finally {
    try { unlinkSync(listFile); } catch { /* already gone */ }
  }
}

// --- Download ---

export async function downloadVideo(videoId: string, options: DownloadOptions = {}): Promise<DownloadResult | DurationWarning> {
  const config = getConfig();
  const quality = options.quality ?? config.download.defaultQuality;
  const type = options.type ?? config.download.defaultType;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const { title, durationSeconds } = await getInfo(url);
  const warning = guard(title, durationSeconds, options.force, 'downloading');
  if (warning) return warning;

  const audioOnly = type === 'audio';
  const format = audioOnly
    ? (options.format && options.format !== 'mp4' ? options.format : 'm4a')
    : (options.format ?? config.download.defaultFormat);

  const target = resolve(options.outputPath ?? `${sanitizeFilename(title)}.${format}`);
  const outDir = dirname(target);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const args = audioOnly
    ? ['-f', 'ba/b', '-x', '--audio-format', format]
    : type === 'video'
      ? ['-f', 'bv*/b', '-S', formatSort(quality), '--remux-video', format]
      : ['-f', 'bv*+ba/b', '-S', formatSort(quality), '--merge-output-format', format];

  // Let yt-dlp choose the extension, then report the path it actually wrote.
  const template = target.replace(/\.[^.\\/]+$/, '') + '.%(ext)s';
  const stdout = await ytdlp([...args, '-o', template, '--print', 'after_move:filepath', url], DOWNLOAD_TIMEOUT_MS);
  const filePath = lastLine(stdout) || target;

  return {
    filePath,
    title,
    duration: formatSeconds(durationSeconds),
    durationSeconds,
    fileSize: formatFileSize(statSync(filePath).size),
    format,
  };
}

// --- Clips ---

export async function createClips(
  videoId: string,
  clips: ClipDefinition[],
  options: { outputDir?: string; quality?: DownloadQuality; accurate?: boolean; force?: boolean; highlightReel?: boolean } = {},
): Promise<HighlightReelResult | ClipResult[] | DurationWarning> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputDir = resolve(options.outputDir ?? '.');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const { title, durationSeconds } = await getInfo(url);
  const parsed = clips.map((clip, i) => {
    const start = parseTimestamp(clip.startTime);
    const end = parseTimestamp(clip.endTime);
    if (start >= end) throw new Error(`Clip ${i + 1}: startTime (${clip.startTime}) must be before endTime (${clip.endTime})`);
    if (durationSeconds && end > durationSeconds + 1) {
      throw new Error(`Clip ${i + 1}: endTime (${clip.endTime}) is past the end of the video (${formatSeconds(durationSeconds)})`);
    }
    return { ...clip, start, end, label: clip.label ?? `clip${i + 1}` };
  });

  const total = parsed.reduce((sum, c) => sum + (c.end - c.start), 0);
  const warning = guard(title, total, options.force, 'clipping this much footage');
  if (warning) return warning;

  const quality = options.quality ?? getConfig().download.defaultQuality;
  const safeName = sanitizeFilename(title);
  const fileLabels = uniqueNames(parsed.map((c) => sanitizeFilename(c.label)));
  const results: ClipResult[] = [];

  for (const [i, clip] of parsed.entries()) {
    const outputFile = join(outputDir, `${safeName} - ${fileLabels[i]}.mp4`);
    const tmp = join(tmpdir(), `yt-clip-${randomUUID().slice(0, 8)}.%(ext)s`);
    // Download only the requested range rather than the whole video.
    const args = ['-f', 'bv*+ba/b', '-S', formatSort(quality), '--merge-output-format', 'mp4', '--download-sections', `*${clip.start}-${clip.end}`];
    if (options.accurate) args.push('--force-keyframes-at-cuts');
    const stdout = await ytdlp([...args, '-o', tmp, '--print', 'after_move:filepath', url], DOWNLOAD_TIMEOUT_MS);
    const written = lastLine(stdout);
    if (!written || !existsSync(written)) throw new Error(`Clip "${clip.label}" was not written`);
    if (existsSync(outputFile)) unlinkSync(outputFile);
    // Normalise timestamps so players start the clip at 0:00.
    await runFfmpeg(['-i', written, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', '-y', outputFile]);
    try { unlinkSync(written); } catch { /* already gone */ }

    results.push({
      filePath: outputFile,
      label: clip.label,
      startTime: clip.startTime,
      endTime: clip.endTime,
      clipDuration: formatSeconds(clip.end - clip.start),
      fileSize: formatFileSize(statSync(outputFile).size),
    });
  }

  if ((options.highlightReel ?? true) && results.length >= 2) {
    const reelPath = join(outputDir, `${safeName} - highlight-reel.mp4`);
    await concatClips(results.map((c) => c.filePath), reelPath);
    return {
      highlightReel: { filePath: reelPath, duration: formatSeconds(total), fileSize: formatFileSize(statSync(reelPath).size) },
      clips: results,
    };
  }
  return results;
}

// --- Frames ---

export interface Frame {
  time: number;
  filePath: string;
}

const FRAME_TIMEOUT_MS = 60_000;

/**
 * Grab still frames at the given times. First tries seeking straight into the stream (fast,
 * one yt-dlp call); if YouTube refuses direct access, downloads a two-second section per frame.
 */
export async function extractFrames(videoId: string, times: number[], options: { height?: number; outputDir?: string } = {}): Promise<Frame[]> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const height = options.height ?? 720;
  const dir = options.outputDir ? resolve(options.outputDir) : join(tmpdir(), `yt-frames-${videoId}-${randomUUID().slice(0, 6)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const select = `bv*[height<=${height}][vcodec^=avc1]/bv*[height<=${height}]/b[height<=${height}]/b`;
  const frames: Frame[] = [];

  // ffmpeg reading the stream itself must go through the same proxy as yt-dlp, or YouTube sees
  // a different IP than the URL was issued to. ffmpeg only speaks plain http:// proxies; with any
  // other kind, skip straight to the yt-dlp route, which honours it.
  const proxy = proxyUrl();
  const directOk = !proxy || /^http:\/\//i.test(proxy);
  const proxyArgs = proxy && directOk ? ['-http_proxy', proxy] : [];

  let stream: string | null = null;
  if (directOk) {
    try {
      stream = lastLine(await ytdlp(['-f', select, '-g', url], INFO_TIMEOUT_MS)) || null;
    } catch {
      stream = null;
    }
  }

  for (const [i, time] of times.entries()) {
    const filePath = join(dir, `${videoId}-${i + 1}-at-${Math.floor(time)}s.jpg`);
    let ok = false;
    if (stream) {
      try {
        await runFfmpeg([...proxyArgs, '-ss', String(time), '-i', stream, '-frames:v', '1', '-q:v', '3', '-y', filePath], FRAME_TIMEOUT_MS);
        ok = existsSync(filePath);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      const tmp = join(tmpdir(), `yt-frame-${randomUUID().slice(0, 8)}.%(ext)s`);
      const written = lastLine(await ytdlp(['-f', select, '--download-sections', `*${time}-${time + 2}`, '-o', tmp, '--print', 'after_move:filepath', url], FRAME_TIMEOUT_MS));
      try {
        await runFfmpeg(['-i', written, '-frames:v', '1', '-q:v', '3', '-y', filePath], FRAME_TIMEOUT_MS);
      } finally {
        try { unlinkSync(written); } catch { /* already gone */ }
      }
    }
    frames.push({ time, filePath });
  }
  return frames;
}
