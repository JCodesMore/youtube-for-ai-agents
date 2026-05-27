#!/usr/bin/env node

/**
 * YouTube cookie extraction via Chrome CDP with a dedicated debug profile.
 *
 * Uses a separate Chrome profile at ~/.youtube/chrome-profile/ so that:
 *   - No conflict with Chrome 136+ debug port restrictions
 *   - User's main Chrome stays untouched and can run simultaneously
 *   - Login persists across extractions (one-time YouTube login)
 *
 * Flow:
 *   1. Try connecting to an existing Chrome debug port (backwards-compatible)
 *   2. If unavailable, launch Chrome with dedicated profile + debug port
 *   3. Check for YouTube login — if not logged in, exit with code 3
 *   4. Extract cookies via CDP, validate, and save
 *
 * Exit codes:
 *   0 — Success (cookies extracted and saved)
 *   1 — Fatal error (Chrome not found, connection failed, etc.)
 *   3 — Login required (Chrome opened but user not logged into YouTube)
 *
 * Usage:
 *   node scripts/extract-cookies.mjs           # extract cookies
 *   node scripts/extract-cookies.mjs --status   # check if cookies exist
 *   node scripts/extract-cookies.mjs --reset    # remove saved cookies
 */

import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const CONNECT_TIMEOUT_MS = 5000;
const LAUNCH_WAIT_MS = 3000;
const MAX_LAUNCH_RETRIES = 10;

const PROFILE_DIR = join(homedir(), '.youtube', 'chrome-profile');

const COOKIE_URLS = [
  'https://www.youtube.com',
  'https://accounts.google.com',
  'https://www.google.com',
];

const AUTH_COOKIES = [
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID',
  '__Secure-1PSID', '__Secure-3PSID',
  'LOGIN_INFO',
];

// --- Output path ---

function getOutputPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (dataDir) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    return join(dataDir, 'cookies.json');
  }
  return join(process.cwd(), '.cookies.json');
}

// --- Reset ---

function resetCookies() {
  const outputPath = getOutputPath();
  if (!existsSync(outputPath)) {
    console.log('No cookies to remove — already in anonymous mode.');
    return;
  }
  try {
    unlinkSync(outputPath);
    console.log('Cookies removed. Switched to anonymous mode.');
  } catch {
    console.error('Failed to remove cookie file.');
    process.exit(1);
  }
}

// --- Status check ---

function checkStatus() {
  const outputPath = getOutputPath();
  if (!existsSync(outputPath)) {
    console.log('STATUS: No cookies configured.');
    console.log('Run this script without --status to set up authentication.');
    return;
  }
  try {
    const content = JSON.parse(readFileSync(outputPath, 'utf8'));
    if (content.cookie_string && content.cookie_string.length > 0) {
      const names = content.cookie_string.split(';').map(c => c.trim().split('=')[0]);
      const authPresent = AUTH_COOKIES.filter(c => names.includes(c));
      console.log(`STATUS: Authenticated. ${authPresent.length}/${AUTH_COOKIES.length} core auth cookies present.`);
      return;
    }
  } catch { /* fall through */ }
  console.log('STATUS: Cookie file exists but appears invalid.');
}

// --- Chrome detection ---

