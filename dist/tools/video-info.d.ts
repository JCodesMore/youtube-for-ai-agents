import { z } from 'zod';
export declare const videoInfoInputSchema: {
    videoId: z.ZodString;
    detail: z.ZodOptional<z.ZodEnum<["brief", "standard", "full"]>>;
};
type DetailLevel = 'brief' | 'standard' | 'full';
export declare function handleVideoInfo(args: {
    videoId: string;
    detail?: DetailLevel;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=video-info.d.ts.map