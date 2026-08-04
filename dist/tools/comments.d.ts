import { z } from 'zod';
export declare const commentsInputSchema: {
    videoId: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    sortBy: z.ZodOptional<z.ZodEnum<["top", "new"]>>;
};
interface CommentsArgs {
    videoId: string;
    limit?: number;
    sortBy?: 'top' | 'new';
}
export interface CommentItem {
    id: string;
    author: string;
    authorId: string;
    text: string;
    likes: string;
    published: string;
    isPinned: boolean;
    isCreatorReply: boolean;
    replyCount: string;
}
export declare function handleComments(args: CommentsArgs): Promise<{
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
//# sourceMappingURL=comments.d.ts.map