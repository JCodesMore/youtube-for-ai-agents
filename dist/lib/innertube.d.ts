import { Innertube } from 'youtubei.js';
export type SearchMode = 'personalized' | 'anonymous';
export declare function getInstance(): Promise<{
    yt: Innertube;
    mode: SearchMode;
}>;
export declare function resetInstance(): void;
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
export declare function search(query: string, limit: number, type: string, filters?: SearchFilters): Promise<{
    results: SearchResult[];
    mode: SearchMode;
}>;
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
    chapters: Array<{
        title: string;
        timestamp: number;
    }>;
}
export declare function getVideoInfo(videoId: string): Promise<VideoInfo>;
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
export declare function getChannelInfo(channelInput: string): Promise<ChannelInfo>;
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
export declare function getChannelVideos(channelUrl: string, limit: number, sort: string): Promise<ChannelResult>;
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
export declare function getPlaylist(playlistId: string, limit: number): Promise<PlaylistInfo>;
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
export declare function getTrending(category: string, limit: number): Promise<{
    videos: TrendingVideo[];
    category: string;
    mode: SearchMode;
}>;
//# sourceMappingURL=innertube.d.ts.map