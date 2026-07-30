/**
 * providers/gemini.js
 * Scrapes Google Gemini (gemini.google.com). Requires a saved session.
 */
'use strict';

const { applySession, loadSession } = require('../session_manager');

const BASE_URL = 'https://gemini.google.com/app';
const PROVIDER = 'gemini';

const INPUT_SELECTORS = [
  'div.ql-editor[contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  'div[contenteditable="true"][aria-label*="message"]',
  'div[contenteditable="true"]',
];

const SEND_SELECTORS = [
  'button[aria-label="Send message"]',
  'button.send-button',
  'button[data-mat-icon-name="send"]',
  'mat-icon[fonticon="send"]',
];

const LOADING_SELECTORS = [
  'div.loading-indicator',
  'mat-progress-bar',
  'span.pending',
  '[class*="loading"]',
];

const RESPONSE_SELECTORS = [
  'message-content .markdown',
  'message-content',
  'model-response .response-container',
  '[class*="model-response"]',
  '.response-container p',
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
      error: 'Gemini requires authentication. Use POST /api/admin/llm-auth/start/gemini to log in.',
    };
  }

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await applySession(page, PROVIDER);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const isLoggedIn = await page.evaluate(() =>
      !window.location.href.includes('accounts.google.com')
    );
    if (!isLoggedIn) {
      return {
        answer: '',
        error: 'Gemini session expired. Re-authenticate via POST /api/admin/llm-auth/start/gemini',
      };
    }

    const inputSel = await waitForSelector(page, INPUT_SELECTORS, 20000);
    if (!inputSel) {
      return { answer: '', error: 'Gemini input not found — layout may have changed' };
    }

    await page.click(inputSel);
    await page.keyboard.type(question, { delay: 20 });

    // Try send button, fall back to Enter
    const sendSel = await waitForSelector(page, SEND_SELECTORS, 5000);
    if (sendSel) {
      await page.click(sendSel);
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for loading
    try { await waitForSelector(page, LOADING_SELECTORS, 10000); } catch {}
    await page.waitForFunction(
      (sels) => !sels.some(s => document.querySelector(s)),
      { timeout: 120000, polling: 600 },
      LOADING_SELECTORS
    );

    // Extra wait — Gemini renders late
    await new Promise(r => setTimeout(r, 1500));

    const answer = await page.evaluate((sels) => {
      let best = '';
      for (const sel of sels) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const last = els[els.length - 1];
          const t = (last.innerText || last.textContent || '').trim();
          if (t.length > best.length) best = t;
        }
      }
      return best;
    }, RESPONSE_SELECTORS);

    return { answer };
  } catch (err) {
    return { answer: '', error: err.message };
  } finally {
    await page.close();
  }
}

module.exports = { ask, PROVIDER, BASE_URL };
