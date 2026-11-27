import { Innertube, Log } from 'youtubei.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import { clipLink, mixSeedVideo, parseChannelRef, parsePlaylistId, parseVideoId } from './ids.js';
import { YouTubeToolError, classify } from './errors.js';
import { debug } from './log.js';

// youtubei.js prints parser warnings whenever YouTube adds a field it doesn't know yet.
// They're harmless, and they'd flood the agent's MCP log.
Log.setLevel(process.env.YOUTUBE_AI_AGENTS_DEBUG ? Log.Level.WARNING : Log.Level.NONE);

export type SearchMode = 'personalized' | 'anonymous';

let pending: Promise<{ yt: Innertube; mode: SearchMode }> | null = null;

async function create(): Promise<{ yt: Innertube; mode: SearchMode }> {
  const config = getConfig();
  const base = {
    lang: config.innertube.language,
    location: config.innertube.location,
    retrieve_player: config.innertube.retrievePlayer,
  };
  const cookie = loadCookies();
  if (cookie) {
    try {
      return { yt: await Innertube.create({ ...base, cookie }), mode: 'personalized' };
    } catch (e) {
      // Expired or broken cookies shouldn't take the whole tool down.
      debug(`signed-in session failed, continuing anonymously: ${(e as Error).message}`);
    }
  }
  return { yt: await Innertube.create(base), mode: 'anonymous' };
}

