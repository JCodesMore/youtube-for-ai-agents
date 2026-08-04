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
const RESET_TIMEOUT_MS  = 60_000;   // 1 minute
const SUCCESS_THRESHOLD = 2;        // probes needed to close again

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: State = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= RESET_TIMEOUT_MS) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new Error(
          `[CircuitBreaker:${this.name}] OPEN — YouTube API temporarily unavailable. ` +
          `Retrying in ${Math.ceil((RESET_TIMEOUT_MS - (Date.now() - this.openedAt)) / 1000)}s.`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= SUCCESS_THRESHOLD) {
        this.state = 'CLOSED';
        bus.emit('circuit:closed', { name: this.name });
      }
    }
  }

  private onFailure(err: unknown): void {
    this.failures++;
    if (this.state === 'HALF_OPEN' || this.failures >= FAILURE_THRESHOLD) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      bus.emit('circuit:open', { name: this.name, failures: this.failures, error: String(err) });
    }
  }

  getState(): State { return this.state; }
  getFailures(): number { return this.failures; }
}

/** One breaker per logical service boundary. */
export const innertubeBreaker = new CircuitBreaker('innertube');
export const transcriptBreaker = new CircuitBreaker('transcript');
