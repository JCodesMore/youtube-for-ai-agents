import { fetchTranscript } from 'youtube-transcript-plus';
import { getConfig } from './user-config.js';
import { transcriptDiskCache } from './disk-cache.js';
import { bus } from './event-bus.js';
import { transcriptBreaker } from './circuit-breaker.js';
export function cleanTranscriptText(text) {
    return text
        .replace(/\[.*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#\d+;/g, (match) => {
        const code = parseInt(match.slice(2, -1), 10);
        return String.fromCharCode(code);
    });
}
/** Exponential back-off retry — only for transient/rate-limit errors. RRSS: Robust + Reliable */
async function withRetry(fn, retries = 3, baseDelayMs = 1500) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            const msg = err instanceof Error ? err.message.toLowerCase() : '';
            const isTransient = msg.includes('too many') || msg.includes('rate') || msg.includes('429');
            if (!isTransient || attempt === retries - 1)
                throw err;
            const delay = baseDelayMs * Math.pow(2, attempt);
            bus.emit('rate:limited', { attempt: attempt + 1, retryInMs: delay });
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}
export async function getTranscript(videoId, language) {
    try {
        const config = getConfig();
        const lang = language ?? config.transcript.defaultLanguage;
        const cacheKey = `${videoId}_${lang}`;
        // 1. Disk cache hit?
        const diskHit = transcriptDiskCache.get(cacheKey);
        if (diskHit)
            return diskHit;
        // 2. Fetch with retry + circuit breaker
        const rawSegments = await transcriptBreaker.call(() => withRetry(() => fetchTranscript(videoId, { lang })));
        const segments = rawSegments
            .slice(0, config.transcript.maxSegments)
            .map(seg => ({
            text: decodeHtmlEntities(seg.text),
            offset: seg.offset,
            duration: seg.duration,
        }));
        const joinedText = segments.map(s => s.text).join(' ');
        const fullText = config.transcript.cleanupEnabled
            ? cleanTranscriptText(joinedText)
            : joinedText;
        const result = { segments, fullText, language: lang };
        // 3. Persist to disk for future restarts
        transcriptDiskCache.set(cacheKey, result);
        return result;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('disabled')) {
            return { error: `Transcripts are disabled for video ${videoId}.` };
        }
        if (message.includes('unavailable') || message.includes('Unavailable')) {
            return { error: `Video ${videoId} is unavailable — it may have been removed or is private.` };
        }
        if (message.includes('language') || message.includes('Language')) {
            // Auto-retry without a language constraint — return whatever YouTube has
            if (language !== undefined) {
                const fallback = await getTranscript(videoId, undefined);
                if (!('error' in fallback)) {
                    return {
                        ...fallback,
                        note: `Requested language "${language}" not available. Returned transcript in detected language: ${fallback.language}.`,
                    };
                }
            }
            return { error: `Transcript not available in requested language for video ${videoId}. Try without specifying a language to get auto-detected captions.` };
        }
        if (message.includes('Too many')) {
            return { error: `Rate limited by YouTube. Wait a moment and try again.` };
        }
        return { error: `Could not fetch transcript for video ${videoId}: ${message}` };
    }
}
//# sourceMappingURL=transcript.js.map