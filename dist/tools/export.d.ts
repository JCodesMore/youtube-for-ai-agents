/**
 * youtube_export — compile a full research report from a single video.
 *
 * Fetches video info, structured summary, and optionally comments in parallel,
 * then assembles a publication-ready Markdown document (or structured JSON).
 *
 * Markdown output is designed to be:
 *   - Saved as a .md file and shared with a team
 *   - Pasted into Notion / Obsidian / any markdown editor
 *   - Used as LLM context for deeper analysis
 *
 * If outputPath is provided the report is also written to disk.
 */
import { z } from 'zod';
export declare const exportInputSchema: {
    videoId: z.ZodString;
    format: z.ZodOptional<z.ZodEnum<["markdown", "json"]>>;
    includeTranscript: z.ZodOptional<z.ZodBoolean>;
    includeComments: z.ZodOptional<z.ZodBoolean>;
    sentencesPerSection: z.ZodOptional<z.ZodNumber>;
    outputPath: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
};
interface ExportArgs {
    videoId: string;
    format?: 'markdown' | 'json';
    includeTranscript?: boolean;
    includeComments?: boolean;
    sentencesPerSection?: number;
    outputPath?: string;
    language?: string;
}
export declare function handleExport(args: ExportArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
} | {
    _meta?: {
        savedTo: string;
    } | undefined;
    content: {
        type: "text";
        text: string;
    }[];
    isError?: undefined;
}>;
export {};
//# sourceMappingURL=export.d.ts.map