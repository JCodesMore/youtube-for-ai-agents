/**
 * Diagnostics go to stderr only: stdout carries the MCP protocol, and anything else written
 * there corrupts it. Set YOUTUBE_AI_AGENTS_DEBUG=1 to see them.
 */
const DEBUG = Boolean(process.env.YOUTUBE_AI_AGENTS_DEBUG);

export function debug(...parts: unknown[]): void {
  if (DEBUG) process.stderr.write(`[youtube] ${parts.map(String).join(' ')}\n`);
}

export function warn(...parts: unknown[]): void {
  process.stderr.write(`[youtube] ${parts.map(String).join(' ')}\n`);
}
