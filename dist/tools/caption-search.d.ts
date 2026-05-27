/**
 * youtube_caption_search — full-text search within a video's transcript.
 *
 * Unlike youtube_get_transcript (which returns all segments), this tool
 * searches and returns only the matching moments — each with surrounding
 * context lines and a click-to-jump timestamp. Perfect for:
 *   - "Find every time they mention X in this 3-hour lecture"
 *   - "When do they talk about pricing?"
 *   - "Show me all the moments where [person] speaks"
 */
import { z } from 'zod';
export declare const captionSearchInputSchema: {
    videoId: z.ZodString;
    query: z.ZodString;
    caseSensitive: z.ZodOptional<z.ZodBoolean>;
    contextLines: z.ZodOptional<z.ZodNumber>;
    maxMatches: z.ZodOptional<z.ZodNumber>;
    language: z.ZodOptional<z.ZodString>;
};
interface CaptionSearchArgs {
    videoId: string;
    query: string;
    caseSensitive?: boolean;
    contextLines?: number;
    maxMatches?: number;
    language?: string;
}
export interface CaptionMatch {
    matchIndex: number;
    timestamp: number;
    timestampFormatted: string;
    youtubeLink: string;
    matchedText: string;
    context: Array<{
        text: string;
        offset: number;
        isMatch: boolean;
    }>;
}
export declare function handleCaptionSearch(args: CaptionSearchArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
} | {
    content: {
        type: "text";
        text: string;
    }[];
    isError?: undefined;
}>;
export {};
//# sourceMappingURL=caption-search.d.ts.map