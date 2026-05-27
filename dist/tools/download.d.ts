import { z } from 'zod';
import type { DownloadQuality, DownloadType } from '../config.js';
export declare const downloadInputSchema: {
    videoId: z.ZodString;
    outputPath: z.ZodOptional<z.ZodString>;
    quality: z.ZodOptional<z.ZodEnum<["best", "bestefficiency", "144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"]>>;
    type: z.ZodOptional<z.ZodEnum<["video+audio", "audio", "video"]>>;
    format: z.ZodOptional<z.ZodString>;
    force: z.ZodOptional<z.ZodBoolean>;
};
interface DownloadArgs {
    videoId: string;
    outputPath?: string;
    quality?: DownloadQuality;
    type?: DownloadType;
    format?: string;
    force?: boolean;
}
export declare function handleDownload(args: DownloadArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=download.d.ts.map