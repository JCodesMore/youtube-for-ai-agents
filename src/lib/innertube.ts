import { Innertube } from 'youtubei.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import {
  videoInfoCache,
  searchCache,
  channelInfoCache,
  channelVideosCache,
  playlistCache,
  trendingCache,
} from './cache.js';
import { bus } from './event-bus.js';
import { innertubeBreaker } from './circuit-breaker.js';
import { withTimeout } from './timeout.js';

export { withTimeout };

let instance: Innertube | null = null;
let creating: Promise<Innertube> | null = null;
export type SearchMode = 'personalized' | 'anonymous';

let instanceMode: SearchMode = 'anonymous';
const resolvedChannelIds = new Map<string, string>();

export async function getInstance(): Promise<{ yt: Innertube; mode: SearchMode }> {
  if (instance) {
    return { yt: instance, mode: instanceMode };
  }

  if (!creating) {
    const cookieString = loadCookies();
    instanceMode = cookieString !== null ? 'personalized' : 'anonymous';

    const config = getConfig();
    creating = innertubeBreaker.call(() =>
      withTimeout(
        Innertube.create({
          lang: config.innertube.language,
          location: config.innertube.location,
          retrieve_player: config.innertube.retrievePlayer,
          ...(cookieString ? { cookie: cookieString } : {}),
        }),
        15_000,
        'Innertube.create'
      )
    ).catch((err) => {
      creating = null;
      throw err;
    });
  }

  instance = await creating;
  creating = null;
  return { yt: instance, mode: instanceMode };
}

