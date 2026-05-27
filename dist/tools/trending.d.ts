import { z } from 'zod';
export declare const trendingInputSchema: {
    category: z.ZodOptional<z.ZodEnum<["now", "music", "gaming", "movies"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
};
interface TrendingArgs {
    category?: 'now' | 'music' | 'gaming' | 'movies';
    limit?: number;
}
export declare function handleTrending(args: TrendingArgs): Promise<{
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
//# sourceMappingURL=trending.d.ts.map