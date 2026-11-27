import { Innertube, Log } from 'youtubei.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import { parseChannelRef } from './ids.js';
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
  parts: string[];
  channelName: string;
  channelId: string;
  badges: string[];
}

/** Read the common fields out of a LockupView card. Returns null for anything else. */
export function readLockup(item: any): LockupFields | null {
  if (item?.type !== 'LockupView') return null;
  const rows: any[] = item.metadata?.metadata?.metadata_rows ?? [];
  const partNodes: any[] = rows.flatMap((r) => r.metadata_parts ?? []);
  const parts = partNodes.map((p) => p.text?.text ?? '').filter(Boolean);
  const channelNode = partNodes.find((p) => p.text?.endpoint?.payload?.browseId?.startsWith?.('UC'));
  const image = item.content_image ?? {};
  const overlays: any[] = [...(image.overlays ?? []), ...(image.primary_thumbnail?.overlays ?? [])];
  const badges = overlays.flatMap((o) => o.badges ?? []).map((b: any) => b.text).filter(Boolean);
  return {
    id: item.content_id ?? '',
    contentType: item.content_type ?? '',
    title: item.metadata?.title?.text ?? '',
    parts,
    channelName: channelNode?.text?.text ?? '',
    channelId: channelNode?.text?.endpoint?.payload?.browseId ?? '',
    badges,
  };
}

