#!/usr/bin/env node
/**
 * auth_server.js — Opens a VISIBLE browser so the user can log in manually.
 * After login is detected, saves cookies to sessions/<provider>.json and exits.
 *
 * Called from Python admin route:
 *   node auth_server.js --provider=claude [--timeout=300]
 *
 * Outputs JSON to stdout:
 *   {"ok": true, "provider": "claude", "savedAt": "..."}
 *   {"ok": false, "error": "..."}
 */
'use strict';

const puppeteer = require('puppeteer');
const { saveSession } = require('./session_manager');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    })
);

const PROVIDER = (args.provider || '').toLowerCase();
const TIMEOUT_S = parseInt(args.timeout || '300', 10);

// Where to navigate and how to detect a successful login
const PROVIDER_CONFIG = {
  chatgpt: {
    loginUrl: 'https://chatgpt.com/auth/login',
    successUrl: 'https://chatgpt.com',
    // Logged in when the new-chat page loads (no redirect to /auth)
    isLoggedIn: (url) => url.startsWith('https://chatgpt.com') && !url.includes('/auth'),
    waitForSelector: '#prompt-textarea, div[contenteditable="true"]',
  },
  claude: {
    loginUrl: 'https://claude.ai/login',
    successUrl: 'https://claude.ai',
    isLoggedIn: (url) => url.startsWith('https://claude.ai') && !url.includes('/login'),
    waitForSelector: 'div[contenteditable="true"]',
  },
  gemini: {
    loginUrl: 'https://gemini.google.com',
    successUrl: 'https://gemini.google.com/app',
    isLoggedIn: (url) => url.includes('gemini.google.com/app'),
    waitForSelector: 'div[contenteditable="true"]',
  },
  perplexity: {
    loginUrl: 'https://perplexity.ai',
    successUrl: 'https://perplexity.ai',
    isLoggedIn: (url) => url.startsWith('https://www.perplexity.ai') || url.startsWith('https://perplexity.ai'),
    waitForSelector: 'textarea',
  },
  grok: {
    loginUrl: 'https://grok.com',
    successUrl: 'https://grok.com',
    isLoggedIn: (url) => url.startsWith('https://grok.com') && !url.includes('login'),
    waitForSelector: 'textarea, div[contenteditable="true"]',
  },
};

async function main() {
  if (!PROVIDER || !PROVIDER_CONFIG[PROVIDER]) {
    const result = { ok: false, error: `Unknown provider: ${PROVIDER}. Valid: ${Object.keys(PROVIDER_CONFIG).join(', ')}` };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  const config = PROVIDER_CONFIG[PROVIDER];
  let browser;

  try {
    // Open VISIBLE browser (not headless) so user can interact
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: null, // full screen
      timeout: 30000,
    });

    const [page] = await browser.pages();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    process.stderr.write(`[auth_server] Opening ${config.loginUrl} for ${PROVIDER} login...\n`);
    process.stderr.write(`[auth_server] Please log in within ${TIMEOUT_S} seconds.\n`);

    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Poll until the user completes login or timeout
    const deadline = Date.now() + TIMEOUT_S * 1000;
    let loggedIn = false;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const currentUrl = page.url();
      if (config.isLoggedIn(currentUrl)) {
        loggedIn = true;
        break;
      }
    }

    if (!loggedIn) {
      throw new Error(`Login not completed within ${TIMEOUT_S}s. Please try again.`);
    }

    // Wait a moment for cookies to settle
    await new Promise(r => setTimeout(r, 2000));

    // Capture cookies
    const cookies = await page.cookies();

    // Capture localStorage (some providers store auth there)
    const localStorageData = await page.evaluate(() => {
      const data = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
      } catch {}
      return data;
    });

    // Save session
    saveSession(PROVIDER, cookies, localStorageData);

    const savedAt = new Date().toISOString();
    process.stderr.write(`[auth_server] Session saved for ${PROVIDER} at ${savedAt}\n`);
    process.stdout.write(JSON.stringify({ ok: true, provider: PROVIDER, savedAt }) + '\n');

  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, provider: PROVIDER, error: err.message }) + '\n');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main();
