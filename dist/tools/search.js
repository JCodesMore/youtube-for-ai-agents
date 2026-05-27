import { z } from 'zod';
import { search } from '../lib/innertube.js';
import { DEFAULTS } from '../config.js';
import { getConfig } from '../lib/user-config.js';
export const searchInputSchema = {
    query: z.string().describe('Search query'),
    limit: z.number().min(1).max(DEFAULTS.search.maxLimit).optional()
        .describe(`Number of results (default: ${DEFAULTS.search.defaultLimit}, max: ${DEFAULTS.search.maxLimit})`),
    type: z.enum(['video', 'channel', 'playlist']).optional()
        .describe(`Filter by type (default: ${DEFAULTS.search.defaultType})`),
    uploadDate: z.enum(['all', 'today', 'week', 'month', 'year']).optional()
        .describe('Filter by upload date — "today", "week", "month", "year", or "all" (default: all)'),
    duration: z.enum(['all', 'short', 'medium', 'long']).optional()
        .describe('Filter by duration — "short" (<4 min), "medium" (4-20 min), "long" (>20 min), or "all" (default: all)'),
    sortBy: z.enum(['relevance', 'rating', 'date', 'views']).optional()
        .describe('Sort results — "relevance", "date" (newest first), "views" (most viewed), "rating", or default relevance'),
};
export async function handleSearch(args) {
    const config = getConfig();
    const limit = args.limit ?? config.search.defaultLimit;
    const type = args.type ?? config.search.defaultType;
    const uploadDate = (args.uploadDate ?? config.search.defaultUploadDate);
    const duration = (args.duration ?? config.search.defaultDuration);
    const sortBy = (args.sortBy ?? config.search.defaultSortBy);
    const { results, mode } = await search(args.query, limit, type, {
        uploadDate,
        duration,
        sortBy,
    });
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({ results, mode, query: args.query }, null, 2),
            }],
    };
}
//# sourceMappingURL=search.js.map