function findChrome() {
  const paths = [];

  if (process.platform === 'win32') {
    paths.push(
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    paths.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    paths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    );
  }

  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

// --- Port check ---

async function checkPort(host, port) {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Chrome launcher ---

async function launchChrome(chromePath) {
  if (!existsSync(PROFILE_DIR)) {
    mkdirSync(PROFILE_DIR, { recursive: true });
  }

  console.log('Launching Chrome with dedicated debug profile...');
  console.log(`  Profile: ${PROFILE_DIR}`);

  const child = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  for (let i = 0; i < MAX_LAUNCH_RETRIES; i++) {
    console.log(`  Waiting for Chrome (attempt ${i + 1}/${MAX_LAUNCH_RETRIES})...`);
    await sleep(LAUNCH_WAIT_MS);

    const portReady = await checkPort(CDP_HOST, CDP_PORT);
    if (portReady) {
      console.log('  Chrome debug port is ready.');
      return true;
    }
  }

  return false;
}

// --- Cookie extraction ---

async function extractCookies(browser) {
  const pages = await browser.pages();
  let ytPage = pages.find(p => p.url().includes('youtube.com'));

  if (!ytPage) {
    console.log('Navigating to YouTube...');
    ytPage = pages[0] || await browser.newPage();
    await ytPage.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
  }

  const client = await ytPage.createCDPSession();
  const { cookies } = await client.send('Network.getCookies', { urls: COOKIE_URLS });
  console.log(`Extracted ${cookies.length} cookies total.`);

  return cookies;
}

function checkLoginStatus(cookies) {
  const missing = [];
  for (const name of AUTH_COOKIES) {
    if (!cookies.find(c => c.name === name)) {
      missing.push(name);
    }
  }
  return { loggedIn: missing.length === 0, missing };
}

// --- Main ---

async function main() {
  if (process.argv.includes('--status')) {
    checkStatus();
    return;
  }

  if (process.argv.includes('--reset')) {
    resetCookies();
    return;
  }

  console.log('=== YouTube Cookie Extraction ===\n');

  let browser;

  // Step 1: Try connecting to existing debug port
  const portOpen = await checkPort(CDP_HOST, CDP_PORT);

  if (portOpen) {
    console.log(`Existing debug port detected at ${CDP_HOST}:${CDP_PORT}`);
    try {
      browser = await puppeteer.connect({
        browserURL: `http://${CDP_HOST}:${CDP_PORT}`,
        defaultViewport: null,
      });
      console.log('Connected to Chrome.\n');
    } catch (error) {
      console.error(`Port open but connection failed: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Step 2: Launch Chrome with dedicated profile
    const chromePath = findChrome();
    if (!chromePath) {
      console.error('Could not find Chrome installation.');
      console.error('Install Google Chrome or set the chrome path manually.');
      process.exit(1);
    }

    const launched = await launchChrome(chromePath);
    if (!launched) {
      console.error('\nChrome failed to start with debug port.');
      console.error(`Tried: "${chromePath}" --remote-debugging-port=${CDP_PORT} --user-data-dir=${PROFILE_DIR}`);
      process.exit(1);
    }

    try {
      browser = await puppeteer.connect({
        browserURL: `http://${CDP_HOST}:${CDP_PORT}`,
        defaultViewport: null,
      });
      console.log('Connected to Chrome.\n');
    } catch (error) {
      console.error(`Failed to connect after launch: ${error.message}`);
      process.exit(1);
    }
  }

  // Step 3: Extract cookies
  const cookies = await extractCookies(browser);
  const { loggedIn, missing } = checkLoginStatus(cookies);

  // Step 4: Check login status
  if (!loggedIn) {
    console.log('\nLOGIN_REQUIRED');
    console.log(`Missing auth cookies: ${missing.join(', ')}`);
    console.log('Please log into YouTube in the Chrome window that opened, then re-run this script.');
    browser.disconnect();
    process.exit(3);
  }

  // Step 5: Save cookies
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const outputPath = getOutputPath();
  writeFileSync(outputPath, JSON.stringify({ cookie_string: cookieString }, null, 2));

  const authPresent = AUTH_COOKIES.filter(name => cookies.find(c => c.name === name));
  console.log(`\n\u2713 Saved ${authPresent.length}/${AUTH_COOKIES.length} auth cookies to ${outputPath}`);
  console.log(`  Cookie string length: ${cookieString.length} chars`);
  console.log('\n\u2713 Authentication looks good! YouTube tools will use personalized results.');

  browser.disconnect();
}

main().catch((error) => {
  console.error('Cookie extraction failed:', error.message);
  process.exit(1);
});
