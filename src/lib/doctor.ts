import { getDataDir } from './paths.js';
import { cookieSource, hasCookies } from './cookies.js';
import { getConfigPath } from './user-config.js';
import { locateBinary } from './binaries.js';
import { getInstance, search, getVideoInfo } from './innertube.js';
import { getTranscript } from './transcript.js';
import { classify, hintFor } from './errors.js';
import { VERSION } from '../version.js';

/** A short, well-known video with human captions, used as a health check. */
const PROBE_VIDEO = 'jNQXAC9IVRw';
const MIN_NODE_MAJOR = 20;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

async function probe(name: string, run: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, detail: `${detail} (${Date.now() - started} ms)` };
  } catch (error) {
    const kind = classify(error);
    return { name, ok: false, detail: `${kind}: ${(error as Error).message.slice(0, 300)}`, hint: hintFor(kind) };
  }
}

export async function runDoctor(): Promise<{ version: string; ok: boolean; checks: Check[] }> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js',
    ok: major >= MIN_NODE_MAJOR,
    detail: `${process.version} on ${process.platform}-${process.arch}`,
    hint: major >= MIN_NODE_MAJOR ? undefined : `Node ${MIN_NODE_MAJOR} or newer is needed. Install the LTS version from https://nodejs.org`,
  });
  checks.push({ name: 'Data folder', ok: true, detail: getDataDir() });
  checks.push({
    name: 'Sign-in',
    ok: true,
    detail: hasCookies() ? `signed in (${cookieSource()})` : 'anonymous: works for everything; signing in helps when YouTube rate-limits',
  });
  checks.push({ name: 'Settings', ok: true, detail: getConfigPath() });

  checks.push(await probe('YouTube session', async () => `${(await getInstance()).mode}`));
  checks.push(await probe('Search', async () => {
    const { results } = await search('youtube', 1, 'video');
    if (!results.length) throw new Error('search returned no results');
    return `ok, first result "${'title' in results[0] ? results[0].title : ''}"`;
  }));
  checks.push(await probe('Video details', async () => `ok, "${(await getVideoInfo(PROBE_VIDEO)).title}"`));
  checks.push(await probe('Transcript', async () => {
    const t = await getTranscript(PROBE_VIDEO);
    return `ok, ${t.segments.length} lines via ${t.source}`;
  }));

  for (const name of ['yt-dlp', 'ffmpeg'] as const) {
    const b = locateBinary(name);
    checks.push({
      name,
      ok: true,
      detail: b.path ? `${b.source}: ${b.path}` : 'not installed yet; downloaded automatically the first time you download or clip',
    });
  }

  return { version: VERSION, ok: checks.every((c) => c.ok), checks };
}
