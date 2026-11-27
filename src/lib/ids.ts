/**
 * Accept whatever a person pastes (a bare ID, a watch, share, Shorts, live or embed URL, with
 * or without tracking parameters) and turn it into the ID YouTube's APIs expect.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD|UL|OLAK5uy_)[A-Za-z0-9_-]{8,}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

const VIDEO_PATH_PREFIXES = ['shorts', 'live', 'embed', 'v', 'e'];

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
  const trimmed = input.trim();
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
  }

  throw new Error(`"${input}" doesn't look like a YouTube video. Pass a video URL or its 11-character ID.`);
}

/** Read a start time from a URL (t=90, t=1m30s, start=90), if one was shared. */
export function parseStartTime(input: string): number | undefined {
  const url = tryUrl(input.trim());
  const raw = url?.searchParams.get('t') ?? url?.searchParams.get('start');
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parsePlaylistId(input: string): string {
  const trimmed = input.trim();
  if (PLAYLIST_ID.test(trimmed)) return trimmed;
  const url = tryUrl(trimmed);
  const list = url?.searchParams.get('list');
  if (list) return list;
  // Accept unusual IDs as-is rather than refusing; YouTube will say if it is wrong.
  if (!url && /^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(`"${input}" doesn't look like a YouTube playlist. Pass a playlist URL or its ID.`);
}

export type ChannelRef =
  | { kind: 'id'; id: string }
  | { kind: 'url'; url: string };

/** Normalise a channel reference: UC… ID, @handle, bare handle, or any channel URL. */
export function parseChannelRef(input: string): ChannelRef {
  const trimmed = input.trim();
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
