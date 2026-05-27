export declare function hasCookies(): boolean;
export declare function loadCookies(): string | null;
export declare function deleteCookies(): boolean;
export declare function saveCookies(cookieString: string): void;
export interface CookieValidation {
    valid: boolean;
    present: string[];
    missing: string[];
}
export declare function validateCookies(cookieString: string): CookieValidation;
//# sourceMappingURL=cookies.d.ts.map