import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { findOnPath, ytDlpVersionAtLeast } from '../src/lib/binaries.js';
import {
  audioFormatSelector, chooseCanvas, downloadTarget, frameRate, parseMediaInfo, parseTimestamp, planClips, uniqueNames,
} from '../src/lib/download.js';
import { YouTubeToolError } from '../src/lib/errors.js';

describe('a yt-dlp on PATH is only used when it knows --js-runtimes', () => {
  it.each([
    ['2025.11.12', true],
    ['2026.11.23', true],
    ['2025.12.1', true],
    ['2025.11.12.234512', true], // nightly
    ['2025.11.11', false],
    ['2025.10.22', false],
    ['2024.12.31', false],
    ['2023.07.06\n', false],
  ])('%s -> %s', (version, ok) => expect(ytDlpVersionAtLeast(version)).toBe(ok));

  it('treats unreadable output as unknown', () => {
    expect(ytDlpVersionAtLeast('yt-dlp: command not found')).toBeNull();
  });
});

describe('findOnPath', () => {
  it('on Windows takes only .exe, since spawn without a shell cannot run .cmd or .bat', () => {
    const files = new Set(['C:\\shims\\yt-dlp.cmd', 'C:\\shims\\yt-dlp.bat', 'C:\\tools\\yt-dlp.exe']);
    const exists = (p: string) => files.has(p);
    expect(findOnPath('yt-dlp', 'C:\\shims;C:\\tools', 'win32', exists)).toBe('C:\\tools\\yt-dlp.exe');
    expect(findOnPath('yt-dlp', 'C:\\shims', 'win32', exists)).toBeNull();
  });

  it('elsewhere takes the bare name, first match wins', () => {
    const exists = (p: string) => p === '/usr/local/bin/yt-dlp' || p === '/usr/bin/yt-dlp';
    expect(findOnPath('yt-dlp', '/opt/none:/usr/local/bin:/usr/bin', 'linux', exists)).toBe('/usr/local/bin/yt-dlp');
  });
});

describe('uniqueNames keeps clips from overwriting each other', () => {
  it('numbers repeats, case-insensitively, without clashing with existing names', () => {
    expect(uniqueNames(['intro', 'Intro', 'intro (2)', 'outro', 'intro'])).toEqual([
      'intro', 'Intro (2)', 'intro (2) (2)', 'outro', 'intro (3)',
    ]);
  });
});

describe('parseMediaInfo', () => {
  const header = '  Duration: 00:01:05.50, start: 0.000000, bitrate: 900 kb/s\n';
  const video = '  Stream #0:0[0x1](und): Video: h264 (avc1 / 0x31637661), yuv420p, 1280x720, 30 fps\n';
  const audio = '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo\n';

  it('reads duration, audio presence, and the video size and frame rate', () => {
    expect(parseMediaInfo(header + video + audio)).toEqual({ durationSeconds: 65.5, hasAudio: true, width: 1280, height: 720, fps: 30 });
  });

  it('reads the size from a full ffmpeg stream line, not the codec tag', () => {
    const line = '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920 [SAR 1:1 DAR 9:16], 29.97 fps, 29.97 tbr, 30k tbn (default)\n';
    expect(parseMediaInfo(header + line)).toMatchObject({ width: 1080, height: 1920, fps: 29.97 });
  });

  it('notices a video-only clip, so the reel can add silence', () => {
    expect(parseMediaInfo(header + video).hasAudio).toBe(false);
  });
});

function inputError(run: () => unknown): YouTubeToolError {
  try { run(); } catch (error) { if (error instanceof YouTubeToolError) return error; throw error; }
  throw new Error('expected a YouTubeToolError');
}

describe('parseTimestamp', () => {
  it.each([
    ['1m02s', 62],
    ['1h2m3s', 3723],
    ['90s', 90],
    ['2m', 120],
    ['1:02', 62],
  ])('%s -> %s', (input, seconds) => expect(parseTimestamp(input)).toBe(seconds));

  it('rejects nonsense as invalid input with a hint on the forms it takes', () => {
    for (const bad of ['soon', '1:', 'm', '1:2:3:4']) {
      const error = inputError(() => parseTimestamp(bad));
      expect(error.kind).toBe('invalid_input');
      expect(error.hint).toMatch(/1:30/);
    }
  });
});

describe('planClips checks times against the video before downloading', () => {
  const videoSeconds = 307; // 5:07

  it('runs an end past the video to the end, and says so', () => {
    const { planned, notes } = planClips([{ startTime: '4:50', endTime: '6:00' }], videoSeconds);
    expect(planned[0]).toMatchObject({ start: 290, end: 307 });
    expect(notes[0]).toMatch(/runs to the end/);
  });

  it('turns a start after the end, or past the video, into invalid input naming the length', () => {
    for (const clip of [{ startTime: '1:20', endTime: '1:02' }, { startTime: '6:00', endTime: '6:30' }]) {
      const error = inputError(() => planClips([clip], videoSeconds));
      expect(error.kind).toBe('invalid_input');
      expect(error.hint).toMatch(/5m 7s/);
    }
  });
});

describe('downloadTarget', () => {
  const folders = new Set([resolve('music')]);
  const isDir = (p: string) => folders.has(p);

  it('saves <title>.<ext> inside a folder, existing or written with a trailing slash', () => {
    expect(downloadTarget('music', 'Song.m4a', isDir)).toBe(join(resolve('music'), 'Song.m4a'));
    expect(downloadTarget('new-folder/', 'Song.m4a', isDir)).toBe(join(resolve('new-folder'), 'Song.m4a'));
    expect(downloadTarget('new-folder\\', 'Song.m4a', isDir)).toBe(join(resolve('new-folder\\'), 'Song.m4a'));
  });

  it('treats anything else as the file path, and defaults to the current folder', () => {
    expect(downloadTarget('music/track.mp3', 'Song.mp3', isDir)).toBe(resolve('music/track.mp3'));
    expect(downloadTarget(undefined, 'Song.m4a', isDir)).toBe(resolve('Song.m4a'));
  });
});

describe('audioFormatSelector picks the stream YouTube already serves, so yt-dlp copies it', () => {
  it.each([
    ['m4a', 'ba[ext=m4a]/ba/b'],
    ['opus', 'ba[acodec=opus]/ba/b'],
    ['mp3', 'ba/b'],
  ])('%s -> %s', (format, selector) => expect(audioFormatSelector(format)).toBe(selector));
});

describe('chooseCanvas picks the reel frame from its clips', () => {
  const landscape720 = { width: 1280, height: 720, fps: 30 };
  const short1080 = { width: 1080, height: 1920, fps: 30 };

  it('keeps the size when every clip shares it', () => {
    expect(chooseCanvas([landscape720, landscape720])).toEqual({ width: 1280, height: 720, fps: 30 });
  });

  it('goes vertical when most clips are vertical', () => {
    expect(chooseCanvas([short1080, short1080, landscape720])).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it.each([
    [23.98, '24000/1001'],
    [29.97, '30000/1001'],
    [59.94, '60000/1001'],
    [30, '30'],
    [12.5, '12.5'],
  ])('gives ffmpeg the exact rate for a printed %s fps', (printed, rate) => expect(frameRate(printed)).toBe(rate));

  it('caps the size at 1080p and takes the highest frame rate', () => {
    expect(chooseCanvas([{ width: 3840, height: 2160, fps: 60 }, { width: 320, height: 240, fps: 25 }])).toEqual({ width: 1920, height: 1080, fps: 60 });
  });
});
