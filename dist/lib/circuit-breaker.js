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
import { bus } from './event-bus.js';
const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 60_000; // 1 minute
const SUCCESS_THRESHOLD = 2; // probes needed to close again
class CircuitBreaker {
    state = 'CLOSED';
    failures = 0;
    successes = 0;
    openedAt = 0;
    name;
    constructor(name) {
        this.name = name;
    }
    async call(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.openedAt >= RESET_TIMEOUT_MS) {
                this.state = 'HALF_OPEN';
                this.successes = 0;
            }
            else {
                throw new Error(`[CircuitBreaker:${this.name}] OPEN — YouTube API temporarily unavailable. ` +
                    `Retrying in ${Math.ceil((RESET_TIMEOUT_MS - (Date.now() - this.openedAt)) / 1000)}s.`);
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (err) {
            this.onFailure(err);
            throw err;
        }
    }
    onSuccess() {
        this.failures = 0;
        if (this.state === 'HALF_OPEN') {
            this.successes++;
            if (this.successes >= SUCCESS_THRESHOLD) {
                this.state = 'CLOSED';
                bus.emit('circuit:closed', { name: this.name });
            }
        }
    }
    onFailure(err) {
        this.failures++;
        if (this.state === 'HALF_OPEN' || this.failures >= FAILURE_THRESHOLD) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
            bus.emit('circuit:open', { name: this.name, failures: this.failures, error: String(err) });
        }
    }
    getState() { return this.state; }
    getFailures() { return this.failures; }
}
/** One breaker per logical service boundary. */
export const innertubeBreaker = new CircuitBreaker('innertube');
export const transcriptBreaker = new CircuitBreaker('transcript');
//# sourceMappingURL=circuit-breaker.js.map