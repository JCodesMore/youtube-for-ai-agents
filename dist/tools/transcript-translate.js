/**
 * youtube_transcript_translate — translate a video's transcript to any language
 * via a LibreTranslate-compatible engine (free, self-hostable).
 *
 * Preserves per-segment timestamps by re-splitting the translated chunk on
 * the paragraph-break delimiter that segments were joined with; falls back
 * to proportional character-length distribution when the delimiter is lost
 * in translation. Bounded-concurrency chunk fetch, hard per-request timeout,
 * honest per-chunk failure isolation.
 *
 * ARM:
 *   Adoption  — unlocks ~70% of YouTube (non-English) for any AI agent.
 *   Retention — self-hostable engine means no rate-limit surprise; users invest
 *               in a local LibreTranslate container and never leave.
 *   Monetize  — creator use case: translate own transcripts for multilingual
 *               subtitles / blog reposts.
 */
import { z } from 'zod';
import { getTranscript } from '../lib/transcript.js';
import { getVideoInfo } from '../lib/innertube.js';
import { getConfig } from '../lib/user-config.js';
import { DEFAULTS } from '../config.js';
import { bus } from '../lib/event-bus.js';
const CHUNK_DELIMITER = '\n\n⁣\n\n'; // invisible separator + blank lines
export const transcriptTranslateInputSchema = {
    videoId: z.string().describe('YouTube video ID'),
    targetLanguage: z.string().optional()
        .describe(`Target language code, e.g. "es", "fr", "de", "ja" (default: "${DEFAULTS.translate.defaultTarget}")`),
    sourceLanguage: z.string().optional()
        .describe('Source language code (default: "auto" — LibreTranslate auto-detects)'),
    engineUrl: z.string().url().optional()
        .describe(`LibreTranslate-compatible base URL (default: "${DEFAULTS.translate.engineUrl}"). Self-host at http://localhost:5000 for unlimited use.`),
    apiKey: z.string().optional()
        .describe('Optional API key if the engine requires one. Falls back to config or env LIBRETRANSLATE_API_KEY.'),
    format: z.enum(['text', 'segments', 'both']).optional()
        .describe('Response shape: "text" (translated fullText only), "segments" (timestamped array), or "both" (default)'),
    startTime: z.number().optional().describe('Only translate segments at or after this time (seconds)'),
    endTime: z.number().optional().describe('Only translate segments before this time (seconds)'),
    maxSegments: z.number().optional().describe('Cap segments to translate (default: entire transcript)'),
};
function buildChunks(segments, chunkChars) {
    const chunks = [];
    let current = [];
    let currentLen = 0;
    for (const seg of segments) {
        const addedLen = seg.text.length + CHUNK_DELIMITER.length;
        if (currentLen + addedLen > chunkChars && current.length > 0) {
            chunks.push(current);
            current = [];
            currentLen = 0;
        }
        current.push(seg);
        currentLen += addedLen;
    }
    if (current.length > 0)
        chunks.push(current);
    return chunks;
}
async function translateChunk(text, engineUrl, source, target, apiKey, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const body = { q: text, source, target, format: 'text' };
        if (apiKey)
            body.api_key = apiKey;
        const res = await fetch(`${engineUrl.replace(/\/$/, '')}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }
        const json = (await res.json());
        if (json.error)
            throw new Error(json.error);
        if (typeof json.translatedText !== 'string')
            throw new Error('missing translatedText in response');
        return json.translatedText;
    }
    finally {
        clearTimeout(timer);
    }
}
function distributeTranslatedText(originalSegments, translatedChunk) {
    const parts = translatedChunk.split(CHUNK_DELIMITER);
    if (parts.length === originalSegments.length) {
        return originalSegments.map((seg, i) => ({
            text: parts[i].trim(),
            offset: seg.offset,
            duration: seg.duration,
        }));
    }
    const totalOriginalChars = originalSegments.reduce((n, s) => n + s.text.length, 0) || 1;
    let cursor = 0;
    return originalSegments.map((seg, i) => {
        const share = seg.text.length / totalOriginalChars;
        const take = i === originalSegments.length - 1
            ? translatedChunk.length - cursor
            : Math.round(translatedChunk.length * share);
        const slice = translatedChunk.slice(cursor, cursor + take).trim();
        cursor += take;
        return { text: slice, offset: seg.offset, duration: seg.duration };
    });
}
async function pooledMap(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length)
                return;
            try {
                results[i] = { ok: true, value: await worker(items[i], i) };
            }
            catch (err) {
                results[i] = { ok: false, error: err instanceof Error ? err.message : String(err) };
            }
        }
    });
    await Promise.all(runners);
    return results;
}
export async function handleTranscriptTranslate(args) {
    const config = getConfig();
    const target = args.targetLanguage ?? config.translate.defaultTarget;
    const source = args.sourceLanguage ?? 'auto';
    const engineUrl = args.engineUrl ?? config.translate.engineUrl;
    const apiKey = args.apiKey ?? config.translate.apiKey ?? process.env.LIBRETRANSLATE_API_KEY ?? '';
    const format = args.format ?? 'both';
    const [transcriptResult, videoInfoResult] = await Promise.allSettled([
        getTranscript(args.videoId),
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
    let segments = transcript.segments;
    if (args.startTime !== undefined)
        segments = segments.filter(s => s.offset >= args.startTime);
    if (args.endTime !== undefined)
        segments = segments.filter(s => s.offset < args.endTime);
    if (args.maxSegments !== undefined)
        segments = segments.slice(0, args.maxSegments);
    if (segments.length === 0) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No segments to translate after filtering.' }) }],
            isError: true,
        };
    }
    if (source !== 'auto' && source === target) {
        return {
            content: [{ type: 'text', text: JSON.stringify({
                        videoId: args.videoId,
                        sourceLanguage: source,
                        targetLanguage: target,
                        note: 'Source and target are the same; returning transcript unchanged.',
                        segments,
                        fullText: transcript.fullText,
                    }, null, 2) }],
        };
    }
    const chunks = buildChunks(segments, config.translate.chunkChars);
    const chunkTexts = chunks.map(c => c.map(s => s.text).join(CHUNK_DELIMITER));
    const results = await pooledMap(chunkTexts, config.translate.concurrency, (text) => translateChunk(text, engineUrl, source, target, apiKey || undefined, config.translate.timeoutMs));
    const translatedSegments = [];
    const failures = [];
    let firstSegmentIndex = 0;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const outcome = results[i];
        if (outcome.ok) {
            translatedSegments.push(...distributeTranslatedText(chunk, outcome.value));
        }
        else {
            bus.emit('tool:error', { tool: 'youtube_transcript_translate', chunk: i, error: outcome.error });
            failures.push({
                chunkIndex: i,
                segmentRange: [firstSegmentIndex, firstSegmentIndex + chunk.length - 1],
                error: outcome.error,
            });
            translatedSegments.push(...chunk);
        }
        firstSegmentIndex += chunk.length;
    }
    const title = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value.title : '';
    const channel = videoInfoResult.status === 'fulfilled' ? videoInfoResult.value.channel : '';
    const translatedFullText = translatedSegments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    const response = {
        videoId: args.videoId,
        title,
        channel,
        sourceLanguage: source,
        targetLanguage: target,
        engine: engineUrl,
        segmentCount: translatedSegments.length,
        chunkCount: chunks.length,
        successfulChunks: chunks.length - failures.length,
    };
    if (failures.length > 0) {
        response.partialFailures = failures;
        response.note = `${failures.length}/${chunks.length} chunks failed; failed segments returned in their original language.`;
    }
    if (format === 'segments' || format === 'both')
        response.segments = translatedSegments;
    if (format === 'text' || format === 'both')
        response.fullText = translatedFullText;
    return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        ...(failures.length === chunks.length ? { isError: true } : {}),
    };
}
//# sourceMappingURL=transcript-translate.js.map