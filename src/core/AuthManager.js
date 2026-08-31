'use strict';

/**
 * AuthManager.js
 * Handles all authentication mechanisms:
 *  1. Bearer access token  (--token flag or ACCESS_TOKEN in .env)
 *  2. Raw cookie string    (--cookies flag or COOKIE_STRING in .env)
 *  3. Netscape cookies.txt (--cookie-file flag or COOKIE_FILE in .env)
 *  4. Auto browser extraction — reads directly from Chrome/Firefox on disk
 *     (zero manual steps, used when nothing else is configured)
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class AuthManager {
  /**
   * @param {object} options
   * @param {string}  [options.accessToken]   - Bearer token string
   * @param {string}  [options.cookieString]  - Raw cookie string
   * @param {string}  [options.cookieFile]    - Path to a Netscape cookies.txt file
   * @param {string}  [options.browser]       - Force browser: 'firefox'|'chrome'|'brave'
   * @param {string}  [options.ytDlpPath]     - Custom path to yt-dlp binary
   * @param {boolean} [options.autoExtract]   - Enable auto browser extraction (default: true)
   */
  constructor({ accessToken, cookieString, cookieFile, browser, ytDlpPath, autoExtract } = {}) {
    this.accessToken  = accessToken  || null;
    this.cookieString = cookieString || null;
    this.cookieFile   = cookieFile   || null;
    this.browser      = browser      || null;
    this.ytDlpPath    = ytDlpPath    || 'yt-dlp';
    this.autoExtract  = autoExtract !== false; // default true
    this.resolvedBrowserLabel = null;
  }

  /**
   * Resolve authentication credentials.
   * Priority: token → cookie string → cookie file → auto browser extraction
   *
   * @returns {Promise<{accessToken?: string, cookieString?: string, browser?: string}>}
   */
  async resolve() {
    // 1. Bearer token — highest priority
    // Always include cookieString alongside token so Python fallback can use cookies
    if (this.accessToken) {
      logger.debug('Auth: using Bearer token.');
      const creds = { accessToken: this.accessToken };
      if (this.cookieString) creds.cookieString = this.cookieString;
      return creds;
    }

    // 2. Raw cookie string
    if (this.cookieString) {
      logger.debug('Auth: using raw cookie string.');
      const creds = { cookieString: this.cookieString };
      const tokenMatch = this.cookieString.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (tokenMatch && tokenMatch[1]) {
        creds.accessToken = tokenMatch[1].trim();
        logger.debug('Auth: auto-extracted access_token from cookies.');
      }
      return creds;
    }

    // 3. Netscape cookies.txt file
    if (this.cookieFile) {
      const resolved = path.resolve(process.cwd(), this.cookieFile);
      if (!await fs.pathExists(resolved)) {
        throw new Error(`Cookie file not found: ${resolved}`);
      }
      const cookieString = await this._parseCookieFile(resolved);
      logger.debug(`Auth: loaded cookies from file: ${resolved}`);
      return { cookieString };
    }

    // 4. Auto browser extraction (no manual steps)
    if (this.autoExtract) {
      return await this._tryBrowserExtraction();
    }

    throw new Error(
      'No authentication credentials provided.\n' +
      '  Run with no flags and the setup wizard will guide you, OR:\n' +
      '    --token <bearer-token>\n' +
      '    --cookies <"name=val; name2=val2">\n' +
      '    --cookie-file <path/to/cookies.txt>\n' +
      '  Or set ACCESS_TOKEN / COOKIE_STRING in your .env file.',
    );
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Attempt to auto-extract cookies from an installed browser.
   * Prefers Firefox (no decryption needed).
   */
  async _tryBrowserExtraction() {
    logger.info('No credentials found — attempting auto browser cookie extraction...');

    const BrowserCookieExtractor = require('./BrowserCookieExtractor');
    const extractor = new BrowserCookieExtractor({ ytDlpPath: this.ytDlpPath });

    try {
      let result;

      if (this.browser) {
        const browsers = await extractor.detectAvailableBrowsers();
        const match = browsers.find((b) => b.browser === this.browser);

        if (!match) {
          throw new Error(
            `No ${this.browser} profile found with Udemy cookies.\n` +
            '  Make sure you are logged in to Udemy in that browser.',
          );
        }

        const cookieString = await extractor.extract(match);
        result = { cookieString, browser: match.browser, label: match.label };
      } else {
        result = await extractor.autoExtract();
      }

      this.resolvedBrowserLabel = result.label;
      logger.info(`✔  Cookies auto-extracted from: ${result.label}`);

      return {
        cookieString: result.cookieString,
        browser: result.browser,
      };
    } catch (err) {
      throw new Error(
        `Auto browser extraction failed: ${err.message}\n\n` +
        '  Solutions:\n' +
        '  1. Make sure you are logged in to Udemy in Chrome or Firefox\n' +
        '  2. Run the setup wizard:  node src/cli/index.js (select "Setup Credentials")\n' +
        '  3. Pass credentials manually with --token or --cookies\n',
      );
    }
  }

  /**
   * Parse a Netscape-format cookies.txt file and return a cookie header string.
   * Format per line: domain  flag  path  secure  expiry  name  value
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async _parseCookieFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const cookies = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split('\t');
      if (parts.length >= 7) {
        const name = parts[5];
        const value = parts[6];
        if (name && value) {
          cookies.push(`${name}=${value}`);
        }
      }
    }

    if (cookies.length === 0) {
      throw new Error(`No valid cookies found in file: ${filePath}`);
    }

    logger.debug(`Auth: parsed ${cookies.length} cookies from file.`);
    return cookies.join('; ');
  }
}

module.exports = AuthManager;
