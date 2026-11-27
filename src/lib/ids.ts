/**
 * Accept whatever a person pastes (a bare ID, a watch, share, Shorts, live or embed URL, with
 * or without tracking parameters) and turn it into the ID YouTube's APIs expect.
 */

import { YouTubeToolError } from './errors.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD|UL|OLAK5uy_)[A-Za-z0-9_-]{8,}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

const VIDEO_PATH_PREFIXES = ['shorts', 'live', 'embed', 'v', 'e'];
const CHANNEL_PATH = /^(@|channel$|c$|user$)/;

/** Pasted text often arrives as <url>, in quotes, or with the sentence's full stop attached. */
function clean(input: string): string {
  return input.trim().replace(/^[<"'(\[]+|[>"')\].,;:!?]+$/g, '').trim();
}

/**
 * A YouTube Clip link (youtube.com/clip/…), cleaned up and with its scheme, or null for anything
 * else. Only YouTube can say which video a clip comes from.
 */
export function clipLink(input: string): string | null {
  const url = tryUrl(clean(input));
  return url && url.pathname.split('/').filter(Boolean)[0] === 'clip' ? url.href : null;
}

export function isClipLink(input: string): boolean {
  return clipLink(input) !== null;
}

function tryUrl(input: string): URL | null {
  const withScheme = /^[a-z]+:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withScheme);
    return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export function parseVideoId(input: string): string {
  const trimmed = clean(input);
  if (VIDEO_ID.test(trimmed)) return trimmed;

  const url = tryUrl(trimmed);
  if (url) {
    if (/youtu\.be$/i.test(url.hostname)) {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (id && VIDEO_ID.test(id)) return id;
    }
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && VIDEO_PATH_PREFIXES.includes(parts[0]) && VIDEO_ID.test(parts[1])) return parts[1];
    if (parts[0] === 'playlist' || (url.searchParams.get('list') && !parts.length)) {
      throw new YouTubeToolError('invalid_input', `"${input}" is a playlist link, not a video.`, 'Use youtube_get_playlist to list its videos, then pass one video\'s link or ID.');
    }
    if (parts[0] && CHANNEL_PATH.test(parts[0])) {
      throw new YouTubeToolError('invalid_input', `"${input}" is a channel link, not a video.`, 'Use youtube_get_channel_videos to list its videos, then pass one video\'s link or ID.');
    }
  }

  throw new Error(`"${input}" doesn't look like a YouTube video. Pass a video URL or its 11-character ID.`);
}

/** Read a start time from a URL (t=90, t=1m30s, start=90), if one was shared. */
export function parseStartTime(input: string): number | undefined {
  const url = tryUrl(clean(input));
  const raw = url?.searchParams.get('t') ?? url?.searchParams.get('start');
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parsePlaylistId(input: string): string {
  const trimmed = clean(input);
  if (PLAYLIST_ID.test(trimmed)) return trimmed;
  const url = tryUrl(trimmed);
  const list = url?.searchParams.get('list');
  if (list) return list;
  // Accept unusual IDs as-is rather than refusing; YouTube will say if it is wrong.
  if (!url && /^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(`"${input}" doesn't look like a YouTube playlist. Pass a playlist URL or its ID.`);
}

/**
 * The video a Mix (a playlist ID starting "RD", generated per viewer) grows from: the link's
 * v= video, or the 11 characters after "RD". Undefined for anything else.
 */
export function mixSeedVideo(input: string, playlistId: string): string | undefined {
  if (!playlistId.startsWith('RD')) return undefined;
  const v = tryUrl(clean(input))?.searchParams.get('v');
  if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  const seed = playlistId.slice(2);
  return /^[A-Za-z0-9_-]{11}$/.test(seed) ? seed : undefined;
}

export type ChannelRef =
  | { kind: 'id'; id: string }
  | { kind: 'url'; url: string };

/** Normalise a channel reference: UC… ID, @handle, bare handle, or any channel URL. */
export function parseChannelRef(input: string): ChannelRef {
  const trimmed = clean(input);
  if (CHANNEL_ID.test(trimmed)) return { kind: 'id', id: trimmed };
  if (trimmed.startsWith('@')) return { kind: 'url', url: `https://www.youtube.com/${trimmed}` };

  const url = tryUrl(trimmed);
  if (url) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel' && parts[1] && CHANNEL_ID.test(parts[1])) return { kind: 'id', id: parts[1] };
    // Drop trailing tabs such as /videos or /about so the URL resolves to the channel itself.
    const base = parts[0]?.startsWith('@') ? `/${parts[0]}` : `/${parts.slice(0, 2).join('/')}`;
    return { kind: 'url', url: `https://www.youtube.com${base}` };
  }

  if (/^[A-Za-z0-9._-]+$/.test(trimmed)) return { kind: 'url', url: `https://www.youtube.com/@${trimmed}` };
  throw new Error(`"${input}" doesn't look like a YouTube channel. Pass an @handle, a channel URL, or a UC… channel ID.`);
}
