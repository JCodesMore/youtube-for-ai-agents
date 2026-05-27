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
export type EventTopic = 'video:new' | 'playlist:added' | 'playlist:removed' | 'playlist:reordered' | 'cache:hit' | 'cache:miss' | 'cache:evicted' | 'tool:call' | 'tool:error' | 'rate:limited' | 'circuit:open' | 'circuit:closed';
export interface BusEvent<T = unknown> {
    readonly topic: EventTopic;
    readonly payload: T;
    readonly ts: number;
    readonly id: string;
}
export interface BusAdapter {
    publish(topic: string, payload: unknown): Promise<void>;
}
type Handler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;
declare class EventBus {
    private readonly handlers;
    private readonly history;
    private readonly historySize;
    private adapters;
    private counter;
    constructor(historySize?: number);
    /** Subscribe to a topic. Returns an unsubscribe function. */
    on<T>(topic: EventTopic, handler: Handler<T>): () => void;
    /** Subscribe to every topic. */
    onAll(handler: Handler): () => void;
    /** Emit an event to all subscribers on that topic + wildcard listeners. */
    emit<T>(topic: EventTopic, payload: T): void;
    /** Replay buffered events for a topic to a new handler (catch-up on missed events). */
    replay(topic: EventTopic, handler: Handler, since?: number): void;
    /** Get recent history, optionally filtered by topic. */
    getHistory(topic?: EventTopic, limit?: number): BusEvent[];
    /** Stats for cache-admin tool and dashboard. */
    stats(): Record<EventTopic | string, number>;
    /** Plug in a Kafka/Redis/custom adapter — zero code change in tool layer. */
    addAdapter(adapter: BusAdapter): void;
}
/** Singleton bus — import and use anywhere in the process. */
export declare const bus: EventBus;
export {};
//# sourceMappingURL=event-bus.d.ts.map