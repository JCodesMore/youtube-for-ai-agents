import { z } from 'zod';
export declare const searchInputSchema: {
    query: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    type: z.ZodOptional<z.ZodEnum<["video", "channel", "playlist"]>>;
    uploadDate: z.ZodOptional<z.ZodEnum<["all", "today", "week", "month", "year"]>>;
    duration: z.ZodOptional<z.ZodEnum<["all", "short", "medium", "long"]>>;
    sortBy: z.ZodOptional<z.ZodEnum<["relevance", "rating", "date", "views"]>>;
};
interface SearchArgs {
    query: string;
    limit?: number;
    type?: string;
    uploadDate?: string;
    duration?: string;
    sortBy?: string;
}
export declare function handleSearch(args: SearchArgs): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export {};
//# sourceMappingURL=search.d.ts.map