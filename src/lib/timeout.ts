/** Wrap any promise with a hard timeout — RRSS: Robust */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}
