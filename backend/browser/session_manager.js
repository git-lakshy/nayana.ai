/**
 * session_manager.js
 * Saves and loads browser cookies/localStorage per LLM provider.
 * Sessions are stored as JSON files in ./sessions/<provider>.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function sessionPath(provider) {
  return path.join(SESSION_DIR, `${provider}.json`);
}

/**
 * Save cookies (and optionally localStorage) for a provider.
 * @param {string} provider
 * @param {Array} cookies - array from page.cookies()
 * @param {Object} [localStorageData] - optional key/value from page.evaluate
 */
function saveSession(provider, cookies, localStorageData = {}) {
  const data = { provider, savedAt: new Date().toISOString(), cookies, localStorage: localStorageData };
  fs.writeFileSync(sessionPath(provider), JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Load saved session for a provider. Returns null if not found.
 */
function loadSession(provider) {
  const p = sessionPath(provider);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Apply a saved session to a Puppeteer page.
 * Call this AFTER navigating to the base URL of the provider.
 */
async function applySession(page, provider) {
  const session = loadSession(provider);
  if (!session) return false;

  if (session.cookies && session.cookies.length > 0) {
    await page.setCookie(...session.cookies);
  }

  if (session.localStorage && Object.keys(session.localStorage).length > 0) {
    await page.evaluate((store) => {
      for (const [k, v] of Object.entries(store)) {
        try { localStorage.setItem(k, v); } catch {}
      }
    }, session.localStorage);
  }

  return true;
}

/**
 * Clear saved session for a provider.
 */
function clearSession(provider) {
  const p = sessionPath(provider);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * Return status of all known providers.
 */
function sessionStatus() {
  const providers = ['chatgpt', 'perplexity', 'claude', 'gemini', 'grok'];
  return providers.reduce((acc, p) => {
    const session = loadSession(p);
    acc[p] = session
      ? { authenticated: true, savedAt: session.savedAt }
      : { authenticated: false };
    return acc;
  }, {});
}

module.exports = { saveSession, loadSession, applySession, clearSession, sessionStatus };
