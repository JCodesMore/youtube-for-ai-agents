export const DEFAULTS = {
  search: {
    defaultLimit: 20,
    maxLimit: 50,
    defaultType: 'video' as const,
    defaultUploadDate: 'all' as const,
    defaultDuration: 'all' as const,
    defaultSortBy: 'relevance' as const,
  },

  transcript: {
    defaultLanguage: 'en',
    maxSegments: 5000,
    cleanupEnabled: true,
  },

  channel: {
    defaultVideoLimit: 30,
    maxVideoLimit: 500,
    defaultSort: 'newest' as const,
  },

  playlist: {
    defaultLimit: 30,
    maxLimit: 200,
  },

  auth: {
    cookieFilename: 'cookies.json',
    cdpPort: 9222,
    cdpHost: '127.0.0.1',
    profileDir: '.youtube/chrome-profile',
    requiredCookies: [
      'SID', 'HSID', 'SSID', 'APISID', 'SAPISID',
      '__Secure-1PSID', '__Secure-3PSID',
      'LOGIN_INFO',
    ] as const,
  },

  download: {
    defaultQuality: '720p' as const,
    defaultFormat: 'mp4',
    defaultType: 'video+audio' as const,
    maxDurationMinutes: 30,
  },

  innertube: {
    language: 'en',
    location: 'US',
    retrievePlayer: false,
  },
} as const;

/** Backward compatibility alias */
export const CONFIG = DEFAULTS;

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
