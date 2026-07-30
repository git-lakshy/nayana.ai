/**
 * providers/chatgpt.js
 * Scrapes ChatGPT (chatgpt.com). Works WITHOUT login for basic queries.
 * With a saved session, uses the authenticated account.
 */
'use strict';

const { applySession } = require('../session_manager');

const BASE_URL = 'https://chatgpt.com';
const PROVIDER = 'chatgpt';

// Selectors — ChatGPT updates frequently, ordered by reliability
const INPUT_SELECTORS = [
  '#prompt-textarea',
  'textarea[data-id="root"]',
  'div[contenteditable="true"][id="prompt-textarea"]',
  'div[contenteditable="true"]',
];

const SEND_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send message"]',
];

const STOP_SELECTORS = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
];

const RESPONSE_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '.agent-turn',
  '[class*="agent-turn"]',
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

async function findElement(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Ask a question on ChatGPT and return the answer text.
 * @param {import('puppeteer').Browser} browser
 * @param {string} question
 * @returns {Promise<{answer: string, error?: string}>}
 */
async function ask(browser, question) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Navigate and apply saved session if available
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await applySession(page, PROVIDER);

    // If session was applied, reload to activate cookies
    const session = require('../session_manager').loadSession(PROVIDER);
    if (session) {
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    }

    // Wait for the input to be ready
    const inputSel = await waitForSelector(page, INPUT_SELECTORS, 20000);
    if (!inputSel) {
      return { answer: '', error: 'ChatGPT input not found — page may have changed layout' };
    }

    // Type the question
    const input = await page.$(inputSel);
    await input.click();
    await page.keyboard.type(question, { delay: 20 });

    // Click send
    const sendSel = await waitForSelector(page, SEND_SELECTORS, 5000);
    if (sendSel) {
      await page.click(sendSel);
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for generation to START (stop button appears)
    try {
      await waitForSelector(page, STOP_SELECTORS, 15000);
    } catch {}

    // Wait for generation to FINISH (stop button disappears)
    await page.waitForFunction(
      (stopSels) => !stopSels.some(s => document.querySelector(s)),
      { timeout: 120000, polling: 500 },
      STOP_SELECTORS
    );

    // Small buffer for final render
    await new Promise(r => setTimeout(r, 800));

    // Extract the last assistant message
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
