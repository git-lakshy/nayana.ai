/**
 * providers/perplexity.js
 * Scrapes Perplexity AI (perplexity.ai). Works WITHOUT login.
 * Perplexity always returns real-time web-cited answers.
 */
'use strict';

const { applySession } = require('../session_manager');

const BASE_URL = 'https://www.perplexity.ai';
const PROVIDER = 'perplexity';

const INPUT_SELECTORS = [
  'textarea[placeholder*="Ask"]',
  'textarea[placeholder*="Search"]',
  'div[contenteditable="true"][aria-label*="Ask"]',
  '.grow textarea',
  'textarea',
];

// The loading/thinking indicator
const LOADING_SELECTORS = [
  '[data-testid="stop-generating"]',
  'button[aria-label="Stop"]',
  '.animate-spin',
];

const RESPONSE_SELECTORS = [
  '.prose',
  '[class*="prose"]',
  '[data-testid="answer-text"]',
  '.answer-text',
  'div[class*="AnswerBody"]',
  'div[class*="answer"]',
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
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await applySession(page, PROVIDER);

    const session = require('../session_manager').loadSession(PROVIDER);
    if (session) {
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    }

    // Find and fill input
    const inputSel = await waitForSelector(page, INPUT_SELECTORS, 20000);
    if (!inputSel) {
      return { answer: '', error: 'Perplexity input not found' };
    }

    await page.click(inputSel);
    await page.keyboard.type(question, { delay: 15 });
    await page.keyboard.press('Enter');

    // Wait for loading to START
    try {
      await waitForSelector(page, LOADING_SELECTORS, 10000);
    } catch {}

    // Wait for loading to FINISH — spinner disappears or stop button gone
    await page.waitForFunction(
      (sels) => !sels.some(s => {
        const el = document.querySelector(s);
        return el && (el.offsetParent !== null || el.checkVisibility?.());
      }),
      { timeout: 90000, polling: 500 },
      LOADING_SELECTORS
    );

    await new Promise(r => setTimeout(r, 1000));

    // Extract answer — try each selector, take the longest text
    const answer = await page.evaluate((sels) => {
      let best = '';
      for (const sel of sels) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t.length > best.length) best = t;
        }
      }
      return best;
    }, RESPONSE_SELECTORS);

    // Also grab citations if present
    const citations = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="http"][class*="citation"], a[href*="http"][data-testid*="source"]');
      return Array.from(links).map(a => a.href).filter(Boolean).slice(0, 10);
    });

    return { answer, citations };
  } catch (err) {
    return { answer: '', error: err.message };
  } finally {
    await page.close();
  }
}

module.exports = { ask, PROVIDER, BASE_URL };
