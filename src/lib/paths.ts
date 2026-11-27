import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Folder name under the user's home directory that holds settings, sign-in cookies and tool binaries. */
export const DATA_DIR_NAME = '.youtube-for-ai-agents';

/** Environment variable that moves the data folder somewhere else. */
export const DATA_DIR_ENV = 'YOUTUBE_AI_AGENTS_HOME';

/**
 * One data folder for everything, independent of the working directory and of which agent
 * launched us. The MCP server, the CLI and the setup skill all resolve the same path, so a
 * sign-in done from a terminal is seen by the server and the other way round.
 */
export function getDataDir(): string {
  return process.env[DATA_DIR_ENV] || join(homedir(), DATA_DIR_NAME);
}

export function ensureDataDir(sub?: string): string {
  const dir = sub ? join(getDataDir(), sub) : getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataFile(name: string): string {
  return join(getDataDir(), name);
}

/**
 * Places older versions stored settings and cookies (plugin data folder, or the working directory
 * as a dotfile). Read once as a fallback so upgrading users keep their sign-in.
 */
export function legacyFiles(name: string): string[] {
  const candidates: string[] = [];
  if (process.env.CLAUDE_PLUGIN_DATA) candidates.push(join(process.env.CLAUDE_PLUGIN_DATA, name));
  candidates.push(join(process.cwd(), `.${name}`));
  return candidates;
}
