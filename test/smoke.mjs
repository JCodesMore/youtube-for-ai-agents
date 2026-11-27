#!/usr/bin/env node
// End-to-end check of the built server over the real MCP protocol, the way an agent uses it.
// Talks to live YouTube, so it needs a network connection.
//   node test/smoke.mjs            read-only tools
//   node test/smoke.mjs --media    also download a short clip (fetches yt-dlp/ffmpeg if missing)

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXPECTED_TOOLS = [
  'youtube_search', 'youtube_get_transcript', 'youtube_get_video_info', 'youtube_get_channel_videos',
  'youtube_get_channel_info', 'youtube_get_playlist', 'youtube_get_comments', 'youtube_get_frames',
  'youtube_download', 'youtube_clip', 'youtube_highlight_reel',
];

const media = process.argv.includes('--media');
const home = mkdtempSync(join(tmpdir(), 'yt-smoke-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  // A fresh data folder, like a brand-new user (keeps any yt-dlp/ffmpeg on PATH).
  env: { ...process.env, YOUTUBE_AI_AGENTS_HOME: home },
  stderr: 'pipe',
});
const client = new Client({ name: 'smoke-test', version: '1.0.0' });

let failures = 0;
async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    console.log(`ok    ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name} - ${e.message}`);
  }
}

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content.map((c) => c.text).join('\n');
  if (res.isError) throw new Error(text.slice(0, 400));
  return text;
}

try {
  await client.connect(transport);
  const server = client.getServerVersion();
  await check('server starts', async () => `${server.name} ${server.version}`);
  await check('instructions sent', async () => {
    if (!client.getInstructions()?.includes('youtube_get_transcript')) throw new Error('missing');
  });
  await check('lists all tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
    if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
    return `${names.length} tools`;
  });
  await check('search', async () => {
    const out = JSON.parse(await call('youtube_search', { query: 'how to tie a bowline knot', limit: 3 }));
    if (!out.results?.length) throw new Error('no results');
    return out.results[0].title;
  });
  await check('video info from a share URL', async () => {
    const out = JSON.parse(await call('youtube_get_video_info', { videoId: 'https://youtu.be/jNQXAC9IVRw?si=abc', detail: 'brief' }));
    if (out.title !== 'Me at the zoo') throw new Error(`got ${out.title}`);
  });
  await check('transcript from a watch URL', async () => {
    const text = await call('youtube_get_transcript', { videoId: 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=3s' });
    if (!/elephants/i.test(text)) throw new Error(text.slice(0, 200));
  });
  await check('transcript picks the spoken language (TED talk with 50+ tracks)', async () => {
    const text = await call('youtube_get_transcript', { videoId: 'Ks-_Mh1QhMc', maxSegments: 5 });
    const header = JSON.parse(text.split('\n')[0]);
    if (!header.language.startsWith('en')) throw new Error(`got ${header.language}`);
    return `language ${header.language}`;
  });
  await check('transcript translated on request', async () => {
    const text = await call('youtube_get_transcript', { videoId: 'jNQXAC9IVRw', language: 'fr' });
    const header = JSON.parse(text.split('\n')[0]);
    if (header.language !== 'fr') throw new Error(`got ${header.language}`);
    return text.split('\n')[1];
  });
  await check('long transcript pages under the size cap', async () => {
    // A 3-hour podcast.
    const text = await call('youtube_get_transcript', { videoId: 'https://www.youtube.com/watch?v=n1E9IZfvGMA', format: 'timestamped' });
    const header = JSON.parse(text.split('\n')[0]);
    if (text.length > 70_000) throw new Error(`response ${text.length} chars`);
    return header.truncated ? `paged, next at ${header.nextStartTime}s` : `fits (${text.length} chars)`;
  });
  await check('channel videos from an @handle', async () => {
    const out = JSON.parse(await call('youtube_get_channel_videos', { channelUrl: '@TED', limit: 3 }));
    if (!out.videos?.length) throw new Error('no videos');
    return `${out.channelName}: ${out.videos[0].title}`;
  });
  await check('channel info from a URL', async () => {
    const out = JSON.parse(await call('youtube_get_channel_info', { channelId: 'https://www.youtube.com/@TED/videos' }));
    if (!out.name) throw new Error('no name');
    return `${out.name}, ${out.subscriberCount}`;
  });
  await check('playlist from a URL', async () => {
    const out = JSON.parse(await call('youtube_get_playlist', { playlistId: 'https://www.youtube.com/playlist?list=PLlT0ph_Ig5Rc8xVBw47aZfLsOGw-lxRWb', limit: 3 }));
    if (!out.videos?.length) throw new Error('no videos');
    return `${out.title} (${out.videoCount})`;
  });
  await check('comments', async () => {
    const out = JSON.parse(await call('youtube_get_comments', { videoId: 'dQw4w9WgXcQ', limit: 5 }));
    if (out.comments.length !== 5 || !out.comments[0].text) throw new Error(JSON.stringify(out).slice(0, 200));
    return `${out.totalComments} total; top: "${out.comments[0].text.slice(0, 50)}"`;
  });
  await check('search for playlists', async () => {
    const out = JSON.parse(await call('youtube_search', { query: 'lofi hip hop', type: 'playlist', limit: 3 }));
    if (!out.results?.length || out.results[0].type !== 'playlist') throw new Error(JSON.stringify(out).slice(0, 200));
    return out.results[0].title;
  });
  await check('bad input gives an actionable error', async () => {
    const res = await client.callTool({ name: 'youtube_get_transcript', arguments: { videoId: 'not a video' } });
    const body = JSON.parse(res.content[0].text);
    if (!res.isError || body.kind !== 'invalid_input' || !body.hint) throw new Error(JSON.stringify(body));
  });

  if (media) {
    const out = mkdtempSync(join(tmpdir(), 'yt-media-'));
    await check('clip two moments and join them', async () => {
      const res = JSON.parse(await call('youtube_clip', {
        videoId: 'jNQXAC9IVRw',
        clips: [{ startTime: '0:01', endTime: '0:04', label: 'a' }, { startTime: '0:10', endTime: '0:14', label: 'b' }],
        outputDir: out,
      }));
      if (!existsSync(res.highlightReel.filePath)) throw new Error('reel missing');
      return `${res.clips.length} clips + reel ${res.highlightReel.fileSize}`;
    });
    await check('frames come back as images', async () => {
      const res = await client.callTool({ name: 'youtube_get_frames', arguments: { videoId: 'jNQXAC9IVRw', times: ['0:05', 12], quality: '360p' } });
      if (res.isError) throw new Error(res.content[0].text.slice(0, 300));
      const images = res.content.filter((c) => c.type === 'image');
      if (images.length !== 2 || images[0].data.length < 1000) throw new Error(`got ${images.length} images`);
      return `${images.length} frames, ${Math.round(images[0].data.length / 1024)} KB base64`;
    });
    await check('download audio', async () => {
      const res = JSON.parse(await call('youtube_download', { videoId: 'jNQXAC9IVRw', type: 'audio', outputPath: join(out, 'zoo.m4a') }));
      if (!existsSync(res.filePath)) throw new Error('file missing');
      return `${res.filePath.split(/[\\/]/).pop()} ${res.fileSize}`;
    });
    rmSync(out, { recursive: true, force: true });
  }
} finally {
  await client.close().catch(() => {});
  rmSync(home, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
