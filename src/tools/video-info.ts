import { z } from 'zod';
import { getVideoInfo, type VideoInfo } from '../lib/innertube.js';

export const videoInfoInputSchema = {
  videoId: z.string().describe('YouTube video ID'),
  detail: z.enum(['brief', 'standard', 'full']).optional()
    .describe('Detail level — "brief" (key metadata only), "standard" (most fields, truncated description, no chapters), or "full" (everything). Default: standard'),
};

type DetailLevel = 'brief' | 'standard' | 'full';

const BRIEF_FIELDS: (keyof VideoInfo)[] = [
  'id', 'title', 'channel', 'channelId', 'views', 'likes',
  'duration', 'published', 'relativeDate', 'category',
];

const DESC_TRUNCATE_LENGTH = 200;

function shapeResponse(info: VideoInfo, detail: DetailLevel): Partial<VideoInfo> {
  if (detail === 'full') return info;

  if (detail === 'brief') {
    const result: Partial<VideoInfo> = {};
    for (const key of BRIEF_FIELDS) {
      (result as any)[key] = info[key];
    }
    return result;
  }

  const { chapters, tags, thumbnail, ...rest } = info;
  return {
    ...rest,
    description: info.description.length > DESC_TRUNCATE_LENGTH
      ? info.description.slice(0, DESC_TRUNCATE_LENGTH) + '…'
      : info.description,
    chapterCount: chapters.length,
  } as any;
}

export async function handleVideoInfo(args: { videoId: string; detail?: DetailLevel }) {
  const info = await getVideoInfo(args.videoId);
  const detail = args.detail ?? 'standard';
  const shaped = shapeResponse(info, detail);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(shaped, null, 2),
    }],
  };
}
