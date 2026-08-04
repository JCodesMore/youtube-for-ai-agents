import { z } from 'zod';
export declare const relatedInputSchema: {
    videoId: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
};
interface RelatedArgs {
    videoId: string;
    limit?: number;
}
export interface RelatedVideo {
    id: string;
    title: string;
    channel: string;
    channelId: string;
    views: string;
    published: string;
    duration: string;
    thumbnail: string;
}
export declare function handleRelated(args: RelatedArgs): Promise<{
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
//# sourceMappingURL=related.d.ts.map