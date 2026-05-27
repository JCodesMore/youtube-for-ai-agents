/**
 * youtube_summarize — LLM-ready structured extraction.
 *
 * This tool does NOT do AI summarization. Instead it:
 *   1. Fetches transcript + video info in parallel
 *   2. Splits into chapter-aligned sections (or uniform chunks if no chapters)
 *   3. Extracts key sentences per section (top ~20% by importance score)
 *   4. Returns structured JSON optimized for an LLM to process
 *
 * Why: Feeding a raw 50k-token transcript to an LLM is wasteful. This
 * reduces it to ~10k tokens while preserving the structure, chapter anchors,
 * and the best signal sentences — so the calling agent can summarize, quote,
 * or answer questions accurately and cheaply.
 */
import { z } from 'zod';
import { getTranscript } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';
export const summarizeInputSchema = {
    videoId: z.string().describe('YouTube video ID'),
    sentencesPerSection: z.number().min(1).max(20).optional()
        .describe('Key sentences to extract per chapter/section (default: 5). Lower = more condensed.'),
    includeTimestamps: z.boolean().optional()
        .describe('Include timestamps on extracted sentences (default: true)'),
    language: z.string().optional()
        .describe('Transcript language (default: "en")'),
};
// Score a sentence by estimated importance:
// - longer sentences carry more information
// - sentences with numbers/figures are often key claims
// - avoid pure filler phrases
function scoreSegment(text) {
    const t = text.toLowerCase().trim();
    if (t.length < 15)
        return 0;
    let score = Math.min(t.length / 80, 1.5); // length bonus, capped
    // Signal boosters
    if (/\d/.test(t))
        score += 0.5; // contains numbers
    if (/\bbecause\b|\btherefore\b|\bso\b|\bthus\b/.test(t))
        score += 0.4; // causal
    if (/\bimportant\b|\bkey\b|\bmain\b|\bcritical\b/.test(t))
        score += 0.4; // emphasis
    if (/\bfirst\b|\bsecond\b|\bfinally\b|\bmost\b/.test(t))
        score += 0.3; // enumeration
    // Filler penalties
    if (/^(um|uh|like|you know|so|and|but)\b/.test(t))
        score -= 0.5;
    if (/\bclick\b|\bsubscribe\b|\blike\s+this\b/.test(t))
        score -= 0.6; // channel-plug
    return score;
}
export async function handleSummarize(args) {
    const sentencesPerSection = args.sentencesPerSection ?? 5;
    const includeTimestamps = args.includeTimestamps ?? true;
    // Parallel fetch
    const [transcriptResult, videoInfoResult] = await Promise.allSettled([
        getTranscript(args.videoId, args.language),
        getVideoInfo(args.videoId),
    ]);
    if (transcriptResult.status === 'rejected') {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: String(transcriptResult.reason) }) }],
            isError: true,
        };
    }
    const transcript = transcriptResult.value;
    if ('error' in transcript) {
        return {
            content: [{ type: 'text', text: JSON.stringify(transcript) }],
            isError: true,
        };
    }
    const videoInfo = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value : null;
    const chapters = videoInfo?.chapters ?? [];
    const totalSeconds = transcript.segments.length > 0
        ? transcript.segments[transcript.segments.length - 1].offset
        : 0;
    let sections;
    if (chapters.length >= 2) {
        sections = chapters.map((ch, i) => ({
            title: ch.title,
            startTime: ch.timestamp,
            endTime: chapters[i + 1]?.timestamp ?? totalSeconds,
        }));
    }
    else {
        // 3-minute chunks
        const chunkSize = 180;
        sections = [];
        for (let t = 0; t < Math.max(totalSeconds, chunkSize); t += chunkSize) {
            sections.push({
                title: `${Math.floor(t / 60)}:00 – ${Math.floor(Math.min(t + chunkSize, totalSeconds) / 60)}:00`,
                startTime: t,
                endTime: Math.min(t + chunkSize, totalSeconds),
            });
        }
    }
    // Extract key sentences per section
    const extracted = sections.map(sec => {
        const segs = transcript.segments.filter(s => s.offset >= sec.startTime && s.offset < sec.endTime);
        const scored = segs
            .map(s => ({ text: s.text.trim(), score: scoreSegment(s.text), timestamp: s.offset }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, sentencesPerSection)
            .sort((a, b) => a.timestamp - b.timestamp); // restore chronological order
        return {
            sectionTitle: sec.title,
            startTime: sec.startTime,
            endTime: sec.endTime,
            keySentences: scored.map(s => ({
                text: s.text,
                ...(includeTimestamps ? { timestamp: s.timestamp } : {}),
            })),
        };
    }).filter(s => s.keySentences.length > 0);
    // Condensed full text (all extracted sentences, chronological)
    const condensedText = extracted
        .flatMap(s => s.keySentences.map(ks => ks.text))
        .join(' ');
    // Infer topic tags from high-frequency non-stopword terms
    const stopwords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
        'did', 'will', 'would', 'could', 'should', 'may', 'might', 'this', 'that', 'these',
        'those', 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'my', 'your', 'our', 'their',
        'its', 'from', 'by', 'as', 'about', 'up', 'out', 'if', 'then', 'so', 'what', 'which',
        'who', 'when', 'where', 'how', 'not', 'no', 'just', 'like', 'know', 'think', 'really',
    ]);
    const wordFreq = {};
    for (const word of condensedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
        if (word.length > 3 && !stopwords.has(word)) {
            wordFreq[word] = (wordFreq[word] ?? 0) + 1;
        }
    }
    const topics = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([word]) => word);
    // Format duration
    const durationSec = videoInfo
        ? parseInt(String(videoInfo.duration).split(':').reduce((acc, v, i, arr) => String(Number(acc) + Number(v) * Math.pow(60, arr.length - 1 - i)), '0'))
        : 0;
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    videoId: args.videoId,
                    title: videoInfo?.title ?? '',
                    channel: videoInfo?.channel ?? '',
                    published: videoInfo?.published ?? '',
                    duration: videoInfo?.duration ?? '',
                    views: videoInfo?.views ?? '',
                    topics,
                    chapterCount: chapters.length,
                    sectionCount: extracted.length,
                    totalSegments: transcript.segments.length,
                    extractedSegments: extracted.reduce((n, s) => n + s.keySentences.length, 0),
                    compressionRatio: transcript.segments.length > 0
                        ? `${Math.round((1 - extracted.reduce((n, s) => n + s.keySentences.length, 0) / transcript.segments.length) * 100)}%`
                        : '0%',
                    sections: extracted,
                    condensedText,
                }, null, 2),
            }],
    };
}
//# sourceMappingURL=summarize.js.map