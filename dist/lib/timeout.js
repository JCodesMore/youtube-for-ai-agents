/** Wrap any promise with a hard timeout — RRSS: Robust */
export function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms)),
    ]);
}
//# sourceMappingURL=timeout.js.map