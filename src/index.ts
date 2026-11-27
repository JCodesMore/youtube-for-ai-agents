#!/usr/bin/env node
import { VERSION } from './version.js';

const HELP = `YouTube for AI Agents ${VERSION}

Usage: youtube-for-ai-agents [command]

  (no command)   Run the MCP server on stdio (what your AI agent starts)
  doctor         Check that search, video details and transcripts work from this computer
  login          Sign in to YouTube in a separate browser window (optional)
  logout         Forget the saved sign-in
  status         Say whether you're signed in
  config         Show settings. Also: config set <key> <value>, config reset [key], config path
  version        Print the version

Data (settings, sign-in, downloaded tools) lives in ~/.youtube-for-ai-agents,
or wherever YOUTUBE_AI_AGENTS_HOME points.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { configureNetwork } = await import('./lib/network.js');
  await configureNetwork();
  switch (command) {
    case undefined:
    case 'serve':
    case 'mcp': {
      const { serve } = await import('./server.js');
      await serve();
      return -1; // keep running
    }
    case 'doctor': {
      const { runDoctor } = await import('./lib/doctor.js');
      const report = await runDoctor();
      if (rest.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`YouTube for AI Agents ${report.version}\n`);
        for (const c of report.checks) {
          console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(16)} ${c.detail}`);
          if (c.hint) console.log(`      ${''.padEnd(16)} -> ${c.hint}`);
        }
        console.log(report.ok ? '\nEverything works.' : '\nSomething is wrong; see the FAIL lines above.');
      }
      return report.ok ? 0 : 1;
    }
    case 'login': {
      const { login } = await import('./lib/login.js');
      await login((line) => console.log(line));
      return 0;
    }
    case 'logout': {
      const { deleteCookies } = await import('./lib/cookies.js');
      console.log(deleteCookies() ? 'Signed out. Tools now browse anonymously.' : 'Already anonymous; nothing to remove.');
      return 0;
    }
    case 'status': {
      const { hasCookies, cookieSource } = await import('./lib/cookies.js');
      console.log(hasCookies() ? `Signed in (${cookieSource()})` : 'Anonymous (not signed in)');
      return 0;
    }
    case 'config': {
      const { runConfig } = await import('./lib/config-cli.js');
      return runConfig(rest);
    }
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => { if (code >= 0) process.exit(code); },
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
