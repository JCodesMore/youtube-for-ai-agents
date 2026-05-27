/**
 * youtube_summarize — LLM-ready structured extraction.
 *
 * This tool does NOT do AI summarization. Instead it:
 *   1. Fetches transcript + video info in parallel
 *   2. Splits into chapter-aligned sections (or uniform chunks if no chapters)
 *   3. Extracts key sentences per section (top ~20% by importance score)
 *   4. Returns structured JSON optimized for an LLM to process
 *
 * Why: Feeding a raw 50k-token transcript to an LLM is wasteful. This
 * reduces it to ~10k tokens while preserving the structure, chapter anchors,
 * and the best signal sentences — so the calling agent can summarize, quote,
 * or answer questions accurately and cheaply.
 */
import { z } from 'zod';
export declare const summarizeInputSchema: {
    videoId: z.ZodString;
    sentencesPerSection: z.ZodOptional<z.ZodNumber>;
    includeTimestamps: z.ZodOptional<z.ZodBoolean>;
    language: z.ZodOptional<z.ZodString>;
};
interface SummarizeArgs {
    videoId: string;
    sentencesPerSection?: number;
    includeTimestamps?: boolean;
    language?: string;
}
export declare function handleSummarize(args: SummarizeArgs): Promise<{
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
//# sourceMappingURL=summarize.d.ts.map