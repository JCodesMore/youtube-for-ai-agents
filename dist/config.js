export const DEFAULTS = {
    search: {
        defaultLimit: 20,
        maxLimit: 50,
        defaultType: 'video',
        defaultUploadDate: 'all',
        defaultDuration: 'all',
        defaultSortBy: 'relevance',
    },
    transcript: {
        defaultLanguage: 'en',
        maxSegments: 5000,
        cleanupEnabled: true,
    },
    channel: {
        defaultVideoLimit: 30,
        maxVideoLimit: 500,
        defaultSort: 'newest',
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
        ],
    },
    download: {
        defaultQuality: '720p',
        defaultFormat: 'mp4',
        defaultType: 'video+audio',
        maxDurationMinutes: 30,
    },
    innertube: {
        language: 'en',
        location: 'US',
        retrievePlayer: false,
    },
};
/** Backward compatibility alias */
export const CONFIG = DEFAULTS;
//# sourceMappingURL=config.js.map