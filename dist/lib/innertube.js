import { Innertube } from 'youtubei.js';
import { loadCookies } from './cookies.js';
import { getConfig } from './user-config.js';
import { videoInfoCache, searchCache, channelInfoCache, channelVideosCache, playlistCache, trendingCache, } from './cache.js';
import { bus } from './event-bus.js';
import { innertubeBreaker } from './circuit-breaker.js';
/** Wrap any promise with a hard timeout — RRSS: Robust */
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms)),
    ]);
}
let instance = null;
let instanceMode = 'anonymous';
export async function getInstance() {
    if (instance) {
        return { yt: instance, mode: instanceMode };
    }
    const cookieString = loadCookies();
    instanceMode = cookieString !== null ? 'personalized' : 'anonymous';
    const config = getConfig();
    instance = await innertubeBreaker.call(() => withTimeout(Innertube.create({
        lang: config.innertube.language,
        location: config.innertube.location,
        retrieve_player: config.innertube.retrievePlayer,
        ...(cookieString ? { cookie: cookieString } : {}),
    }), 15_000, 'Innertube.create'));
    return { yt: instance, mode: instanceMode };
}
export function resetInstance() {
    instance = null;
    instanceMode = 'anonymous';
}
// Map our intuitive duration names to youtubei.js values
const DURATION_MAP = {
    short: 'under_four_minutes',
    medium: 'four_to_twenty_minutes',
    long: 'over_twenty_minutes',
};
// Map our sortBy names to youtubei.js values
const SORT_MAP = {
    relevance: 'relevance',
    date: 'upload_date',
    views: 'view_count',
    rating: 'rating',
};
export async function search(query, limit, type, filters = {}) {
    const cacheKey = `${query}|${limit}|${type}|${JSON.stringify(filters)}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
        bus.emit('cache:hit', { cache: 'search', key: query });
        return cached;
    }
    bus.emit('cache:miss', { cache: 'search', key: query });
    const { yt, mode } = await getInstance();
    const searchType = type;
    const searchOptions = { type: searchType };
    if (filters.uploadDate && filters.uploadDate !== 'all') {
        searchOptions.upload_date = filters.uploadDate;
    }
    if (filters.duration && filters.duration !== 'all') {
        searchOptions.duration = DURATION_MAP[filters.duration] ?? filters.duration;
    }
    if (filters.sortBy && filters.sortBy !== 'relevance') {
        searchOptions.sort_by = SORT_MAP[filters.sortBy] ?? filters.sortBy;
    }
    const response = await innertubeBreaker.call(() => withTimeout(yt.search(query, searchOptions), 20_000, `search("${query}")`));
    const results = [];
    for (const item of response.results ?? []) {
        if (results.length >= limit)
            break;
        if (item.type === 'Video') {
            const video = item;
            const snippets = [];
            if (video.snippets?.length) {
                for (const s of video.snippets) {
                    snippets.push({
                        text: s.text?.text ?? '',
                        hoverText: s.hover_text?.text ?? '',
                        boldKeywords: s.text?.runs?.filter((r) => r.bold)?.map((r) => r.text) ?? [],
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
        }
        else if (item.type === 'Channel') {
            const ch = item;
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
        }
        else if (item.type === 'Playlist') {
            const pl = item;
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
export async function getVideoInfo(videoId) {
    const cached = videoInfoCache.get(videoId);
    if (cached) {
        bus.emit('cache:hit', { cache: 'video', key: videoId });
        return cached;
    }
    bus.emit('cache:miss', { cache: 'video', key: videoId });
    const { yt } = await getInstance();
    const info = await innertubeBreaker.call(() => withTimeout(yt.getInfo(videoId), 20_000, `getInfo(${videoId})`));
    const chapters = [];
    try {
        const markers = info.player_overlays
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
    }
    catch {
        // Chapters not available
    }
    const videoInfo = {
        id: info.basic_info.id ?? videoId,
        title: info.basic_info.title ?? '',
        channel: info.basic_info.author ?? '',
        channelId: info.basic_info.channel_id ?? '',
        channelUrl: info.basic_info.channel?.url ?? '',
        subscriberCount: info.secondary_info?.owner?.subscriber_count?.text ?? '',
        description: info.basic_info.short_description ?? '',
        category: info.basic_info.category ?? '',
        views: info.basic_info.view_count?.toLocaleString() ?? '',
        likes: info.basic_info.like_count?.toLocaleString() ?? '',
        published: info.primary_info?.published?.text ?? '',
        relativeDate: info.primary_info?.relative_date?.text ?? '',
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
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}
export async function getChannelInfo(channelInput) {
    const channelId = await resolveChannelId(channelInput);
    const cached = channelInfoCache.get(channelId);
    if (cached)
        return cached;
    const { yt } = await getInstance();
    const channel = await yt.getChannel(channelId);
    const metadata = channel.metadata;
    const headerContent = channel.header?.content;
    let description = metadata?.description ?? '';
    let subscriberCount = '';
    let videoCount = '';
    let viewCount = '';
    let joinedDate = '';
    let country = '';
    try {
        const about = await channel.getAbout();
        const aboutMeta = about.metadata;
        if (aboutMeta) {
            if (aboutMeta.description)
                description = aboutMeta.description;
            if (aboutMeta.subscriber_count)
                subscriberCount = aboutMeta.subscriber_count;
            if (aboutMeta.video_count)
                videoCount = aboutMeta.video_count;
            if (aboutMeta.view_count)
                viewCount = aboutMeta.view_count;
            if (aboutMeta.country)
                country = aboutMeta.country;
            if (aboutMeta.joined_date?.text)
                joinedDate = aboutMeta.joined_date.text;
        }
    }
    catch {
        // Some channels don't expose an about tab
    }
    const avatar = headerContent?.image?.avatar?.image
        ?? metadata?.avatar;
    const banner = headerContent?.banner?.image;
    const channelInfo = {
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
export async function getChannelVideos(channelUrl, limit, sort) {
    const channelId = await resolveChannelId(channelUrl);
    const cacheKey = `${channelId}|${limit}|${sort}`;
    const cached = channelVideosCache.get(cacheKey);
    if (cached)
        return cached;
    const { yt } = await getInstance();
    const channel = await yt.getChannel(channelId);
    const videosTab = await channel.getVideos();
    if (sort === 'popular') {
        try {
            await videosTab.applySort('Popular');
        }
        catch { /* sort not available */ }
    }
    else if (sort === 'oldest') {
        try {
            await videosTab.applySort('Oldest');
        }
        catch { /* sort not available */ }
    }
    const videos = [];
    let currentTab = videosTab;
    while (videos.length < limit) {
        for (const video of currentTab.videos) {
            if (videos.length >= limit)
                break;
            videos.push({
                id: video.video_id ?? video.id ?? '',
                title: video.title?.text ?? video.title?.toString?.() ?? '',
                views: video.view_count?.text ?? video.short_view_count?.text ?? '',
                published: video.published?.text ?? '',
                duration: video.duration?.text ?? '',
            });
        }
        if (videos.length >= limit || !currentTab.has_continuation)
            break;
        try {
            currentTab = await currentTab.getContinuation();
        }
        catch {
            break;
        }
    }
    const channelResult = {
        channelId: channel.metadata?.external_id ?? channelId,
        channelName: channel.metadata?.title ?? '',
        videoCount: videos.length,
        videos,
    };
    channelVideosCache.set(cacheKey, channelResult);
    return channelResult;
}
export async function getPlaylist(playlistId, limit) {
    const cacheKey = `${playlistId}|${limit}`;
    const cached = playlistCache.get(cacheKey);
    if (cached)
        return cached;
    const { yt } = await getInstance();
    const playlist = await yt.getPlaylist(playlistId);
    const info = playlist.info;
    const videos = [];
    let current = playlist;
    let position = 0;
    while (videos.length < limit) {
        for (const item of current.items ?? current.videos ?? []) {
            if (videos.length >= limit)
                break;
            const v = item;
            videos.push({
                id: v.video_id ?? v.id ?? '',
                title: v.title?.text ?? v.title?.toString?.() ?? '',
                channel: v.author?.name ?? '',
                channelId: v.author?.id ?? '',
                duration: v.duration?.text ?? '',
                position: position++,
            });
        }
        if (videos.length >= limit || !current.has_continuation)
            break;
        try {
            current = await current.getContinuation();
        }
        catch {
            break;
        }
    }
    const playlistInfo = {
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
export async function getTrending(category, limit) {
    const cacheKey = `${category}|${limit}`;
    const cached = trendingCache.get(cacheKey);
    if (cached)
        return cached;
    const { yt, mode } = await getInstance();
    const CATEGORY_MAP = {
        now: 'Now',
        music: 'Music',
        gaming: 'Gaming',
        movies: 'Movies',
        default: 'Now',
    };
    const yttCategory = CATEGORY_MAP[category.toLowerCase()] ?? CATEGORY_MAP.default;
    let trendingVideos = [];
    try {
        const trending = await yt.getTrending();
        const rawVideos = [];
        if (yttCategory === 'Now') {
            rawVideos.push(...(trending.videos ?? []));
        }
        else if (yttCategory === 'Music') {
            rawVideos.push(...(trending.music ?? []));
        }
        else if (yttCategory === 'Gaming') {
            rawVideos.push(...(trending.gaming ?? []));
        }
        else if (yttCategory === 'Movies') {
            rawVideos.push(...(trending.movies ?? []));
        }
        for (const v of rawVideos) {
            if (trendingVideos.length >= limit)
                break;
            const id = v.video_id ?? v.id ?? '';
            if (!id)
                continue;
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
    }
    catch {
        // Trending not available — fall back to empty
    }
    const result = { videos: trendingVideos, category: yttCategory, mode };
    trendingCache.set(cacheKey, result);
    return result;
}
// --- Helpers ---
async function resolveChannelId(input) {
    const trimmed = input.trim();
    if (trimmed.startsWith('UC') && !trimmed.includes('/')) {
        return trimmed;
    }
    // For /channel/UCxxx URLs, extract the ID directly
    if (trimmed.startsWith('http')) {
        try {
            const match = new URL(trimmed).pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
            if (match)
                return match[1];
        }
        catch { /* fall through to resolveURL */ }
    }
    // Use InnerTube to resolve @handles and other URL formats
    const { yt } = await getInstance();
    let urlToResolve;
    if (trimmed.startsWith('@')) {
        urlToResolve = `https://www.youtube.com/${trimmed}`;
    }
    else if (trimmed.startsWith('http')) {
        urlToResolve = trimmed;
    }
    else {
        urlToResolve = `https://www.youtube.com/@${trimmed}`;
    }
    const endpoint = await yt.resolveURL(urlToResolve);
    const browseId = endpoint?.payload?.browseId;
    if (browseId && typeof browseId === 'string') {
        return browseId;
    }
    throw new Error(`Could not resolve "${input}" to a channel ID`);
}
//# sourceMappingURL=innertube.js.map