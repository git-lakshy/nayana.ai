/**
 * providers/claude.js
 * Scrapes Claude AI (claude.ai). Requires a saved session (login required).
 * Returns { answer, error } — if no session, returns an actionable error.
 */
'use strict';

const { applySession, loadSession } = require('../session_manager');

const BASE_URL = 'https://claude.ai/new';
const PROVIDER = 'claude';

const INPUT_SELECTORS = [
  'div[contenteditable="true"][aria-label*="Message"]',
  'div[contenteditable="true"][aria-label*="Talk to Claude"]',
  'div.ProseMirror[contenteditable="true"]',
  'div[contenteditable="true"]',
];

const SEND_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label="Send Message"]',
  'button[type="submit"]',
];

// While streaming, Claude shows a stop button or a loading indicator
const STREAMING_SELECTORS = [
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop"]',
  '[data-is-streaming="true"]',
];

const RESPONSE_SELECTORS = [
  '[data-is-streaming="false"] .font-claude-message',
  '.font-claude-message',
  '[class*="assistant-message"]',
  'div[data-message-author="assistant"]',
];

async function waitForSelector(page, selectors, timeout = 10000) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return sel;
    } catch {}
  }
  return null;
}

async function ask(browser, question) {
  const session = loadSession(PROVIDER);
  if (!session) {
    return {
      answer: '',
      error: 'Claude requires authentication. Use POST /api/admin/llm-auth/start/claude to log in.',
    };
  }

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Load claude.ai with session cookies
    await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await applySession(page, PROVIDER);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Check if still logged in
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('[href*="login"], [href*="sign-in"]');
    });
    if (!isLoggedIn) {
      return {
        answer: '',
        error: 'Claude session expired. Re-authenticate via POST /api/admin/llm-auth/start/claude',
      };
    }

    const inputSel = await waitForSelector(page, INPUT_SELECTORS, 20000);
    if (!inputSel) {
      return { answer: '', error: 'Claude input not found — layout may have changed' };
    }

    // Type into contenteditable
    await page.click(inputSel);
    await page.keyboard.type(question, { delay: 20 });

    // Send
    const sendSel = await waitForSelector(page, SEND_SELECTORS, 5000);
    if (sendSel) {
      await page.click(sendSel);
    } else {
      // Claude accepts Enter in contenteditable
      await page.keyboard.press('Enter');
    }

    // Wait for streaming to START
    try {
      await waitForSelector(page, STREAMING_SELECTORS, 15000);
    } catch {}

    // Wait for streaming to END
    await page.waitForFunction(
      (sels) => !sels.some(s => document.querySelector(s)),
      { timeout: 120000, polling: 500 },
      STREAMING_SELECTORS
    );

    await new Promise(r => setTimeout(r, 600));

    const answer = await page.evaluate((sels) => {
      for (const sel of sels) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const last = els[els.length - 1];
          return (last.innerText || last.textContent || '').trim();
        }
      }
      return '';
    }, RESPONSE_SELECTORS);

    return { answer };
  } catch (err) {
    return { answer: '', error: err.message };
  } finally {
    await page.close();
  }
}

module.exports = { ask, PROVIDER, BASE_URL };
