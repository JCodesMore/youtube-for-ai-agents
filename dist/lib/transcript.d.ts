export interface TranscriptSegment {
    text: string;
    offset: number;
    duration: number;
}
export interface TranscriptResult {
    segments: TranscriptSegment[];
    fullText: string;
    language: string;
}
export interface TranscriptError {
    error: string;
}
export declare function cleanTranscriptText(text: string): string;
export declare function getTranscript(videoId: string, language?: string): Promise<TranscriptResult | TranscriptError>;
//# sourceMappingURL=transcript.d.ts.map