/**
 * providers/grok.js
 * Scrapes Grok (grok.com). Requires a saved session (X/Twitter account).
 */
'use strict';

const { applySession, loadSession } = require('../session_manager');

const BASE_URL = 'https://grok.com';
const PROVIDER = 'grok';

const INPUT_SELECTORS = [
  'textarea[placeholder*="Ask"]',
  'textarea[aria-label*="Ask Grok"]',
  'div[contenteditable="true"]',
  'textarea',
];

const SEND_SELECTORS = [
  'button[aria-label="Send"]',
  'button[type="submit"]',
];

const LOADING_SELECTORS = [
  'button[aria-label="Stop generating"]',
  '[class*="loading"]',
  '[class*="thinking"]',
];

const RESPONSE_SELECTORS = [
  '[class*="message-bubble"]:last-child',
  '[class*="response"]:last-child',
  'div[data-testid="grok-message"]:last-child',
  '.prose',
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
      error: 'Grok requires authentication. Use POST /api/admin/llm-auth/start/grok to log in.',
    };
  }

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await applySession(page, PROVIDER);
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

    const inputSel = await waitForSelector(page, INPUT_SELECTORS, 20000);
    if (!inputSel) {
      return { answer: '', error: 'Grok input not found — layout may have changed' };
    }

    await page.click(inputSel);
    await page.keyboard.type(question, { delay: 20 });

    const sendSel = await waitForSelector(page, SEND_SELECTORS, 5000);
    if (sendSel) {
      await page.click(sendSel);
    } else {
      await page.keyboard.press('Enter');
    }

    try { await waitForSelector(page, LOADING_SELECTORS, 10000); } catch {}
    await page.waitForFunction(
      (sels) => !sels.some(s => document.querySelector(s)),
      { timeout: 120000, polling: 600 },
      LOADING_SELECTORS
    );

    await new Promise(r => setTimeout(r, 800));

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