const AGE = /\bago\b|^streamed|^premiered/i;
const DURATION = /^\d+(:\d{2}){1,2}$/;
const VIEWS = /view|^[\d.,]+[KMB]?$/i;

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

      results.push({
        type: 'video',
        id: video.video_id ?? video.id ?? '',
        title: video.title?.text ?? video.title?.toString?.() ?? '',
        channel: video.author?.name ?? '',
        channelId: video.author?.id ?? '',
        views: video.view_count?.text ?? video.short_view_count?.text ?? '',
        published: video.published?.text ?? '',
        duration: video.duration?.text ?? '',
        thumbnail: video.best_thumbnail?.url ?? video.thumbnails?.[0]?.url ?? '',
        snippets,
      });
    } else if (item.type === 'Channel') {
      const ch = item as any;
      results.push({
        type: 'channel',
        id: ch.author?.id ?? ch.id ?? '',
        name: ch.author?.name ?? '',
        handle: ch.author?.url?.replace(/^https?:\/\/www\.youtube\.com\//, '') ?? '',
        subscriberCount: ch.subscriber_count?.text ?? ch.video_count?.text ?? '',
        videoCount: ch.video_count?.text ?? '',
        thumbnail: ch.author?.best_thumbnail?.url ?? ch.author?.thumbnails?.[0]?.url ?? '',
        description: ch.description_snippet?.text ?? '',
      });
    } else if (item.type === 'LockupView') {
      const l = readLockup(item);
      if (!l) continue;
      if (l.contentType === 'PLAYLIST' || l.contentType === 'PODCAST') {
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
        results.push({
          type: 'video',
          id: l.id,
          title: l.title,
          channel: l.channelName,
          channelId: l.channelId,
          views: l.parts.find((p) => /view/i.test(p)) ?? '',
          published: l.parts.find((p) => AGE.test(p)) ?? '',
          duration: l.badges.find((b) => DURATION.test(b)) ?? '',
          thumbnail: `https://i.ytimg.com/vi/${l.id}/hqdefault.jpg`,
          snippets: [],
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
  const missing = [!duration && 'duration', !tags.length && 'tags'].filter(Boolean);

  return {
    id: info.basic_info.id ?? videoId,
    title,
    ...(status && status.status !== 'OK' && missing.length
      ? { limited: `YouTube withheld some details from this network (${status.reason ?? status.status}), so ${missing.join(' and ')} may be missing. Signing in usually fixes it.` }
      : {}),
    channel: info.basic_info.author || text(secondary?.owner?.author?.name ?? secondary?.owner?.author),
    channelId: info.basic_info.channel_id || secondary?.owner?.author?.id || '',
    channelUrl: (info.basic_info as any).channel?.url ?? '',
    subscriberCount: (info as any).secondary_info?.owner?.subscriber_count?.text ?? '',
    description: info.basic_info.short_description || text(secondary?.description),
    category: (info.basic_info as any).category ?? '',
    views: info.basic_info.view_count?.toLocaleString() || primary?.view_count?.original_view_count?.toLocaleString() || text(primary?.view_count?.view_count),
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

export interface ChannelResult {
  channelId: string;
  channelName: string;
  videoCount: number;
  videos: ChannelVideo[];
}

export async function getChannelVideos(
  channelUrl: string,
  limit: number,
  sort: string,
): Promise<ChannelResult> {
  const channelId = await resolveChannelId(channelUrl);
  const { yt } = await getInstance();

  const channel = await yt.getChannel(channelId);
  const videosTab = await channel.getVideos();

  if (sort === 'popular') {
    try { await videosTab.applySort('Popular'); } catch { /* sort not available */ }
  } else if (sort === 'oldest') {
    try { await videosTab.applySort('Oldest'); } catch { /* sort not available */ }
  }

  const videos: ChannelVideo[] = [];
  let currentTab = videosTab;

  while (videos.length < limit) {
    for (const video of currentTab.videos) {
      if (videos.length >= limit) break;
      const l = readLockup(video);
      if (l) {
        videos.push({
          id: l.id,
          title: l.title,
          views: l.parts.find((p) => VIEWS.test(p) && !AGE.test(p)) ?? '',
          published: l.parts.find((p) => AGE.test(p)) ?? '',
          duration: l.badges.find((b) => DURATION.test(b)) ?? '',
        });
        continue;
      }
      videos.push({
        id: (video as any).video_id ?? (video as any).id ?? '',
        title: (video as any).title?.text ?? (video as any).title?.toString?.() ?? '',
        views: (video as any).view_count?.text ?? (video as any).short_view_count?.text ?? '',
        published: (video as any).published?.text ?? '',
        duration: (video as any).duration?.text ?? '',
      });
    }

    if (videos.length >= limit || !currentTab.has_continuation) break;

    try {
      currentTab = await currentTab.getContinuation() as any;
    } catch {
      break;
    }
  }

  return {
    channelId: channel.metadata?.external_id ?? channelId,
    channelName: channel.metadata?.title ?? '',
    videoCount: videos.length,
    videos,
  };
}

// --- Playlist ---

export interface PlaylistVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  duration: string;
  position: number;
}

export interface PlaylistInfo {
  playlistId: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  videoCount: string;
  thumbnail: string;
  videos: PlaylistVideo[];
}

export async function getPlaylist(
  playlistId: string,
  limit: number,
): Promise<PlaylistInfo> {
  const { yt } = await getInstance();

  const playlist = await yt.getPlaylist(playlistId);
  const info = playlist.info as any;

  const videos: PlaylistVideo[] = [];
  let current = playlist;
  let position = 0;

  while (videos.length < limit) {
    for (const item of current.items ?? current.videos ?? []) {
      if (videos.length >= limit) break;
      const l = readLockup(item);
      if (l) {
        videos.push({
          id: l.id,
          title: l.title,
          channel: l.channelName,
          channelId: l.channelId,
          duration: l.badges.find((b) => DURATION.test(b)) ?? '',
          position: position++,
        });
        continue;
      }
      const v = item as any;
      videos.push({
        id: v.video_id ?? v.id ?? '',
        title: v.title?.text ?? v.title?.toString?.() ?? '',
        channel: v.author?.name ?? '',
        channelId: v.author?.id ?? '',
        duration: v.duration?.text ?? '',
        position: position++,
      });
    }

    if (videos.length >= limit || !current.has_continuation) break;

    try {
      current = await current.getContinuation() as any;
    } catch {
      break;
    }
  }

  return {
    playlistId: info?.id ?? playlistId,
    title: info?.title ?? '',
    description: info?.description ?? '',
    channelName: info?.author?.name ?? '',
    channelId: info?.author?.id ?? '',
    videoCount: info?.total_items?.toString() ?? String(videos.length),
    thumbnail: info?.thumbnails?.[0]?.url ?? '',
    videos,
  };
}

// --- Helpers ---

async function resolveChannelId(input: string): Promise<string> {
  const ref = parseChannelRef(input);
  if (ref.kind === 'id') return ref.id;

  const { yt } = await getInstance();
  const endpoint = await yt.resolveURL(ref.url);
  const browseId = (endpoint as any)?.payload?.browseId;
  if (browseId && typeof browseId === 'string') {
    return browseId;
  }

  throw new Error(`Could not resolve "${input}" to a channel ID`);
}

// --- Comments ---

export interface VideoComment {
  author: string;
  text: string;
  likes: string;
  published: string;
  replies: number;
  pinned?: boolean;
  byCreator?: boolean;
  heartedByCreator?: boolean;
}

export async function getComments(
  videoId: string,
  limit: number,
  sort: 'top' | 'newest',
): Promise<{ totalComments: string; comments: VideoComment[] }> {
  const { yt } = await getInstance();
  let page: any = await yt.getComments(videoId, sort === 'newest' ? 'NEWEST_FIRST' : 'TOP_COMMENTS');
  const totalComments = page.header?.comments_count?.toString?.() ?? '';
  const comments: VideoComment[] = [];

  while (comments.length < limit) {
    for (const thread of page.contents ?? []) {
      if (comments.length >= limit) break;
      const c = thread.comment;
      if (!c) continue;
      comments.push({
        author: c.author?.name ?? '',
        text: c.content?.toString?.() ?? '',
        likes: String(c.like_count ?? '').trim() || '0',
        published: c.published_time ?? '',
        replies: Number(String(c.reply_count ?? '0').replace(/[^\d]/g, '')) || 0,
        ...(c.is_pinned ? { pinned: true } : {}),
        ...(c.author_is_channel_owner ? { byCreator: true } : {}),
        ...(c.is_hearted ? { heartedByCreator: true } : {}),
      });
    }
    if (comments.length >= limit || !page.has_continuation) break;
    try {
      page = await page.getContinuation();
    } catch {
      break;
    }
  }
  return { totalComments, comments };
}
