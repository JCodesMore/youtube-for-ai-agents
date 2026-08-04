/**
 * Circuit Breaker — RRSS: Reliable + Resistant
 *
 * Prevents cascading failures when YouTube's API is repeatedly returning
 * errors. After FAILURE_THRESHOLD consecutive failures it "opens" and
 * fast-fails all calls for RESET_TIMEOUT_MS, then enters half-open to
 * probe recovery. Emits events on the bus so the dashboard and monitors
 * can observe and react.
 *
 * States:
 *   CLOSED   — normal operation, failures counted
 *   OPEN     — fast-fail all calls, waiting for reset timeout
 *   HALF_OPEN — one probe call allowed, success → CLOSED, fail → OPEN
 *
 * ARM:
 *   Retention  — users don't see hanging requests during YouTube outages
 *   Monetize   — SLA-grade reliability signal for enterprise deployments
 */
type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
declare class CircuitBreaker {
    private state;
    private failures;
    private successes;
    private openedAt;
    private readonly name;
    constructor(name: string);
    call<T>(fn: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getState(): State;
    getFailures(): number;
}
/** One breaker per logical service boundary. */
export declare const innertubeBreaker: CircuitBreaker;
export declare const transcriptBreaker: CircuitBreaker;
export {};
//# sourceMappingURL=circuit-breaker.d.ts.map