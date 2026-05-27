import { z } from 'zod';
export declare const channelInfoInputSchema: {
    channelId: z.ZodString;
};
export declare function handleChannelInfo(args: {
    channelId: string;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
//# sourceMappingURL=channel-info.d.ts.map