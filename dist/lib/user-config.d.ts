import { type ResolvedConfig } from '../config.js';
export declare function getConfigPath(): string;
export type UserOverrides = {
    search?: Partial<ResolvedConfig['search']>;
    transcript?: Partial<ResolvedConfig['transcript']>;
    channel?: Partial<ResolvedConfig['channel']>;
    playlist?: Partial<ResolvedConfig['playlist']>;
    download?: Partial<ResolvedConfig['download']>;
    innertube?: Partial<ResolvedConfig['innertube']>;
};
export declare function loadUserConfig(): UserOverrides;
export declare function saveUserConfig(overrides: UserOverrides): void;
export declare function deleteUserConfig(): boolean;
export declare function getConfig(): ResolvedConfig;
export declare function resetConfigCache(): void;
//# sourceMappingURL=user-config.d.ts.map