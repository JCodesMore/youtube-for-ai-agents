import { getConfig } from './user-config.js';
import { debug, warn } from './log.js';

/**
 * Optional proxy for every request to YouTube, for networks YouTube rate-limits or blocks
 * (cloud servers, some VPNs). Set YOUTUBE_AI_AGENTS_PROXY, or the "network.proxy" setting, to
 * an http(s) proxy URL such as http://user:pass@host:port.
 */
export function proxyUrl(): string | null {
  return process.env.YOUTUBE_AI_AGENTS_PROXY || getConfig().network.proxy || null;
}

let configured = false;

export async function configureNetwork(): Promise<void> {
  if (configured) return;
  configured = true;
  const proxy = proxyUrl();
  if (!proxy) return;
  // undici is loaded only when a proxy is set: its top-level code needs a newer Node than the
  // rest of the server, and loading it eagerly would stop the server starting on Node 20.
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    // Node's built-in fetch, which youtubei.js and the transcript library use, honours undici's
    // global dispatcher.
    setGlobalDispatcher(new ProxyAgent(proxy));
    debug(`routing YouTube requests through proxy ${proxy.replace(/\/\/[^@]*@/, '//***@')}`);
  } catch (e) {
    warn(`The proxy setting needs Node.js 22.19 or newer (this is ${process.version}); continuing without it. ${(e as Error).message}`);
  }
}
