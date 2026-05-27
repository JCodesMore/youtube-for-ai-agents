/**
 * KafCa Event Bus — Kafka-inspired typed in-process pub/sub.
 *
 * Design principles (RRSS):
 *   Robust     — typed topics, compile-time safety, no silent drops
 *   Reliable   — ring-buffer history; late subscribers can replay missed events
 *   Scalable   — synchronous fan-out + async handler support; zero external deps
 *   Secure     — immutable event payloads (Object.freeze), no eval/dynamic dispatch
 *
 * ARM value:
 *   Adoption   — monitor scripts emit events here → easy webhook/Slack integration
 *   Retention  — power users replay missed events from the buffer without re-fetching
 *   Monetize   — enterprise teams pipe events to Kafka/Redis Streams via the adapter
 *               interface without changing tool code
 *
 * Usage:
 *   import { bus } from './event-bus.js';
 *   bus.on('video:new', e => console.log(e));
 *   bus.emit('video:new', { channel: '@mkbhd', videoId: '...' });
 *
 * Kafka adapter (optional — bring your own KafkaJS/ioredis):
 *   bus.addAdapter({ publish: async (topic, payload) => kafka.send({ topic, messages: [{ value: JSON.stringify(payload) }] }) });
 */

export type EventTopic =
  | 'video:new'          // new video detected on a channel
  | 'playlist:added'     // video added to a playlist
  | 'playlist:removed'   // video removed from a playlist
  | 'playlist:reordered' // video position shifted
  | 'cache:hit'          // in-memory or disk cache hit
  | 'cache:miss'         // cache miss — fetching from network
  | 'cache:evicted'      // entry evicted from in-memory cache
  | 'tool:call'          // any MCP tool was called
  | 'tool:error'         // a tool returned an error
  | 'rate:limited'       // YouTube rate-limited us
  | 'circuit:open'       // circuit breaker opened (too many failures)
  | 'circuit:closed';    // circuit breaker recovered

export interface BusEvent<T = unknown> {
  readonly topic: EventTopic;
  readonly payload: T;
  readonly ts: number;         // epoch ms
  readonly id: string;         // monotonic counter as string
}

export interface BusAdapter {
  publish(topic: string, payload: unknown): Promise<void>;
}

type Handler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;

class EventBus {
  private readonly handlers = new Map<EventTopic, Set<Handler>>();
  private readonly history: BusEvent[] = [];
  private readonly historySize: number;
  private adapters: BusAdapter[] = [];
  private counter = 0;

  constructor(historySize = 500) {
    this.historySize = historySize;
  }

  /** Subscribe to a topic. Returns an unsubscribe function. */
  on<T>(topic: EventTopic, handler: Handler<T>): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic)!.add(handler as Handler);
    return () => this.handlers.get(topic)?.delete(handler as Handler);
  }

  /** Subscribe to every topic. */
  onAll(handler: Handler): () => void {
    const unsubs = (Object.keys({}) as EventTopic[]);
    // Store as wildcard via a special key trick
    const ALL = '__all__' as EventTopic;
    if (!this.handlers.has(ALL)) this.handlers.set(ALL, new Set());
    this.handlers.get(ALL)!.add(handler);
    return () => this.handlers.get(ALL)?.delete(handler);
  }

  /** Emit an event to all subscribers on that topic + wildcard listeners. */
  emit<T>(topic: EventTopic, payload: T): void {
    const event: BusEvent<T> = Object.freeze({
      topic,
      payload: typeof payload === 'object' && payload !== null
        ? Object.freeze({ ...payload }) as T
        : payload,
      ts: Date.now(),
      id: String(++this.counter),
    });

    // Ring buffer
    this.history.push(event as BusEvent);
    if (this.history.length > this.historySize) this.history.shift();

    // Fan-out: topic handlers
    const topicHandlers = this.handlers.get(topic);
    if (topicHandlers) {
      for (const h of topicHandlers) {
        try { void h(event as BusEvent); } catch { /* handler errors must not break the bus */ }
      }
    }

    // Fan-out: wildcard handlers
    const wildcardHandlers = this.handlers.get('__all__' as EventTopic);
    if (wildcardHandlers) {
      for (const h of wildcardHandlers) {
        try { void h(event as BusEvent); } catch { /* same */ }
      }
    }

    // External adapters (Kafka, Redis Streams, etc.)
    for (const adapter of this.adapters) {
      adapter.publish(topic, event.payload).catch(() => { /* non-fatal */ });
    }
  }

  /** Replay buffered events for a topic to a new handler (catch-up on missed events). */
  replay(topic: EventTopic, handler: Handler, since = 0): void {
    const relevant = this.history.filter(e => e.topic === topic && e.ts >= since);
    for (const e of relevant) {
      try { void handler(e); } catch { /* same */ }
    }
  }

  /** Get recent history, optionally filtered by topic. */
  getHistory(topic?: EventTopic, limit = 100): BusEvent[] {
    const filtered = topic ? this.history.filter(e => e.topic === topic) : this.history;
    return filtered.slice(-limit);
  }

  /** Stats for cache-admin tool and dashboard. */
  stats(): Record<EventTopic | string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.history) counts[e.topic] = (counts[e.topic] ?? 0) + 1;
    return counts;
  }

  /** Plug in a Kafka/Redis/custom adapter — zero code change in tool layer. */
  addAdapter(adapter: BusAdapter): void {
    this.adapters.push(adapter);
  }
}

/** Singleton bus — import and use anywhere in the process. */
export const bus = new EventBus(500);