export function resetInstance(): void {
  instance = null;
  creating = null;
  instanceMode = 'anonymous';
  resolvedChannelIds.clear();
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
  const cacheKey = `${query}|${limit}|${type}|${JSON.stringify(filters)}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    bus.emit('cache:hit', { cache: 'search', key: query });
    return cached as { results: SearchResult[]; mode: SearchMode };
  }
  bus.emit('cache:miss', { cache: 'search', key: query });

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

  const response = await innertubeBreaker.call(() =>
    withTimeout(yt.search(query, searchOptions), 20_000, `search("${query}")`)
  );

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

  const searchResult = { results, mode };
  searchCache.set(cacheKey, searchResult);
  return searchResult;
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
}

export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const cached = videoInfoCache.get(videoId);
  if (cached) {
    bus.emit('cache:hit', { cache: 'video', key: videoId });
    return cached as VideoInfo;
  }
  bus.emit('cache:miss', { cache: 'video', key: videoId });

  const { yt } = await getInstance();
  const info = await innertubeBreaker.call(() =>
    withTimeout(yt.getInfo(videoId), 20_000, `getInfo(${videoId})`)
  );

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

  const videoInfo: VideoInfo = {
    id: info.basic_info.id ?? videoId,
    title: info.basic_info.title ?? '',
    channel: info.basic_info.author ?? '',
    channelId: info.basic_info.channel_id ?? '',
    channelUrl: (info.basic_info as any).channel?.url ?? '',
    subscriberCount: (info as any).secondary_info?.owner?.subscriber_count?.text ?? '',
    description: info.basic_info.short_description ?? '',
    category: (info.basic_info as any).category ?? '',
    views: info.basic_info.view_count?.toLocaleString() ?? '',
    likes: info.basic_info.like_count?.toLocaleString() ?? '',
    published: (info as any).primary_info?.published?.text ?? '',
    relativeDate: (info as any).primary_info?.relative_date?.text ?? '',
    duration: formatDuration(info.basic_info.duration ?? 0),
    thumbnail: info.basic_info.thumbnail?.[0]?.url ?? '',
    tags: info.basic_info.tags ?? [],
    isLive: info.basic_info.is_live ?? false,
    isUpcoming: info.basic_info.is_upcoming ?? false,
    chapters,
  };
  videoInfoCache.set(videoId, videoInfo);
  return videoInfo;
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
  const cached = channelInfoCache.get(channelId);
  if (cached) return cached as ChannelInfo;

  const { yt } = await getInstance();

  const channel = await innertubeBreaker.call(() =>
    withTimeout(yt.getChannel(channelId), 20_000, `getChannel(${channelId})`)
  );

  const metadata = channel.metadata as any;
  const headerContent = (channel.header as any)?.content;

  let description = metadata?.description ?? '';
  let subscriberCount = '';
  let videoCount = '';
  let viewCount = '';
  let joinedDate = '';
  let country = '';

  try {
    const about = await innertubeBreaker.call(() =>
      withTimeout(channel.getAbout(), 15_000, `channel.getAbout(${channelId})`)
    );
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

  const channelInfo: ChannelInfo = {
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
  channelInfoCache.set(channelId, channelInfo);
  return channelInfo;
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
  const cacheKey = `${channelId}|${limit}|${sort}`;
  const cached = channelVideosCache.get(cacheKey);
  if (cached) return cached as ChannelResult;

  const { yt } = await getInstance();

  const channel = await innertubeBreaker.call(() =>
    withTimeout(yt.getChannel(channelId), 20_000, `getChannel(${channelId})`)
  );
  const videosTab = await innertubeBreaker.call(() =>
    withTimeout(channel.getVideos(), 20_000, `channel.getVideos(${channelId})`)
  );

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

  const channelResult: ChannelResult = {
    channelId: channel.metadata?.external_id ?? channelId,
    channelName: channel.metadata?.title ?? '',
    videoCount: videos.length,
    videos,
  };
  channelVideosCache.set(cacheKey, channelResult);
  return channelResult;
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
  const cacheKey = `${playlistId}|${limit}`;
  const cached = playlistCache.get(cacheKey);
  if (cached) return cached as PlaylistInfo;

  const { yt } = await getInstance();

  const playlist = await innertubeBreaker.call(() =>
    withTimeout(yt.getPlaylist(playlistId), 20_000, `getPlaylist(${playlistId})`)
  );
  const info = playlist.info as any;

  const videos: PlaylistVideo[] = [];
  let current = playlist;
  let position = 0;

  while (videos.length < limit) {
    for (const item of current.items ?? current.videos ?? []) {
      if (videos.length >= limit) break;
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

  const playlistInfo: PlaylistInfo = {
    playlistId: info?.id ?? playlistId,
    title: info?.title ?? '',
    description: info?.description ?? '',
    channelName: info?.author?.name ?? '',
    channelId: info?.author?.id ?? '',
    videoCount: info?.total_items?.toString() ?? String(videos.length),
    thumbnail: info?.thumbnails?.[0]?.url ?? '',
    videos,
  };
  playlistCache.set(cacheKey, playlistInfo);
  return playlistInfo;
}

// --- Trending ---

export interface TrendingVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  views: string;
  published: string;
  duration: string;
  thumbnail: string;
  category: string;
}

export async function getTrending(
  category: string,
  limit: number,
): Promise<{ videos: TrendingVideo[]; category: string; mode: SearchMode }> {
  const cacheKey = `${category}|${limit}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) return cached as { videos: TrendingVideo[]; category: string; mode: SearchMode };

  const { yt, mode } = await getInstance();

  const CATEGORY_MAP: Record<string, string> = {
    now: 'Now',
    music: 'Music',
    gaming: 'Gaming',
    movies: 'Movies',
    default: 'Now',
  };

  const yttCategory = CATEGORY_MAP[category.toLowerCase()] ?? CATEGORY_MAP.default;

  let trendingVideos: TrendingVideo[] = [];
  try {
    const trending = await (yt as any).getTrending();
    const rawVideos: any[] = [];

    if (yttCategory === 'Now') {
      rawVideos.push(...(trending.videos ?? []));
    } else if (yttCategory === 'Music') {
      rawVideos.push(...(trending.music ?? []));
    } else if (yttCategory === 'Gaming') {
      rawVideos.push(...(trending.gaming ?? []));
    } else if (yttCategory === 'Movies') {
      rawVideos.push(...(trending.movies ?? []));
    }

    for (const v of rawVideos) {
      if (trendingVideos.length >= limit) break;
      const id = v.video_id ?? v.id ?? '';
      if (!id) continue;
      trendingVideos.push({
        id,
        title: v.title?.text ?? v.title?.toString?.() ?? '',
        channel: v.author?.name ?? v.short_byline_text?.text ?? '',
        channelId: v.author?.id ?? '',
        views: v.view_count?.text ?? v.short_view_count?.text ?? '',
        published: v.published?.text ?? '',
        duration: v.duration?.text ?? '',
        thumbnail: v.best_thumbnail?.url ?? v.thumbnails?.[0]?.url ?? '',
        category: yttCategory,
      });
    }
  } catch {
    // Trending not available — fall back to empty
  }

  const result = { videos: trendingVideos, category: yttCategory, mode };
  trendingCache.set(cacheKey, result);
  return result;
}

// --- Helpers ---

async function resolveChannelId(input: string): Promise<string> {
  const trimmed = input.trim();

  const cached = resolvedChannelIds.get(trimmed);
  if (cached) return cached;

  if (trimmed.startsWith('UC') && !trimmed.includes('/')) {
    resolvedChannelIds.set(trimmed, trimmed);
    return trimmed;
  }

  if (trimmed.startsWith('http')) {
    try {
      const match = new URL(trimmed).pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
      if (match) {
        resolvedChannelIds.set(trimmed, match[1]);
        return match[1];
      }
    } catch { /* fall through to resolveURL */ }
  }

  const { yt } = await getInstance();

  let urlToResolve: string;
  if (trimmed.startsWith('@')) {
    urlToResolve = `https://www.youtube.com/${trimmed}`;
  } else if (trimmed.startsWith('http')) {
    urlToResolve = trimmed;
  } else {
    urlToResolve = `https://www.youtube.com/@${trimmed}`;
  }

  const endpoint = await innertubeBreaker.call(() =>
    withTimeout(yt.resolveURL(urlToResolve), 15_000, `resolveURL(${urlToResolve})`)
  );
  const browseId = (endpoint as any)?.payload?.browseId;
  if (browseId && typeof browseId === 'string') {
    resolvedChannelIds.set(trimmed, browseId);
    return browseId;
  }

  throw new Error(`Could not resolve "${input}" to a channel ID`);
}
