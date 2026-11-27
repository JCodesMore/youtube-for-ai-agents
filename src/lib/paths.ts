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
 * Where older versions of the Claude Code plugin stored settings and cookies, read as a fallback
 * so upgrading users keep their sign-in. (Dotfiles in the working folder are not read: any
 * project could plant one.)
 */
export function legacyFiles(name: string): string[] {
  return process.env.CLAUDE_PLUGIN_DATA ? [join(process.env.CLAUDE_PLUGIN_DATA, name)] : [];
}
