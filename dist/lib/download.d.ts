import type { DownloadQuality, DownloadType } from '../config.js';
export interface DownloadOptions {
    quality?: DownloadQuality;
    type?: DownloadType;
    format?: string;
    outputPath?: string;
    force?: boolean;
}
export interface DownloadResult {
    filePath: string;
    title: string;
    duration: string;
    durationSeconds: number;
    fileSize: string;
    format: string;
}
export interface DurationWarning {
    warning: string;
    confirmed: false;
    title: string;
    duration: string;
    durationSeconds: number;
}
export interface ClipDefinition {
    startTime: string;
    endTime: string;
    label?: string;
}
export interface ClipResult {
    filePath: string;
    label: string;
    startTime: string;
    endTime: string;
    clipDuration: string;
    fileSize: string;
}
export interface HighlightReelResult {
    highlightReel: {
        filePath: string;
        duration: string;
        fileSize: string;
    };
    clips: ClipResult[];
}
export declare function parseTimestamp(input: string): number;
export declare function formatSeconds(seconds: number): string;
export declare function formatFileSize(bytes: number): string;
export declare function concatClips(clipPaths: string[], outputPath: string, options?: {
    reencode?: boolean;
}): Promise<void>;
export declare function downloadVideo(videoId: string, options?: DownloadOptions): Promise<DownloadResult | DurationWarning>;
export declare function downloadToTemp(videoId: string, quality?: DownloadQuality, force?: boolean): Promise<{
    tempPath: string;
    title: string;
    durationSeconds: number;
} | DurationWarning>;
export declare function clipVideo(inputPath: string, outputPath: string, startSeconds: number, endSeconds: number, accurate?: boolean): Promise<void>;
export declare function createClips(videoId: string, clips: ClipDefinition[], options?: {
    outputDir?: string;
    quality?: DownloadQuality;
    accurate?: boolean;
    force?: boolean;
    highlightReel?: boolean;
}): Promise<HighlightReelResult | ClipResult[] | DurationWarning>;
//# sourceMappingURL=download.d.ts.map