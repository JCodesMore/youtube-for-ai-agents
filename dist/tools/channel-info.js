import { z } from 'zod';
import { getChannelInfo } from '../lib/innertube.js';
export const channelInfoInputSchema = {
    channelId: z.string().describe('@handle, full YouTube URL, or channel ID'),
};
export async function handleChannelInfo(args) {
    const info = await getChannelInfo(args.channelId);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(info, null, 2),
            }],
    };
}
//# sourceMappingURL=channel-info.js.map