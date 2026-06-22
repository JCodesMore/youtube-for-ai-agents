import { z } from 'zod';
export declare const channelCompareInputSchema: {
    channels: z.ZodArray<z.ZodString, "many">;
    recentVideoCount: z.ZodOptional<z.ZodNumber>;
    includeRecentTitles: z.ZodOptional<z.ZodBoolean>;
};
export declare function handleChannelCompare(args: {
    channels: string[];
    recentVideoCount?: number;
    includeRecentTitles?: boolean;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
//# sourceMappingURL=channel-compare.d.ts.map