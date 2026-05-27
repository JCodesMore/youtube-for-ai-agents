import { z } from 'zod';
export declare const playlistInputSchema: {
    playlistId: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
};
export declare function handlePlaylist(args: {
    playlistId: string;
    limit?: number;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
//# sourceMappingURL=playlist.d.ts.map