/**
 * youtube_transcript_translate — translate a video's transcript to any language
 * via a LibreTranslate-compatible engine (free, self-hostable).
 *
 * Preserves per-segment timestamps by re-splitting the translated chunk on
 * the paragraph-break delimiter that segments were joined with; falls back
 * to proportional character-length distribution when the delimiter is lost
 * in translation. Bounded-concurrency chunk fetch, hard per-request timeout,
 * honest per-chunk failure isolation.
 *
 * ARM:
 *   Adoption  — unlocks ~70% of YouTube (non-English) for any AI agent.
 *   Retention — self-hostable engine means no rate-limit surprise; users invest
 *               in a local LibreTranslate container and never leave.
 *   Monetize  — creator use case: translate own transcripts for multilingual
 *               subtitles / blog reposts.
 */
import { z } from 'zod';
export declare const transcriptTranslateInputSchema: {
    videoId: z.ZodString;
    targetLanguage: z.ZodOptional<z.ZodString>;
    sourceLanguage: z.ZodOptional<z.ZodString>;
    engineUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    format: z.ZodOptional<z.ZodEnum<["text", "segments", "both"]>>;
    startTime: z.ZodOptional<z.ZodNumber>;
    endTime: z.ZodOptional<z.ZodNumber>;
    maxSegments: z.ZodOptional<z.ZodNumber>;
};
interface TranslateArgs {
    videoId: string;
    targetLanguage?: string;
    sourceLanguage?: string;
    engineUrl?: string;
    apiKey?: string;
    format?: 'text' | 'segments' | 'both';
    startTime?: number;
    endTime?: number;
    maxSegments?: number;
}
export declare function handleTranscriptTranslate(args: TranslateArgs): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=transcript-translate.d.ts.map