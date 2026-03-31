import { z } from 'zod';
import type { DownloadQuality } from '../config.js';
export declare const clipInputSchema: {
    videoId: z.ZodString;
    clips: z.ZodArray<z.ZodObject<{
        startTime: z.ZodString;
        endTime: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startTime: string;
        endTime: string;
        label?: string | undefined;
    }, {
        startTime: string;
        endTime: string;
        label?: string | undefined;
    }>, "many">;
    outputDir: z.ZodOptional<z.ZodString>;
    quality: z.ZodOptional<z.ZodEnum<["best", "bestefficiency", "144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"]>>;
    accurate: z.ZodOptional<z.ZodBoolean>;
    force: z.ZodOptional<z.ZodBoolean>;
    highlightReel: z.ZodOptional<z.ZodBoolean>;
};
interface ClipArgs {
    videoId: string;
    clips: Array<{
        startTime: string;
        endTime: string;
        label?: string;
    }>;
    outputDir?: string;
    quality?: DownloadQuality;
    accurate?: boolean;
    force?: boolean;
    highlightReel?: boolean;
}
export declare function handleClip(args: ClipArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=clip.d.ts.map