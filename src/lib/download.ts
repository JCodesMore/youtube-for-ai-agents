import { existsSync, mkdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { requireBinary } from './binaries.js';
import { runProcess } from './process.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import { proxyUrl } from './network.js';
import { YouTubeToolError } from './errors.js';
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
  /** Width x height actually saved, which can be below the quality asked for. Video only. */
  resolution?: string;
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

/** What a saved clip or reel measures, read from the file rather than from the request. */
export interface MediaFileSummary {
  filePath: string;
  duration: string;
  durationSeconds: number;
  resolution?: string;
  fileSize: string;
}

export interface ClipResult extends MediaFileSummary {
  label: string;
  startTime: string;
  endTime: string;
}

export interface ReelSummary extends MediaFileSummary {
  clipCount: number;
}

/** One shape for one clip, several clips, or clips plus their reel. */
export interface ClipsResult {
  clips: ClipResult[];
  highlightReel?: ReelSummary;
  notes?: string[];
}

const INFO_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

// --- Small helpers ---

const TIMESTAMP_HINT = "Use seconds (90), M:SS (1:30), H:MM:SS (1:02:03), or YouTube's 1m30s / 1h2m3s.";
/** YouTube's own `t=` style: 1h2m3s, 1m02s, 90s, 2m. */
const UNIT_TIMESTAMP = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i;

export function parseTimestamp(input: string): number {
  const trimmed = String(input).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const units = trimmed.match(UNIT_TIMESTAMP);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  const parts = trimmed.split(':').map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (parts.some(isNaN) || parts.length < 2 || parts.length > 3) {
    throw new YouTubeToolError('invalid_input', `Invalid timestamp: "${input}".`, TIMESTAMP_HINT);
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

/**
 * yt-dlp format selector for audio. YouTube serves AAC (m4a) and Opus natively: pick the matching
 * stream so yt-dlp copies it instead of transcoding the other one.
 */
export function audioFormatSelector(format: string): string {
  const native: Record<string, string> = { m4a: 'ba[ext=m4a]', aac: 'ba[ext=m4a]', opus: 'ba[acodec=opus]' };
  return [native[format.toLowerCase()], 'ba', 'b'].filter(Boolean).join('/');
}

/**
 * Where a download goes. An existing folder, or a path ending in a slash, gets `fileName` inside
 * it; anything else is the file path itself.
 */
export function downloadTarget(outputPath: string | undefined, fileName: string, isDirectory: (p: string) => boolean): string {
  if (!outputPath) return resolve(fileName);
  if (/[\\/]$/.test(outputPath) || isDirectory(resolve(outputPath))) return join(resolve(outputPath), fileName);
  return resolve(outputPath);
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
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

/**
 * Audio is about 1 MB a minute and most podcast episodes run past the video limit, so audio-only
 * downloads only warn past this many minutes (or the configured limit, if that is higher).
 */
const AUDIO_GUARD_MINUTES = 180;

function guard(
  title: string, durationSeconds: number, force: boolean | undefined, action: string,
  maxMinutes = getConfig().download.maxDurationMinutes,
): DurationWarning | null {
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

export interface MediaInfo {
  durationSeconds: number;
  hasAudio: boolean;
  /** Of the first video stream; 0 when there is none or it can't be read. */
  width: number;
  height: number;
  fps: number;
}

/** Duration, audio presence, and the first video stream's size and frame rate, read from what `ffmpeg -i` prints. */
export function parseMediaInfo(ffmpegOutput: string): MediaInfo {
  const m = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = ffmpegOutput.match(/Stream #\d+:\d+.*: Video:.*/)?.[0] ?? '';
  const size = video.match(/[ ,](\d{2,5})x(\d{2,5})(?=[ ,[]|$)/);
  const fps = video.match(/([\d.]+) fps/);
  return {
    durationSeconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(ffmpegOutput),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    fps: fps ? Number(fps[1]) : 0,
  };
}

async function probeMedia(filePath: string): Promise<MediaInfo> {
  const bin = await requireBinary('ffmpeg');
  // ffmpeg with no output exits non-zero but prints the stream details first.
  const stderr = await runProcess(bin, ['-hide_banner', '-i', filePath], { timeoutMs: INFO_TIMEOUT_MS })
    .then((r) => r.stderr)
    .catch((e: Error) => e.message);
  return parseMediaInfo(stderr);
}

const DURATION_DECIMALS = 2;

/** Measure a saved file, so results report what was written rather than what was asked for. */
export async function summarizeFile(filePath: string): Promise<MediaFileSummary> {
  const info = await probeMedia(filePath);
  const factor = 10 ** DURATION_DECIMALS;
  return {
    filePath,
    duration: formatSeconds(info.durationSeconds),
    durationSeconds: Math.round(info.durationSeconds * factor) / factor,
    ...(info.width && info.height ? { resolution: `${info.width}x${info.height}` } : {}),
    fileSize: formatFileSize(statSync(filePath).size),
  };
}

export interface Canvas { width: number; height: number; fps: number }

const DEFAULT_CANVAS: Canvas = { width: 1280, height: 720, fps: 30 };
/** Reels are encoded at most 1080p (short side): bigger sources are scaled down to keep the encode quick. */
const REEL_MAX_SHORT_SIDE = 1080;
const REEL_MAX_FPS = 60;
const WIDESCREEN = 16 / 9;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

const NTSC_DENOMINATOR = 1001;
/** ffmpeg prints rates to two decimals, so a printed rate is within this of the real one. */
const PRINTED_FPS_TOLERANCE = 0.006;

/**
 * The rate to give ffmpeg's fps filter. ffmpeg prints NTSC rates rounded (23.98, 29.97, 59.94);
 * the exact fraction (24000/1001) keeps every source frame instead of doubling one now and then.
 */
export function frameRate(fps: number): string {
  if (Number.isInteger(fps)) return String(fps);
  const ntsc = Math.round((fps * NTSC_DENOMINATOR) / 1000) * 1000;
  return Math.abs(ntsc / NTSC_DENOMINATOR - fps) <= PRINTED_FPS_TOLERANCE ? `${ntsc}/${NTSC_DENOMINATOR}` : String(fps);
}

/**
 * The reel's frame, picked from its clips. Clips that all share one size keep it. Mixed clips get
 * a 16:9 frame, or 9:16 when most are vertical, as sharp as the sharpest clip. The frame rate is
 * the highest among the clips, so none of them stutters.
 */
export function chooseCanvas(clips: Array<Pick<MediaInfo, 'width' | 'height' | 'fps'>>): Canvas {
  const sized = clips.filter((c) => c.width > 0 && c.height > 0);
  const fps = Math.min(REEL_MAX_FPS, Math.max(0, ...clips.map((c) => c.fps))) || DEFAULT_CANVAS.fps;
  if (!sized.length) return { ...DEFAULT_CANVAS, fps };
  const first = sized[0];
  let width: number;
  let height: number;
  if (sized.every((c) => c.width === first.width && c.height === first.height)) {
    ({ width, height } = first);
  } else {
    const vertical = sized.filter((c) => c.height > c.width).length > sized.length / 2;
    const short = Math.max(...sized.map((c) => Math.min(c.width, c.height)));
    [width, height] = vertical ? [short, short * WIDESCREEN] : [short * WIDESCREEN, short];
  }
  const scale = Math.min(1, REEL_MAX_SHORT_SIDE / Math.min(width, height));
  return { width: even(width * scale), height: even(height * scale), fps };
}

/** Fallback length for generated silence when a clip's duration can't be read; concat pads the rest. */
const SILENCE_FALLBACK_SECONDS = 0.1;
const REEL_AUDIO_FORMAT = 'aformat=sample_rates=48000:channel_layouts=stereo';

/**
 * Join clips into one MP4, re-encoded so every join is clean. Each clip's audio and video are first
 * padded back to the clip's own 0:00: keyframe-cut clips start their video on the keyframe before
 * the cut and their audio on the cut itself, and joining them as they are drifts the sound.
 */
export async function concatClips(clipPaths: string[], outputPath: string): Promise<void> {
  const inputs = clipPaths.flatMap((p) => ['-i', p]);
  const media = await Promise.all(clipPaths.map(probeMedia));
  const { width, height, fps } = chooseCanvas(media);
  // A clip with no audio stream (video-only download) gets silence of the same length.
  const audio = (i: number) => media[i].hasAudio
    ? `[${i}:a]aresample=48000:async=1:first_pts=0,${REEL_AUDIO_FORMAT}[a${i}]`
    : `anullsrc=r=48000:cl=stereo,atrim=duration=${media[i].durationSeconds || SILENCE_FALLBACK_SECONDS},${REEL_AUDIO_FORMAT}[a${i}]`;
  const video = (i: number) =>
    `[${i}:v]fps=${frameRate(fps)}:start_time=0,scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`;
  const streams = clipPaths.map((_, i) => `${video(i)};${audio(i)}`).join(';');
  const joined = clipPaths.map((_, i) => `[v${i}][a${i}]`).join('');
  await runFfmpeg([
    ...inputs,
    '-filter_complex', `${streams};${joined}concat=n=${clipPaths.length}:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', '-y', outputPath,
  ]);
}

// --- Download ---

export async function downloadVideo(videoId: string, options: DownloadOptions = {}): Promise<DownloadResult | DurationWarning> {
  const config = getConfig();
  const quality = options.quality ?? config.download.defaultQuality;
  const type = options.type ?? config.download.defaultType;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const audioOnly = type === 'audio';
  const { title, durationSeconds } = await getInfo(url);
  const maxMinutes = audioOnly
    ? Math.max(AUDIO_GUARD_MINUTES, config.download.maxDurationMinutes)
    : config.download.maxDurationMinutes;
  const warning = guard(title, durationSeconds, options.force, 'downloading', maxMinutes);
  if (warning) return warning;

  const format = audioOnly
    ? (options.format && options.format !== 'mp4' ? options.format : 'm4a')
    : (options.format ?? config.download.defaultFormat);

  const target = downloadTarget(options.outputPath, `${sanitizeFilename(title)}.${format}`, isDirectory);
  const outDir = dirname(target);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const args = audioOnly
    ? ['-f', audioFormatSelector(format), '-x', '--audio-format', format]
    : type === 'video'
      ? ['-f', 'bv*/b', '-S', formatSort(quality), '--remux-video', format]
      : ['-f', 'bv*+ba/b', '-S', formatSort(quality), '--merge-output-format', format];

  // Let yt-dlp choose the extension, then report the path it actually wrote.
  const template = target.replace(/\.[^.\\/]+$/, '') + '.%(ext)s';
  const stdout = await ytdlp([...args, '-o', template, '--print', 'after_move:filepath', url], DOWNLOAD_TIMEOUT_MS);
  const filePath = lastLine(stdout) || target;
  const saved = audioOnly ? null : await probeMedia(filePath);

  return {
    filePath,
    title,
    duration: formatSeconds(durationSeconds),
    durationSeconds,
    ...(saved?.width && saved.height ? { resolution: `${saved.width}x${saved.height}` } : {}),
    fileSize: formatFileSize(statSync(filePath).size),
    format,
  };
}

// --- Clips ---

export async function createClips(
  videoId: string,
  clips: ClipDefinition[],
  options: { outputDir?: string; quality?: DownloadQuality; accurate?: boolean; force?: boolean; highlightReel?: boolean } = {},
): Promise<ClipsResult | DurationWarning> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputDir = resolve(options.outputDir ?? '.');

  const { title, durationSeconds } = await getInfo(url);
  const { planned, notes } = planClips(clips, durationSeconds);

  const total = planned.reduce((sum, c) => sum + (c.end - c.start), 0);
  const warning = guard(title, total, options.force, 'clipping this much footage');
  if (warning) return warning;

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const quality = options.quality ?? getConfig().download.defaultQuality;
  const safeName = sanitizeFilename(title);
  const fileLabels = uniqueNames(planned.map((c) => sanitizeFilename(c.label)));
  const results: ClipResult[] = [];

  for (const [i, clip] of planned.entries()) {
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

    results.push({ label: clip.label, startTime: clip.startTime, endTime: clip.endTime, ...(await summarizeFile(outputFile)) });
  }

  const result: ClipsResult = { clips: results };
  if ((options.highlightReel ?? true) && results.length >= 2) {
    const reelPath = join(outputDir, `${safeName} - highlight-reel.mp4`);
    await concatClips(results.map((c) => c.filePath), reelPath);
    result.highlightReel = { ...(await summarizeFile(reelPath)), clipCount: results.length };
  }
  if (notes.length) result.notes = notes;
  return result;
}

interface PlannedClip extends ClipDefinition { start: number; end: number; label: string }

/**
 * Check clip times against the video before downloading anything. An end past the video's end is
 * read as "to the end" and clamped, with a note; anything else unusable is the caller's to fix.
 */
export function planClips(clips: ClipDefinition[], videoSeconds: number): { planned: PlannedClip[]; notes: string[] } {
  const length = videoSeconds ? `the video is ${formatSeconds(videoSeconds)} long` : '';
  const notes: string[] = [];
  const planned = clips.map((clip, i) => {
    const name = `Clip ${i + 1}${clip.label ? ` ("${clip.label}")` : ''}`;
    const start = parseTimestamp(clip.startTime);
    let end = parseTimestamp(clip.endTime);
    let endTime = clip.endTime;
    if (videoSeconds && start >= videoSeconds) {
      throw new YouTubeToolError('invalid_input', `${name}: startTime (${clip.startTime}) is past the end of the video.`, `Pick a start before the end; ${length}.`);
    }
    if (videoSeconds && end > videoSeconds) {
      end = videoSeconds;
      endTime = formatSeconds(videoSeconds);
      notes.push(`${name}: endTime ${clip.endTime} is past the end of the video, so the clip runs to the end (${endTime}).`);
    }
    if (start >= end) {
      throw new YouTubeToolError(
        'invalid_input',
        `${name}: startTime (${clip.startTime}) must be before endTime (${clip.endTime}).`,
        `Swap or fix the two times${length ? `; ${length}` : ''}.`,
      );
    }
    return { ...clip, endTime, start, end, label: clip.label ?? `clip${i + 1}` };
  });
  return { planned, notes };
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

  let firstError: unknown;
  for (const [i, time] of times.entries()) {
    const filePath = join(dir, `${videoId}-${i + 1}-at-${Math.floor(time)}s.jpg`);
    // A file left by an earlier run must not pass for this run's frame.
    try { unlinkSync(filePath); } catch { /* not there */ }
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
      try {
        const written = lastLine(await ytdlp(['-f', select, '--download-sections', `*${time}-${time + 2}`, '-o', tmp, '--print', 'after_move:filepath', url], FRAME_TIMEOUT_MS));
        try {
          await runFfmpeg(['-i', written, '-frames:v', '1', '-q:v', '3', '-y', filePath], FRAME_TIMEOUT_MS);
        } finally {
          try { unlinkSync(written); } catch { /* already gone */ }
        }
      } catch (error) {
        // One unreadable moment shouldn't cost the others; the caller reports it as missing.
        firstError ??= error;
      }
    }
    if (existsSync(filePath)) frames.push({ time, filePath });
  }
  // Nothing at all came back: the video itself is the problem (private, blocked, rate-limited),
  // so let the caller report why.
  if (!frames.length && firstError) {
    if (!options.outputDir) rmSync(dir, { recursive: true, force: true });
    throw firstError;
  }
  return frames;
}
