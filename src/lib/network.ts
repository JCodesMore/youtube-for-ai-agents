import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { getConfig } from './user-config.js';
import { debug } from './log.js';

/**
 * Optional proxy for every request to YouTube, for networks YouTube rate-limits or blocks
 * (cloud servers, some VPNs). Set YOUTUBE_AI_AGENTS_PROXY, or the "network.proxy" setting, to
 * an http(s) proxy URL such as http://user:pass@host:port.
 */
export function proxyUrl(): string | null {
  return process.env.YOUTUBE_AI_AGENTS_PROXY || getConfig().network.proxy || null;
}

let configured = false;

export function configureNetwork(): void {
  if (configured) return;
  configured = true;
  const proxy = proxyUrl();
  if (!proxy) return;
  // Node's built-in fetch, which youtubei.js and the transcript library use, honours undici's
  // global dispatcher.
  setGlobalDispatcher(new ProxyAgent(proxy));
  debug(`routing YouTube requests through proxy ${proxy.replace(/\/\/[^@]*@/, '//***@')}`);
}
