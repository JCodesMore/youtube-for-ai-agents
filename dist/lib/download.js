import { existsSync, mkdirSync, unlinkSync, statSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { YtDlp } from 'ytdlp-nodejs';
const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
import { getConfig } from './user-config.js';
let ytdlpInstance = null;
function getYtDlp() {
    if (!ytdlpInstance) {
        ytdlpInstance = new YtDlp({
            ffmpegPath: ffmpegPath ?? undefined,
        });
    }
    return ytdlpInstance;
}
function toYtDlpQuality(quality) {
    if (quality === 'best')
        return 'highest';
    if (quality === 'bestefficiency')
        return '720p';
    return quality;
}
// --- Timestamp parsing ---
export function parseTimestamp(input) {
    const trimmed = input.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }
    const parts = trimmed.split(':').map(Number);
    if (parts.some(isNaN)) {
        throw new Error(`Invalid timestamp: "${input}". Use seconds (90), MM:SS (1:30), or HH:MM:SS (1:30:00)`);
    }
    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2)
        return parts[0] * 60 + parts[1];
    throw new Error(`Invalid timestamp: "${input}". Use seconds (90), MM:SS (1:30), or HH:MM:SS (1:30:00)`);
}
export function formatSeconds(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}
function sanitizeFilename(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}
export function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
// --- FFmpeg helpers ---
function assertFfmpeg() {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found. Ensure ffmpeg-static is installed.');
    }
    return ffmpegPath;
}
function runFfmpeg(args) {
    const bin = assertFfmpeg();
    return new Promise((resolve, reject) => {
        const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', reject);
    });
}
export function getVideoDuration(filePath) {
    const bin = assertFfmpeg();
    return new Promise((resolve, reject) => {
        const proc = spawn(bin, ['-i', filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', () => {
            const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (match) {
                const hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const seconds = parseInt(match[3]);
                const fraction = parseInt(match[4]) / 100;
                resolve(hours * 3600 + minutes * 60 + seconds + fraction);
            }
            else {
                resolve(0);
            }
        });
        proc.on('error', reject);
    });
}
export async function concatClips(clipPaths, outputPath, options) {
    if (options?.reencode) {
        // Use concat filter with re-encoding for multi-source clips.
        // This normalizes timestamps, frame rates, and codecs across different videos.
        const inputs = clipPaths.flatMap(p => ['-i', p]);
        const filterParts = clipPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
        const filterComplex = `${filterParts}concat=n=${clipPaths.length}:v=1:a=1[v][a]`;
        await runFfmpeg([
            ...inputs,
            '-filter_complex', filterComplex,
            '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart', '-y', outputPath,
        ]);
    }
    else {
        // Use concat demuxer with stream copy — fast, but only safe for same-source clips.
        const listFile = join(tmpdir(), `yt-concat-${randomUUID().slice(0, 8)}.txt`);
        const listContent = clipPaths
            .map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
            .join('\n');
        writeFileSync(listFile, listContent);
        try {
            await runFfmpeg([
                '-f', 'concat', '-safe', '0', '-i', listFile,
                '-c', 'copy', '-fflags', '+genpts',
                '-movflags', '+faststart', '-y', outputPath,
            ]);
        }
        finally {
            try {
                unlinkSync(listFile);
            }
            catch { }
        }
    }
}
// --- Download ---
export async function downloadVideo(videoId, options = {}) {
    const config = getConfig();
    const quality = options.quality ?? config.download.defaultQuality;
    const type = options.type ?? config.download.defaultType;
    const format = options.format ?? config.download.defaultFormat;
    const ytdlp = getYtDlp();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdlp.getInfoAsync(url);
    const title = info.title ?? 'video';
    const durationSeconds = info.duration ?? 0;
    const duration = formatSeconds(durationSeconds);
    const maxMinutes = config.download.maxDurationMinutes;
    if (!options.force && durationSeconds > maxMinutes * 60) {
        return {
            warning: `This video is ${duration} long (exceeds the ${maxMinutes}-minute limit). It may take a while to download. Re-run with force: true to proceed.`,
            confirmed: false,
            title,
            duration,
            durationSeconds,
        };
    }
    const safeName = sanitizeFilename(title);
    const outputPath = options.outputPath ?? `${safeName}.${format}`;
    const resolvedOutput = resolve(outputPath);
    const outputDir = dirname(resolvedOutput);
    if (!existsSync(outputDir))
        mkdirSync(outputDir, { recursive: true });
    if (type === 'audio') {
        const audioFormat = format === 'mp4' ? 'm4a' : format;
        await ytdlp.download(url)
            .filter('audioonly')
            .type(audioFormat)
            .options({ output: resolvedOutput })
            .run();
    }
    else if (type === 'video') {
        await ytdlp.download(url)
            .filter('videoonly')
            .quality(toYtDlpQuality(quality))
            .type(format)
            .options({ output: resolvedOutput })
            .run();
    }
    else {
        await ytdlp.download(url)
            .filter('mergevideo')
            .quality(toYtDlpQuality(quality))
            .type(format)
            .options({ output: resolvedOutput })
            .run();
    }
    const fileSize = formatFileSize(statSync(resolvedOutput).size);
    return { filePath: resolvedOutput, title, duration, durationSeconds, fileSize, format };
}
// --- Download to temp (for clip tool) ---
export async function downloadToTemp(videoId, quality = 'best', force = false) {
    const config = getConfig();
    const ytdlp = getYtDlp();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdlp.getInfoAsync(url);
    const title = info.title ?? 'video';
    const durationSeconds = info.duration ?? 0;
    const duration = formatSeconds(durationSeconds);
    const maxMinutes = config.download.maxDurationMinutes;
    if (!force && durationSeconds > maxMinutes * 60) {
        return {
            warning: `This video is ${duration} long (exceeds the ${maxMinutes}-minute limit). Downloading is required before clipping. Re-run with force: true to proceed.`,
            confirmed: false,
            title,
            duration,
            durationSeconds,
        };
    }
    const tempMuxed = join(tmpdir(), `yt-${randomUUID().slice(0, 8)}-muxed.mp4`);
    await ytdlp.download(url)
        .filter('mergevideo')
        .quality(toYtDlpQuality(quality))
        .type('mp4')
        .options({ output: tempMuxed })
        .run();
    return { tempPath: tempMuxed, title, durationSeconds };
}
// --- Clip ---
export async function clipVideo(inputPath, outputPath, startSeconds, endSeconds, accurate = false) {
    const startStr = startSeconds.toString();
    const endStr = endSeconds.toString();
    const args = accurate
        ? ['-i', inputPath, '-ss', startStr, '-to', endStr, '-avoid_negative_ts', 'make_zero', '-y', outputPath]
        : ['-ss', startStr, '-to', endStr, '-i', inputPath, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-y', outputPath];
    await runFfmpeg(args);
}
export async function createClips(videoId, clips, options = {}) {
    const outputDir = resolve(options.outputDir ?? '.');
    if (!existsSync(outputDir))
        mkdirSync(outputDir, { recursive: true });
    const result = await downloadToTemp(videoId, options.quality, options.force);
    if ('warning' in result)
        return result;
    const { tempPath, title, durationSeconds } = result;
    const safeName = sanitizeFilename(title);
    const clipResults = [];
    try {
        for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const startSec = parseTimestamp(clip.startTime);
            const endSec = parseTimestamp(clip.endTime);
            if (startSec >= endSec) {
                throw new Error(`Clip ${i + 1}: startTime (${clip.startTime}) must be before endTime (${clip.endTime})`);
            }
            if (endSec > durationSeconds) {
                throw new Error(`Clip ${i + 1}: endTime (${clip.endTime}) exceeds video duration (${formatSeconds(durationSeconds)})`);
            }
            const label = clip.label ?? `clip${i + 1}`;
            const outputFile = join(outputDir, `${safeName} - ${label}.mp4`);
            await clipVideo(tempPath, outputFile, startSec, endSec, options.accurate ?? false);
            const fileSize = formatFileSize(statSync(outputFile).size);
            const clipDuration = formatSeconds(endSec - startSec);
            clipResults.push({
                filePath: outputFile,
                label,
                startTime: clip.startTime,
                endTime: clip.endTime,
                clipDuration,
                fileSize,
            });
        }
    }
    finally {
        try {
            unlinkSync(tempPath);
        }
        catch { }
    }
    const shouldCreateReel = (options.highlightReel ?? true) && clipResults.length >= 2;
    if (shouldCreateReel) {
        const reelPath = join(outputDir, `${safeName} - highlight-reel.mp4`);
        await concatClips(clipResults.map(c => c.filePath), reelPath);
        const reelSize = formatFileSize(statSync(reelPath).size);
        const totalSeconds = clipResults.reduce((sum, c) => {
            const start = parseTimestamp(c.startTime);
            const end = parseTimestamp(c.endTime);
            return sum + (end - start);
        }, 0);
        return {
            highlightReel: {
                filePath: reelPath,
                duration: formatSeconds(totalSeconds),
                fileSize: reelSize,
            },
            clips: clipResults,
        };
    }
    return clipResults;
}
//# sourceMappingURL=download.js.map