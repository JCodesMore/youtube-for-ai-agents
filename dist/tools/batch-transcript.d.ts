import { z } from 'zod';
export declare const batchTranscriptInputSchema: {
    videoIds: z.ZodArray<z.ZodString, "many">;
    language: z.ZodOptional<z.ZodString>;
    format: z.ZodOptional<z.ZodEnum<["text", "segments", "both"]>>;
    maxSegments: z.ZodOptional<z.ZodNumber>;
};
interface BatchTranscriptArgs {
    videoIds: string[];
    language?: string;
    format?: 'text' | 'segments' | 'both';
    maxSegments?: number;
}
export declare function handleBatchTranscript(args: BatchTranscriptArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=batch-transcript.d.ts.map