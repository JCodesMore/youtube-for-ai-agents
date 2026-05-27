/**
 * youtube_chapters_edit — auto-generate chapter timestamps from a transcript.
 *
 * Algorithm (TextTiling-inspired, no ML required):
 *   1. Tokenise every segment into a bag-of-words (stopwords removed)
 *   2. At each candidate break point, compute a "novelty score" = fraction of
 *      words in the next window that did NOT appear in the previous window
 *   3. Smooth scores, find the N largest peaks that are at least MIN_GAP apart
 *   4. Each chapter title comes from the highest-scored sentence in that section
 *
 * If the video already has chapters, they are returned as-is (no overwrite).
 * The output includes a `formattedForDescription` string ready to paste into a
 * YouTube video description.
 */
import { z } from 'zod';
import { getTranscript } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';
export const chaptersEditInputSchema = {
    videoId: z.string().describe('YouTube video ID'),
    maxChapters: z.number().min(2).max(30).optional()
        .describe('Target number of chapters to generate (default: 8, min: 2, max: 30)'),
    windowSize: z.number().min(5).max(100).optional()
        .describe('Segments on each side of a candidate break point used for novelty scoring (default: 20). Larger = coarser chapter boundaries.'),
    language: z.string().optional()
        .describe('Transcript language code (default: "en")'),
    force: z.boolean().optional()
        .describe('Re-generate chapters even if the video already has them (default: false)'),
};
// ── Text helpers ────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'this', 'that', 'these',
    'those', 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'my', 'your', 'our', 'their',
    'its', 'from', 'by', 'as', 'about', 'up', 'out', 'if', 'then', 'so', 'what', 'which',
    'who', 'when', 'where', 'how', 'not', 'no', 'just', 'like', 'know', 'think', 'really',
    'yeah', 'okay', 'um', 'uh', 'right', 'going', 'get', 'got', 'go', 'see', 'said',
]);
function tokenise(text) {
    const tokens = new Set();
    for (const w of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
        if (w.length > 3 && !STOPWORDS.has(w))
            tokens.add(w);
    }
    return tokens;
}
function jaccard(a, b) {
    let intersection = 0;
    for (const w of a)
        if (b.has(w))
            intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 1 : intersection / union;
}
function union(sets) {
    const out = new Set();
    for (const s of sets)
        for (const w of s)
            out.add(w);
    return out;
}
function smooth(arr, radius) {
    return arr.map((_, i) => {
        const lo = Math.max(0, i - radius);
        const hi = Math.min(arr.length - 1, i + radius);
        let sum = 0;
        for (let j = lo; j <= hi; j++)
            sum += arr[j];
        return sum / (hi - lo + 1);
    });
}
function formatTs(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
// ── Chapter title extraction ────────────────────────────────────────────────
function extractTitle(texts) {
    // Score each sentence; pick the most informative one as the chapter title
    let bestScore = -Infinity;
    let bestText = '';
    for (const t of texts) {
        const trimmed = t.trim();
        if (trimmed.length < 10)
            continue;
        let score = Math.min(trimmed.length / 80, 1.5);
        if (/\d/.test(trimmed))
            score += 0.3;
        if (/\bbecause\b|\btherefore\b|\bso\b/.test(trimmed.toLowerCase()))
            score += 0.3;
        if (/^(um|uh|like|you know|so,|and,)/i.test(trimmed))
            score -= 0.8;
        if (/subscribe|click|like this/i.test(trimmed))
            score -= 1;
        if (score > bestScore) {
            bestScore = score;
            bestText = trimmed;
        }
    }
    if (!bestText)
        return texts[0]?.trim().slice(0, 60) ?? 'Chapter';
    // Truncate to a sensible title length, ending at a word boundary
    let title = bestText.slice(0, 55);
    if (bestText.length > 55) {
        const lastSpace = title.lastIndexOf(' ');
        title = (lastSpace > 20 ? title.slice(0, lastSpace) : title) + '…';
    }
    // Capitalise first letter
    return title.charAt(0).toUpperCase() + title.slice(1);
}
// ── Main handler ────────────────────────────────────────────────────────────
export async function handleChaptersEdit(args) {
    const maxChapters = args.maxChapters ?? 8;
    const windowSize = args.windowSize ?? 20;
    // Parallel fetch
    const [transcriptResult, videoInfoResult] = await Promise.allSettled([
        getTranscript(args.videoId, args.language),
        getVideoInfo(args.videoId),
    ]);
    if (transcriptResult.status === 'rejected') {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(transcriptResult.reason) }) }], isError: true };
    }
    const transcript = transcriptResult.value;
    if ('error' in transcript) {
        return { content: [{ type: 'text', text: JSON.stringify(transcript) }], isError: true };
    }
    const videoInfo = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value : null;
    // If the video already has chapters and force is not set, return them
    if (videoInfo?.chapters?.length && videoInfo.chapters.length >= 2 && !args.force) {
        const existing = videoInfo.chapters.map((ch, i) => ({
            index: i,
            timestamp: ch.timestamp,
            timestampFormatted: formatTs(ch.timestamp),
            youtubeLink: `https://youtu.be/${args.videoId}?t=${ch.timestamp}`,
            title: ch.title,
        }));
        const description = existing.map(c => `${c.timestampFormatted} ${c.title}`).join('\n');
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        videoId: args.videoId,
                        title: videoInfo.title,
                        existed: true,
                        note: 'Video already has chapters. Pass force: true to regenerate.',
                        chapterCount: existing.length,
                        chapters: existing,
                        formattedForDescription: description,
                    }, null, 2),
                }],
        };
    }
    const segments = transcript.segments;
    if (segments.length < 10) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({ error: 'Transcript too short to generate meaningful chapters.', segmentCount: segments.length }),
                }],
            isError: true,
        };
    }
    // Tokenise all segments
    const vocabs = segments.map(s => tokenise(s.text));
    // Compute novelty scores at each candidate break
    const scores = new Array(segments.length).fill(0);
    for (let i = windowSize; i < segments.length - windowSize; i++) {
        const left = union(vocabs.slice(Math.max(0, i - windowSize), i));
        const right = union(vocabs.slice(i, Math.min(segments.length, i + windowSize)));
        scores[i] = 1 - jaccard(left, right); // 0 = same topic, 1 = totally different
    }
    // Smooth to avoid noise
    const smoothed = smooth(scores, 3);
    // Find top maxChapters-1 peaks with minimum gap = floor(segments / maxChapters / 2)
    const minGap = Math.max(10, Math.floor(segments.length / maxChapters / 2));
    const breakPoints = [];
    const indexed = smoothed
        .map((v, i) => ({ v, i }))
        .filter(x => x.i >= windowSize && x.i < segments.length - windowSize)
        .sort((a, b) => b.v - a.v);
    for (const { i } of indexed) {
        if (breakPoints.length >= maxChapters - 1)
            break;
        if (breakPoints.every(bp => Math.abs(bp - i) >= minGap)) {
            breakPoints.push(i);
        }
    }
    breakPoints.sort((a, b) => a - b);
    const allBreaks = [0, ...breakPoints]; // always start a chapter at 0
    // Build chapter objects
    const chapters = allBreaks.map((startIdx, ci) => {
        const endIdx = allBreaks[ci + 1] ?? segments.length;
        const sectionSegs = segments.slice(startIdx, endIdx);
        const title = extractTitle(sectionSegs.slice(0, 8).map(s => s.text));
        const startSec = segments[startIdx].offset;
        return {
            index: ci,
            timestamp: startSec,
            timestampFormatted: formatTs(startSec),
            youtubeLink: `https://youtu.be/${args.videoId}?t=${startSec}`,
            title,
            segmentCount: sectionSegs.length,
            noveltyScore: parseFloat((smoothed[startIdx] ?? 0).toFixed(3)),
        };
    });
    const description = chapters.map(c => `${c.timestampFormatted} ${c.title}`).join('\n');
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    videoId: args.videoId,
                    title: videoInfo?.title ?? '',
                    existed: false,
                    generated: true,
                    chapterCount: chapters.length,
                    totalSegments: segments.length,
                    chapters,
                    formattedForDescription: description,
                    note: 'AI-generated chapters — review titles before publishing. Paste formattedForDescription into your YouTube video description to enable chapters.',
                }, null, 2),
            }],
    };
}
//# sourceMappingURL=chapters-edit.js.map