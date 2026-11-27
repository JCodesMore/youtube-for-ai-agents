import { describe, expect, it } from 'vitest';
import { findOnPath, ytDlpVersionAtLeast } from '../src/lib/binaries.js';
import { parseMediaInfo, uniqueNames } from '../src/lib/download.js';

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

  it('reads duration and audio presence', () => {
    expect(parseMediaInfo(header + video + audio)).toEqual({ durationSeconds: 65.5, hasAudio: true });
  });

  it('notices a video-only clip, so the reel can add silence', () => {
    expect(parseMediaInfo(header + video).hasAudio).toBe(false);
  });
});