/** One shared InnerTube session. Concurrent first calls wait on the same creation. */
export function getInstance(): Promise<{ yt: Innertube; mode: SearchMode }> {
  if (!pending) {
    pending = create().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

export function resetInstance(): void {
  pending = null;
}


// --- Lockup view (YouTube's newer card format, used for channel tabs and some search results) ---

interface LockupFields {
  id: string;
  contentType: string;
  title: string;
  /** Every metadata text, the channel's excepted when it sits in an avatar stack. */
  parts: string[];
  /** The same texts by row, for telling a description row from the stats row. */
  rows: string[][];
  channelName: string;
  channelId: string;
  badges: string[];
}

function channelOf(text: any): string {
  const ids = [text?.endpoint, ...(text?.runs ?? []).map((r: any) => r.endpoint)].map((e) => e?.payload?.browseId);
  return ids.find((id) => typeof id === 'string' && id.startsWith('UC')) ?? '';
}

/** Read the common fields out of a LockupView card. Returns null for anything else. */
export function readLockup(item: any): LockupFields | null {
  if (item?.type !== 'LockupView') return null;
  const rowNodes: any[] = item.metadata?.metadata?.metadata_rows ?? [];
  const partNodes: any[] = rowNodes.flatMap((r) => r.metadata_parts ?? []);
  // Search cards put the channel in an avatar stack; channel tabs leave it out; playlists of
  // several creators link it from a plain text part.
  const avatar = partNodes.find((p) => p.avatar_stack?.text?.text)?.avatar_stack?.text;
  const linkedNode = partNodes.find((p) => channelOf(p.text));
  const channel = avatar ?? linkedNode?.text;
  // Leave the channel's own text out, so a band called "311" never reads as a view count.
  const rows = rowNodes.map((r) => (r.metadata_parts ?? [])
    .filter((p: any) => p !== linkedNode)
    .map((p: any) => p.text?.text ?? '')
    .filter(Boolean));
  const image = item.content_image ?? {};
  const overlays: any[] = [...(image.overlays ?? []), ...(image.primary_thumbnail?.overlays ?? [])];
  const badges = overlays.flatMap((o) => o.badges ?? []).map((b: any) => b.text).filter(Boolean);
  return {
    id: item.content_id ?? '',
    contentType: item.content_type ?? '',
    title: item.metadata?.title?.text ?? '',
    parts: rows.flat(),
    rows,
    channelName: channel?.text ?? '',
    channelId: channelOf(channel),
    badges,
  };
}

const AGE = /\bago\b|^streamed|^premiered/i;
const DURATION = /^\d+(:\d{2}){1,2}$/;
/** "1.2M views", "58M" (search cards drop the word), "No views", "4.6K watching". */
const VIEWS = /^(?:[\d.,]+\s*[KMB]?|no)(?:\s+(?:views?|watching))?$/i;
const WATCHING = /watching$/i;
/** "21.5M subscribers", "1,204 videos": a number, then the noun. */
const COUNT_OF = (noun: string) => new RegExp(`^[\\d.,]+\\s*[KMB]?\\s+${noun}s?$`, 'i');

/** The view count among a card's texts, with "views" added where YouTube left it off. */
export function lockupViews(parts: string[]): string {
  const views = parts.find((p) => VIEWS.test(p.trim()) && !AGE.test(p)) ?? '';
  return /^[\d.,]+\s*[KMB]?$/i.test(views.trim()) ? `${views.trim()} views` : views;
}

/** True when a card is a stream that is live right now. */
function lockupLive(l: LockupFields): boolean {
  return l.badges.some((b) => /^live$/i.test(b)) || l.parts.some((p) => WATCHING.test(p));
}

/** Seconds since a relative age like "13h ago", "2 weeks ago" or "Streamed 1y ago"; Infinity when unknown. */
export function ageSeconds(age: string): number {
  const m = /(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|wk|week|mo|month|y|yr|year)s?\b/i.exec(age);
  if (!m) return Infinity;
  const unit = m[2].toLowerCase();
  const SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800, mo: 2_592_000, y: 31_536_000 };
  const key = unit.startsWith('mo') ? 'mo' : unit.startsWith('mi') || unit === 'm' ? 'm' : unit[0];
  return Number(m[1]) * SECONDS[key];
}

// --- Search ---

export interface SearchSnippet {
  text: string;
  hoverText: string;
  boldKeywords: string[];
}

export interface VideoSearchResult {
  type: 'video';
  id: string;
  title: string;
  channel: string;
  channelId: string;
  views: string;
  published: string;
  duration: string;
  thumbnail: string;
  snippets: SearchSnippet[];
  /** Set for a stream that is live right now: it has no length yet, and no transcript until it ends. */
  live?: true;
}

export interface ChannelSearchResult {
  type: 'channel';
  id: string;
  name: string;
  handle: string;
  subscriberCount: string;
  videoCount: string;
  thumbnail: string;
  description: string;
}

export interface PlaylistSearchResult {
  type: 'playlist';
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  videoCount: string;
  thumbnail: string;
}

export type SearchResult = VideoSearchResult | ChannelSearchResult | PlaylistSearchResult;

export interface SearchFilters {
  uploadDate?: 'all' | 'today' | 'week' | 'month' | 'year';
  duration?: 'all' | 'short' | 'medium' | 'long';
  sortBy?: 'relevance' | 'rating' | 'date' | 'views';
}

// Map our intuitive duration names to youtubei.js values
const DURATION_MAP: Record<string, string> = {
  short: 'under_four_minutes',
  medium: 'four_to_twenty_minutes',
  long: 'over_twenty_minutes',
};

// Map our sortBy names to youtubei.js values
const SORT_MAP: Record<string, string> = {
  relevance: 'relevance',
  date: 'upload_date',
  views: 'view_count',
  rating: 'rating',
};

export async function search(
  query: string,
  limit: number,
  type: string,
  filters: SearchFilters = {},
): Promise<{ results: SearchResult[]; mode: SearchMode }> {
  const { yt, mode } = await getInstance();

  const searchType = type as 'video' | 'channel' | 'playlist';

  const searchOptions: Record<string, any> = { type: searchType };

  if (filters.uploadDate && filters.uploadDate !== 'all') {
    searchOptions.upload_date = filters.uploadDate;
  }
  if (filters.duration && filters.duration !== 'all') {
    searchOptions.duration = DURATION_MAP[filters.duration] ?? filters.duration;
  }
  if (filters.sortBy && filters.sortBy !== 'relevance') {
    searchOptions.sort_by = SORT_MAP[filters.sortBy] ?? filters.sortBy;
  }

  const response = await yt.search(query, searchOptions);

  const results: SearchResult[] = [];

  for (const item of response.results ?? []) {
    if (results.length >= limit) break;

    if (item.type === 'Video') {
      const video = item as any;
      const snippets: SearchSnippet[] = [];
      if (video.snippets?.length) {
        for (const s of video.snippets) {
          snippets.push({
            text: s.text?.text ?? '',
            hoverText: s.hover_text?.text ?? '',
            boldKeywords: s.text?.runs?.filter((r: any) => r.bold)?.map((r: any) => r.text) ?? [],
          });
        }
      }

      let live = false;
      try { live = Boolean(video.is_live); } catch { /* no overlays to judge by */ }
      const views = video.view_count?.text ?? video.short_view_count?.text ?? '';
      results.push({
        type: 'video',
        id: video.video_id ?? video.id ?? '',
        title: video.title?.text ?? video.title?.toString?.() ?? '',
        channel: video.author?.name ?? '',
        channelId: video.author?.id ?? '',
        views,
        published: video.published?.text ?? '',
        duration: video.duration?.text ?? '',
        thumbnail: video.best_thumbnail?.url ?? video.thumbnails?.[0]?.url ?? '',
        snippets,
        ...(live || WATCHING.test(views) ? { live: true as const } : {}),
      });
    } else if (item.type === 'Channel') {
      const ch = item as any;
      // YouTube moved the handle into the subscriber field and the subscribers into the video
      // field, so read the texts by what they say rather than where they sit.
      const texts: string[] = [ch.subscriber_count?.text, ch.video_count?.text].filter(Boolean);
      results.push({
        type: 'channel',
        id: ch.author?.id ?? ch.id ?? '',
        name: ch.author?.name ?? '',
        handle: texts.find((t) => t.startsWith('@')) ?? ch.author?.endpoint?.payload?.canonicalBaseUrl?.replace(/^\//, '') ?? '',
        subscriberCount: texts.find((t) => /subscriber/i.test(t)) ?? '',
        videoCount: texts.find((t) => /video/i.test(t)) ?? '',
        thumbnail: ch.author?.best_thumbnail?.url ?? ch.author?.thumbnails?.[0]?.url ?? '',
        description: ch.description_snippet?.text ?? '',
      });
    } else if (item.type === 'LockupView') {
      const l = readLockup(item);
      if (!l) continue;
      if (l.contentType === 'CHANNEL') {
        // The first row holds the handle and counts; the rest is the description.
        const stats = l.rows[0] ?? [];
        results.push({
          type: 'channel',
          id: l.id,
          name: l.title,
          handle: stats.find((p) => p.startsWith('@')) ?? '',
          subscriberCount: stats.find((p) => COUNT_OF('subscriber').test(p)) ?? '',
          videoCount: stats.find((p) => COUNT_OF('video').test(p)) ?? '',
          thumbnail: '',
          description: l.rows.slice(1).flat().join(' '),
        });
      } else if (l.contentType === 'PLAYLIST' || l.contentType === 'PODCAST') {
        results.push({
          type: 'playlist',
          id: l.id,
          title: l.title,
          channelName: l.channelName,
          channelId: l.channelId,
          videoCount: l.badges.find((b) => /video|episode|lesson/i.test(b)) ?? '',
          thumbnail: '',
        });
      } else if (l.contentType === 'VIDEO') {
        const [stats = [], ...rest] = l.rows;
        const description = rest.flat().join(' ');
        results.push({
          type: 'video',
          id: l.id,
          title: l.title,
          channel: l.channelName,
          channelId: l.channelId,
          views: lockupViews(stats),
          published: stats.find((p) => AGE.test(p)) ?? '',
          duration: l.badges.find((b) => DURATION.test(b)) ?? '',
          thumbnail: `https://i.ytimg.com/vi/${l.id}/hqdefault.jpg`,
          snippets: description ? [{ text: description, hoverText: '', boldKeywords: [] }] : [],
          ...(lockupLive(l) ? { live: true as const } : {}),
        });
      }
    } else if (item.type === 'Playlist') {
      const pl = item as any;
      results.push({
        type: 'playlist',
        id: pl.id ?? '',
        title: pl.title?.text ?? pl.title?.toString?.() ?? '',
        channelName: pl.author?.name ?? '',
        channelId: pl.author?.id ?? '',
        videoCount: pl.video_count?.text ?? pl.video_count_short?.text ?? '',
        thumbnail: pl.thumbnails?.[0]?.url ?? '',
      });
    }
  }

  // YouTube treats "upload date" as a nudge rather than an order, so put the page in order here.
  if (filters.sortBy === 'date') {
    const age = (r: SearchResult) => (r.type === 'video' ? (r.live ? 0 : ageSeconds(r.published)) : Infinity);
    results.sort((a, b) => (age(a) === age(b) ? 0 : age(a) - age(b)));
  }

  return { results, mode };
}

// --- Video Info ---

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  channelUrl: string;
  subscriberCount: string;
  description: string;
  category: string;
  views: string;
  likes: string;
  published: string;
  relativeDate: string;
  duration: string;
  thumbnail: string;
  tags: string[];
  isLive: boolean;
  isUpcoming: boolean;
  chapters: Array<{ title: string; timestamp: number }>;
  /** Set when YouTube withheld player data from this network. */
  limited?: string;
  /** Watching needs an adult account: transcripts, frames and downloads fail until signed in. */
  ageRestricted?: boolean;
  /** Watching needs a purchase or a channel membership. */
  paywalled?: boolean;
}

export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const { yt } = await getInstance();
  const info = await yt.getInfo(videoId);

  const chapters: Array<{ title: string; timestamp: number }> = [];
  try {
    const markers = (info as any).player_overlays
      ?.decorated_player_bar
      ?.player_bar
      ?.markers_map;
    if (markers) {
      for (const marker of markers) {
        const chapterList = marker?.value?.chapters;
        if (chapterList) {
          for (const ch of chapterList) {
            chapters.push({
              title: ch.title?.text ?? ch.title?.toString?.() ?? '',
              timestamp: Math.floor((ch.time_range_start_millis ?? 0) / 1000),
            });
          }
        }
      }
    }
  } catch {
    // Chapters not available
  }

  // On VPN and cloud IPs YouTube often withholds the player data (a bot check) but still sends
  // the watch page's own details, so fill in from those and say what's missing.
  const primary = (info as any).primary_info;
  const secondary = (info as any).secondary_info;
  const text = (v: any): string => (v ? String(v.text ?? v.toString?.() ?? '') : '');
  const status = info.playability_status;
  const title = info.basic_info.title || text(primary?.title);
  if (!title) {
    throw new Error(status?.reason ? `${status.status}: ${status.reason}` : `YouTube returned no details for ${videoId}.`);
  }

  // The like count comes from the watch page's like button; youtubei.js reads it as NaN when the
  // button shows no number (no likes yet), so fall back to the button's own short count.
  const likeButton = primary?.menu?.top_level_buttons?.find((b: any) => b?.type === 'SegmentedLikeDislikeButtonView');
  const likeCount = info.basic_info.like_count;
  const likes = likeCount !== undefined && Number.isFinite(likeCount) ? likeCount.toLocaleString() : String(likeButton?.short_like_count ?? '');
  const tags: string[] = info.basic_info.tags?.length ? info.basic_info.tags : ((info.basic_info as any).keywords ?? []);
  const duration = info.basic_info.duration ? formatDuration(info.basic_info.duration) : '';
  const live = info.basic_info.is_live ?? false;
  const upcoming = info.basic_info.is_upcoming ?? false;
  // YouTube answers this client "The page needs to be reloaded" for most videos while still sending
  // the details, so judge by what's actually missing. Plenty of videos have no tags; a finished
  // video always has a length.
  const blocked = status && status.status !== 'OK' ? classify(new Error(status.reason ?? '')) : null;
  const viewCount = info.basic_info.view_count;
  const views = (viewCount !== undefined && Number.isFinite(viewCount) ? viewCount.toLocaleString() : '')
    || primary?.view_count?.original_view_count?.toLocaleString() || text(primary?.view_count?.view_count);

  return {
    id: info.basic_info.id ?? videoId,
    title,
    ...(blocked === 'age_restricted' ? { ageRestricted: true } : {}),
    ...(blocked === 'paywalled' ? { paywalled: true } : {}),
    ...(status && status.status !== 'OK' && !duration && !live && !upcoming && blocked !== 'paywalled'
      ? { limited: `YouTube withheld some details from this network (${status.reason ?? status.status}), so the duration may be missing. Signing in usually fixes it.` }
      : {}),
    channel: info.basic_info.author || text(secondary?.owner?.author?.name ?? secondary?.owner?.author),
    channelId: info.basic_info.channel_id || secondary?.owner?.author?.id || '',
    channelUrl: (info.basic_info as any).channel?.url ?? '',
    subscriberCount: (info as any).secondary_info?.owner?.subscriber_count?.text ?? '',
    description: info.basic_info.short_description || text(secondary?.description),
    category: (info.basic_info as any).category ?? '',
    views,
    likes,
    published: (info as any).primary_info?.published?.text ?? '',
    relativeDate: (info as any).primary_info?.relative_date?.text ?? '',
    duration,
    thumbnail: info.basic_info.thumbnail?.[0]?.url ?? '',
    tags,
    isLive: info.basic_info.is_live ?? false,
    isUpcoming: info.basic_info.is_upcoming ?? false,
    chapters,
  };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Channel Info ---

export interface ChannelInfo {
  channelId: string;
  name: string;
  handle: string;
  description: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  joinedDate: string;
  country: string;
  isFamilySafe: boolean;
  thumbnail: string;
  banner: string;
}

export async function getChannelInfo(channelInput: string): Promise<ChannelInfo> {
  const channelId = await resolveChannelId(channelInput);
  const { yt } = await getInstance();

  const channel = await yt.getChannel(channelId);

  const metadata = channel.metadata as any;
  const headerContent = (channel.header as any)?.content;

  let description = metadata?.description ?? '';
  let subscriberCount = '';
  let videoCount = '';
  let viewCount = '';
  let joinedDate = '';
  let country = '';

  try {
    const about = await channel.getAbout();
    const aboutMeta = (about as any).metadata;
    if (aboutMeta) {
      if (aboutMeta.description) description = aboutMeta.description;
      if (aboutMeta.subscriber_count) subscriberCount = aboutMeta.subscriber_count;
      if (aboutMeta.video_count) videoCount = aboutMeta.video_count;
      if (aboutMeta.view_count) viewCount = aboutMeta.view_count;
      if (aboutMeta.country) country = aboutMeta.country;
      if (aboutMeta.joined_date?.text) joinedDate = aboutMeta.joined_date.text;
    }
  } catch {
    // Some channels don't expose an about tab
  }

  const avatar = headerContent?.image?.avatar?.image
    ?? metadata?.avatar;
  const banner = headerContent?.banner?.image;

  return {
    channelId: metadata?.external_id ?? channelId,
    name: metadata?.title ?? headerContent?.title?.text?.text ?? '',
    handle: metadata?.vanity_channel_url?.replace(/^https?:\/\/www\.youtube\.com\//, '') ?? '',
    description,
    subscriberCount,
    videoCount,
    viewCount,
    joinedDate,
    country,
    isFamilySafe: metadata?.is_family_safe ?? true,
    thumbnail: avatar?.[0]?.url ?? '',
    banner: banner?.[0]?.url ?? '',
  };
}

// --- Channel Videos ---

export interface ChannelVideo {
  id: string;
  title: string;
  views: string;
  published: string;
  duration: string;
}

export type ChannelTab = 'videos' | 'shorts' | 'live';

export interface ChannelResult {
  channelId: string;
  channelName: string;
  tab: ChannelTab;
  sort: string;
  offset: number;
  returned: number;
  hasMore: boolean;
  note?: string;
  videos: ChannelVideo[];
}

/** The chip YouTube shows for each sort on a channel tab. */
const SORT_CHIPS: Record<string, string> = { newest: 'Latest', popular: 'Popular', oldest: 'Oldest' };
const TAB_NAMES: Record<ChannelTab, string> = { videos: 'Videos', shorts: 'Shorts', live: 'Live' };

function readChannelItem(item: any): ChannelVideo | null {
  const l = readLockup(item);
  if (l) {
    return {
      id: l.id,
      title: l.title,
      views: lockupViews(l.parts),
      published: l.parts.find((p) => AGE.test(p)) ?? '',
      duration: lockupLive(l) ? 'LIVE' : l.badges.find((b) => DURATION.test(b)) ?? '',
    };
  }
  if (item?.type === 'ShortsLockupView') {
    const id = item.on_tap_endpoint?.payload?.videoId ?? String(item.entity_id ?? '').replace(/^shorts-shelf-item-/, '');
    if (!id) return null;
    return {
      id,
      title: item.overlay_metadata?.primary_text?.text ?? '',
      views: item.overlay_metadata?.secondary_text?.text ?? '',
      published: '',
      duration: '',
    };
  }
  const id = item?.video_id ?? item?.id;
  if (!id) return null;
  return {
    id,
    title: item.title?.text ?? item.title?.toString?.() ?? '',
    views: item.view_count?.text ?? item.short_view_count?.text ?? '',
    published: item.published?.text ?? '',
    duration: item.duration?.text ?? '',
  };
}

export async function getChannelVideos(
  channelUrl: string,
  limit: number,
  sort: string,
  tab: ChannelTab = 'videos',
  offset = 0,
): Promise<ChannelResult> {
  const channelId = await resolveChannelId(channelUrl);
  const { yt } = await getInstance();
  const channel = await yt.getChannel(channelId);
  const name = channel.metadata?.title ?? channelUrl;

  let feed: any;
  try {
    feed = tab === 'shorts' ? await channel.getShorts() : tab === 'live' ? await channel.getLiveStreams() : await channel.getVideos();
  } catch (e) {
    if (/tab .* not found/i.test((e as Error).message)) {
      throw new YouTubeToolError('not_found', `${name} has no ${TAB_NAMES[tab]} tab.`, `It hasn't posted any ${tab === 'live' ? 'live streams' : tab}. Try another tab: videos, shorts or live.`);
    }
    throw e;
  }

  let note: string | undefined;
  if (sort !== 'newest') {
    try {
      feed = await feed.applyFilter(SORT_CHIPS[sort]);
    } catch {
      note = `YouTube didn't offer the "${sort}" sort on this tab, so these are the newest.`;
    }
  }

  const videos: ChannelVideo[] = [];
  let skipped = 0;
  let hasMore = false;
  for (;;) {
    for (const item of feed.videos ?? []) {
      const video = readChannelItem(item);
      if (!video) continue;
      if (skipped < offset) { skipped++; continue; }
      if (videos.length >= limit) { hasMore = true; break; }
      videos.push(video);
    }
    if (hasMore || !feed.has_continuation) break;
    if (videos.length >= limit) { hasMore = true; break; }
    try {
      feed = await feed.getContinuation();
    } catch {
      break;
    }
  }

  return {
    channelId: channel.metadata?.external_id ?? channelId,
    channelName: channel.metadata?.title ?? '',
    tab,
    sort: note ? 'newest' : sort,
    offset,
    returned: videos.length,
    hasMore,
    ...(note ? { note } : {}),
    videos,
  };
}

// --- Playlist ---

export interface PlaylistVideo {
  position: number;
  id: string;
  title: string;
  /** Left out when YouTube doesn't say (it omits the owner on single-creator playlists, filled in from the playlist). */
  channel?: string;
  channelId?: string;
  duration: string;
  views?: string;
  published?: string;
}

export interface PlaylistInfo {
  playlistId: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  videoCount: string;
  thumbnail: string;
  offset: number;
  returned: number;
  hasMore: boolean;
  note?: string;
  videos: PlaylistVideo[];
}

function readPlaylistItem(item: any): Omit<PlaylistVideo, 'position'> | null {
  const l = readLockup(item);
  if (l) {
    return {
      id: l.id,
      title: l.title,
      ...(l.channelName ? { channel: l.channelName } : {}),
      ...(l.channelId ? { channelId: l.channelId } : {}),
      duration: l.badges.find((b) => DURATION.test(b)) ?? '',
      ...(lockupViews(l.parts) ? { views: lockupViews(l.parts) } : {}),
      ...(l.parts.find((p) => AGE.test(p)) ? { published: l.parts.find((p) => AGE.test(p)) } : {}),
    };
  }
  const id = item?.video_id ?? item?.id;
  if (!id) return null;
  // Playlist panels (Mixes) give the author as a plain string and the channel ID on the artists.
  const channel = (typeof item.author === 'string' ? item.author : item.author?.name) ?? '';
  const authorId = item.author?.id ?? item.artists?.[0]?.channel_id;
  const channelId = authorId && authorId !== 'N/A' ? authorId : '';
  return {
    id,
    title: item.title?.text ?? item.title?.toString?.() ?? '',
    ...(channel && channel !== 'N/A' ? { channel } : {}),
    ...(channelId ? { channelId } : {}),
    duration: item.duration?.text ?? '',
  };
}

/** The channel most entries name, for albums whose playlist names no owner. */
function mostCommonChannel(videos: PlaylistVideo[]): { name: string; id: string } {
  const counts = new Map<string, { name: string; id: string; n: number }>();
  for (const v of videos) {
    if (!v.channel) continue;
    const c = counts.get(v.channel) ?? { name: v.channel, id: v.channelId ?? '', n: 0 };
    c.n++;
    counts.set(v.channel, c);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top && top.n * 2 > videos.length ? top : { name: '', id: '' };
}

const MIX_HINT = 'Pass a link that includes the video (watch?v=…&list=RD…), or a regular playlist.';

/** A Mix is generated per viewer, so it has no playlist page: read it from the seed video's watch page, as the player does. */
async function getMix(playlistId: string, seed: string, limit: number, offset: number): Promise<PlaylistInfo> {
  const { yt } = await getInstance();
  const endpoint = await yt.resolveURL(`https://www.youtube.com/watch?v=${seed}&list=${playlistId}`);
  const watch: any = await yt.getInfo(endpoint as any);
  const panel = watch.playlist;
  if (!panel?.contents?.length) throw new YouTubeToolError('unavailable', `YouTube sent no videos for the Mix ${playlistId}.`, MIX_HINT);
  const all = (panel.contents as any[]).map(readPlaylistItem).filter((v): v is Omit<PlaylistVideo, 'position'> => v !== null);
  const videos = all.slice(offset, offset + limit).map((v, i) => ({ position: offset + i, ...v }));
  return {
    playlistId,
    title: panel.title ?? '',
    description: '',
    channelName: 'YouTube',
    channelId: '',
    videoCount: `${all.length} videos`,
    thumbnail: '',
    offset,
    returned: videos.length,
    hasMore: offset + videos.length < all.length,
    note: `A Mix is generated for each viewer and has no fixed length; these are the first ${all.length} videos YouTube queued.`,
    videos,
  };
}

export async function getPlaylist(
  input: string,
  limit: number,
  offset = 0,
): Promise<PlaylistInfo> {
  const playlistId = parsePlaylistId(input);
  const seed = mixSeedVideo(input, playlistId);
  if (seed) return getMix(playlistId, seed, limit, offset);

  const { yt } = await getInstance();
  let playlist: any;
  try {
    playlist = await yt.getPlaylist(playlistId);
  } catch (e) {
    const msg = (e as Error).message;
    if (/does not exist/i.test(msg)) throw new YouTubeToolError('not_found', `No playlist ${playlistId}.`, 'Check the playlist link or ID; it may also be private or deleted.');
    if (/unviewable/i.test(msg)) throw new YouTubeToolError('unavailable', `YouTube won't list the playlist ${playlistId}: it's generated for each viewer.`, MIX_HINT);
    throw e;
  }
  const info = playlist.info as any;

  const videos: PlaylistVideo[] = [];
  let current = playlist;
  let position = 0;
  let hasMore = false;
  for (;;) {
    for (const item of current.items ?? current.videos ?? []) {
      const video = readPlaylistItem(item);
      if (!video) continue;
      const at = position++;
      if (at < offset) continue;
      if (videos.length >= limit) { hasMore = true; break; }
      videos.push({ position: at, ...video });
    }
    if (hasMore || !current.has_continuation) break;
    if (videos.length >= limit) { hasMore = true; break; }
    try {
      current = await current.getContinuation();
    } catch {
      break;
    }
  }

  const owner = info?.author?.name && info.author.name !== 'N/A'
    ? { name: info.author.name as string, id: (info.author.id as string) ?? '' }
    : mostCommonChannel(videos);
  for (const v of videos) {
    if (!v.channel && owner.name) Object.assign(v, { channel: owner.name, ...(owner.id ? { channelId: owner.id } : {}) });
  }

  return {
    playlistId: info?.id ?? playlistId,
    title: info?.title ?? '',
    description: info?.description ?? '',
    channelName: owner.name,
    channelId: owner.id,
    videoCount: info?.total_items?.toString() ?? String(videos.length),
    thumbnail: info?.thumbnails?.[0]?.url ?? '',
    offset,
    returned: videos.length,
    hasMore,
    videos,
  };
}

// --- Helpers ---

/** A video's length in seconds; 0 for a live stream or when YouTube won't say. */
export async function getDurationSeconds(videoId: string): Promise<number> {
  const { yt } = await getInstance();
  const info = await yt.getBasicInfo(videoId);
  return info.basic_info.is_live ? 0 : (info.basic_info.duration ?? 0);
}

/** A video ID from anything a person pastes, including YouTube Clip links, which only YouTube can map to their video. */
export async function resolveVideoId(input: string): Promise<string> {
  const clip = clipLink(input);
  if (!clip) return parseVideoId(input);
  const { yt } = await getInstance();
  const endpoint = await yt.resolveURL(clip);
  const videoId = (endpoint as any)?.payload?.videoId;
  if (typeof videoId === 'string' && videoId) return videoId;
  throw new YouTubeToolError('invalid_input', `YouTube didn't say which video the clip "${input}" comes from.`, 'Open the clip on YouTube and pass the full video\'s link instead.');
}

async function resolveChannelId(input: string): Promise<string> {
  const ref = parseChannelRef(input);
  if (ref.kind === 'id') return ref.id;

  const { yt } = await getInstance();
  const notFound = () => new YouTubeToolError('not_found', `No channel found for "${input}".`, 'Check the handle\'s spelling, or find the channel with youtube_search and type "channel".');
  let endpoint: unknown;
  try {
    endpoint = await yt.resolveURL(ref.url);
  } catch (e) {
    if (classify(e) === 'not_found') throw notFound();
    throw e;
  }
  const browseId = (endpoint as any)?.payload?.browseId;
  if (typeof browseId === 'string' && browseId.startsWith('UC')) return browseId;
  throw notFound();
}

// --- Comments ---

export interface VideoReply {
  author: string;
  text: string;
  likes: string;
  published: string;
  byCreator?: boolean;
}

export interface VideoComment extends VideoReply {
  replies: number;
  pinned?: boolean;
  heartedByCreator?: boolean;
  /** The first replies in the thread, when asked for. */
  topReplies?: VideoReply[];
}

function readReply(c: any): VideoReply {
  return {
    author: c.author?.name ?? '',
    text: c.content?.toString?.() ?? '',
    likes: String(c.like_count ?? '').trim() || '0',
    published: c.published_time ?? '',
    ...(c.author_is_channel_owner ? { byCreator: true } : {}),
  };
}

/** Threads whose replies load at once; more would hammer YouTube for one tool call. */
const REPLY_FETCH_CONCURRENCY = 5;

async function topReplies(thread: any, count: number): Promise<VideoReply[]> {
  try {
    const loaded = thread.replies?.length ? thread : await thread.getReplies();
    return (loaded.replies ?? []).slice(0, count).map((r: any) => readReply(r.comment ?? r));
  } catch (e) {
    debug(`replies failed: ${(e as Error).message}`);
    return [];
  }
}

/** Why a video has no comments page: it doesn't exist, can't be watched here, or has comments off. */
async function explainNoComments(videoId: string): Promise<YouTubeToolError> {
  const { yt } = await getInstance();
  try {
    await yt.getBasicInfo(videoId);
  } catch (e) {
    if (/unavailable/i.test((e as Error).message)) {
      return new YouTubeToolError('not_found', `No video ${videoId}, or it's unavailable.`, 'Check the link or ID for typos; the video may also have been deleted.');
    }
    return e instanceof YouTubeToolError ? e : new YouTubeToolError(classify(e), (e as Error).message);
  }
  return new YouTubeToolError('comments_disabled', `Comments are turned off for ${videoId}.`);
}

export async function getComments(
  videoId: string,
  limit: number,
  sort: 'top' | 'newest',
  replies = 0,
): Promise<{ totalComments: string; comments: VideoComment[] }> {
  const { yt } = await getInstance();
  let page: any;
  try {
    page = await yt.getComments(videoId, sort === 'newest' ? 'NEWEST_FIRST' : 'TOP_COMMENTS');
  } catch (e) {
    if (/did not have any content/i.test((e as Error).message)) throw await explainNoComments(videoId);
    throw e;
  }
  const totalComments = page.header?.comments_count?.toString?.() ?? '';
  const threads: any[] = [];

  while (threads.length < limit) {
    for (const thread of page.contents ?? []) {
      if (threads.length >= limit) break;
      if (thread.comment) threads.push(thread);
    }
    if (threads.length >= limit || !page.has_continuation) break;
    try {
      page = await page.getContinuation();
    } catch {
      break;
    }
  }

  const comments: VideoComment[] = threads.map((thread) => {
    const c = thread.comment;
    return {
      ...readReply(c),
      replies: Number(String(c.reply_count ?? '0').replace(/[^\d]/g, '')) || 0,
      ...(c.is_pinned ? { pinned: true } : {}),
      ...(c.is_hearted ? { heartedByCreator: true } : {}),
    };
  });

  if (replies > 0) {
    const wanted = comments.map((c, i) => i).filter((i) => comments[i].replies > 0);
    for (let i = 0; i < wanted.length; i += REPLY_FETCH_CONCURRENCY) {
      await Promise.all(wanted.slice(i, i + REPLY_FETCH_CONCURRENCY).map(async (at) => {
        comments[at].topReplies = await topReplies(threads[at], replies);
      }));
    }
  }
  return { totalComments, comments };
}
