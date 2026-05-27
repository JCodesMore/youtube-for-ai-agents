export declare const DEFAULTS: {
    readonly search: {
        readonly defaultLimit: 20;
        readonly maxLimit: 50;
        readonly defaultType: "video";
        readonly defaultUploadDate: "all";
        readonly defaultDuration: "all";
        readonly defaultSortBy: "relevance";
    };
    readonly transcript: {
        readonly defaultLanguage: "en";
        readonly maxSegments: 5000;
        readonly cleanupEnabled: true;
    };
    readonly channel: {
        readonly defaultVideoLimit: 30;
        readonly maxVideoLimit: 500;
        readonly defaultSort: "newest";
    };
    readonly playlist: {
        readonly defaultLimit: 30;
        readonly maxLimit: 200;
    };
    readonly auth: {
        readonly cookieFilename: "cookies.json";
        readonly cdpPort: 9222;
        readonly cdpHost: "127.0.0.1";
        readonly profileDir: ".youtube/chrome-profile";
        readonly requiredCookies: readonly ["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID", "LOGIN_INFO"];
    };
    readonly download: {
        readonly defaultQuality: "720p";
        readonly defaultFormat: "mp4";
        readonly defaultType: "video+audio";
        readonly maxDurationMinutes: 30;
    };
    readonly innertube: {
        readonly language: "en";
        readonly location: "US";
        readonly retrievePlayer: false;
    };
};
/** Backward compatibility alias */
export declare const CONFIG: {
    readonly search: {
        readonly defaultLimit: 20;
        readonly maxLimit: 50;
        readonly defaultType: "video";
        readonly defaultUploadDate: "all";
        readonly defaultDuration: "all";
        readonly defaultSortBy: "relevance";
    };
    readonly transcript: {
        readonly defaultLanguage: "en";
        readonly maxSegments: 5000;
        readonly cleanupEnabled: true;
    };
    readonly channel: {
        readonly defaultVideoLimit: 30;
        readonly maxVideoLimit: 500;
        readonly defaultSort: "newest";
    };
    readonly playlist: {
        readonly defaultLimit: 30;
        readonly maxLimit: 200;
    };
    readonly auth: {
        readonly cookieFilename: "cookies.json";
        readonly cdpPort: 9222;
        readonly cdpHost: "127.0.0.1";
        readonly profileDir: ".youtube/chrome-profile";
        readonly requiredCookies: readonly ["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID", "LOGIN_INFO"];
    };
    readonly download: {
        readonly defaultQuality: "720p";
        readonly defaultFormat: "mp4";
        readonly defaultType: "video+audio";
        readonly maxDurationMinutes: 30;
    };
    readonly innertube: {
        readonly language: "en";
        readonly location: "US";
        readonly retrievePlayer: false;
    };
};
export type ResolvedConfig = {
    search: {
        defaultLimit: number;
        maxLimit: number;
        defaultType: SearchType;
        defaultUploadDate: UploadDate;
        defaultDuration: SearchDuration;
        defaultSortBy: SearchSortBy;
    };
    transcript: {
        defaultLanguage: string;
        maxSegments: number;
        cleanupEnabled: boolean;
    };
    channel: {
        defaultVideoLimit: number;
        maxVideoLimit: number;
        defaultSort: SortOrder;
    };
    playlist: {
        defaultLimit: number;
        maxLimit: number;
    };
    download: {
        defaultQuality: DownloadQuality;
        defaultFormat: string;
        defaultType: DownloadType;
        maxDurationMinutes: number;
    };
    auth: {
        cookieFilename: string;
        cdpPort: number;
        cdpHost: string;
        profileDir: string;
        requiredCookies: readonly string[];
    };
    innertube: {
        language: string;
        location: string;
        retrievePlayer: boolean;
    };
};
export type SearchType = 'video' | 'channel' | 'playlist';
export type UploadDate = 'all' | 'today' | 'week' | 'month' | 'year';
export type SearchDuration = 'all' | 'short' | 'medium' | 'long';
export type SearchSortBy = 'relevance' | 'rating' | 'date' | 'views';
export type SortOrder = 'newest' | 'popular' | 'oldest';
export type DownloadQuality = 'best' | 'bestefficiency' | '144p' | '240p' | '360p' | '480p' | '720p' | '1080p' | '1440p' | '2160p';
export type DownloadType = 'video+audio' | 'audio' | 'video';
//# sourceMappingURL=config.d.ts.map