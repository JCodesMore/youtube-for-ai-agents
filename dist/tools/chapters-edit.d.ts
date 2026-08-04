/**
 * youtube_chapters_edit — auto-generate chapter timestamps from a transcript.
 *
 * Algorithm (TextTiling-inspired, no ML required):
 *   1. Tokenise every segment into a bag-of-words (stopwords removed)
 *   2. At each candidate break point, compute a "novelty score" = fraction of
 *      words in the next window that did NOT appear in the previous window
 *   3. Smooth scores, find the N largest peaks that are at least MIN_GAP apart
 *   4. Each chapter title comes from the highest-scored sentence in that section
 *
 * If the video already has chapters, they are returned as-is (no overwrite).
 * The output includes a `formattedForDescription` string ready to paste into a
 * YouTube video description.
 */
import { z } from 'zod';
export declare const chaptersEditInputSchema: {
    videoId: z.ZodString;
    maxChapters: z.ZodOptional<z.ZodNumber>;
    windowSize: z.ZodOptional<z.ZodNumber>;
    language: z.ZodOptional<z.ZodString>;
    force: z.ZodOptional<z.ZodBoolean>;
};
interface ChaptersEditArgs {
    videoId: string;
    maxChapters?: number;
    windowSize?: number;
    language?: string;
    force?: boolean;
}
export declare function handleChaptersEdit(args: ChaptersEditArgs): Promise<{
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
//# sourceMappingURL=chapters-edit.d.ts.map