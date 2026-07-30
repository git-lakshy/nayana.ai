#!/usr/bin/env node
/**
 * scraper.js — Main entry point for the Nayana browser LLM scraper.
 *
 * Called as a child process from Python:
 *   node scraper.js --provider=chatgpt --question="..." [--timeout=90]
 *
 * Outputs a single JSON line to stdout:
 *   {"provider":"chatgpt","answer":"...","citations":[],"latency_ms":1234,"error":null}
 *
 * Exit 0 always — errors are communicated via the JSON error field.
 */
'use strict';

const puppeteer = require('puppeteer');

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    })
);

const PROVIDER = (args.provider || 'chatgpt').toLowerCase();
const QUESTION = args.question || '';
const TIMEOUT_MS = parseInt(args.timeout || '90', 10) * 1000;

const PROVIDERS = {
  chatgpt:    require('./providers/chatgpt'),
  perplexity: require('./providers/perplexity'),
  claude:     require('./providers/claude'),
  gemini:     require('./providers/gemini'),
  grok:       require('./providers/grok'),
};

async function main() {
  const t0 = Date.now();
  const out = { provider: PROVIDER, answer: '', citations: [], latency_ms: 0, error: null };

  if (!QUESTION.trim()) {
    out.error = 'No question provided (--question="...")';
    process.stdout.write(JSON.stringify(out) + '\n');
    return;
  }

  const handler = PROVIDERS[PROVIDER];
  if (!handler) {
    out.error = `Unknown provider: ${PROVIDER}. Available: ${Object.keys(PROVIDERS).join(', ')}`;
    process.stdout.write(JSON.stringify(out) + '\n');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
      ],
      defaultViewport: { width: 1280, height: 900 },
      timeout: TIMEOUT_MS,
    });

    // Mask automation detection
    const pages = await browser.pages();
    for (const p of pages) {
      await p.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });
    }

    const result = await Promise.race([
      handler.ask(browser, QUESTION),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
      ),
    ]);

    out.answer = result.answer || '';
    out.citations = result.citations || [];
    out.error = result.error || null;
  } catch (err) {
    out.error = err.message;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  out.latency_ms = Date.now() - t0;
  process.stdout.write(JSON.stringify(out) + '\n');
}

main().catch(err => {
  process.stdout.write(JSON.stringify({
    provider: PROVIDER, answer: '', citations: [], latency_ms: 0,
    error: `Fatal: ${err.message}`,
  }) + '\n');
});
