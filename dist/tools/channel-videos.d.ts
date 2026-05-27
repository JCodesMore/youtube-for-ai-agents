import { z } from 'zod';
export declare const channelVideosInputSchema: {
    channelUrl: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodEnum<["newest", "popular", "oldest"]>>;
};
export declare function handleChannelVideos(args: {
    channelUrl: string;
    limit?: number;
    sort?: string;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
//# sourceMappingURL=channel-videos.d.ts.map