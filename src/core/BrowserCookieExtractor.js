'use strict';

/**
 * BrowserCookieExtractor.js
 *
 * Extracts Udemy session cookies from the user's browser.
 *
 * Strategy:
 *   1. Firefox  → reads SQLite directly (plain text, no encryption)
 *   2. Chrome / Brave / Chromium / Edge → delegates to `yt-dlp --cookies-from-browser`
 *      which handles all platform-specific decryption natively.
 *
 * The extracted cookieString is used for:
 *   a) Udemy API calls (axios headers)
 *   b) Passed to VideoDownloader as --cookies-from-browser flag for yt-dlp
 */

const path    = require('path');
const os      = require('os');
const fs      = require('fs-extra');
const { execFileSync, spawnSync } = require('child_process');
const logger  = require('../utils/logger');

// ─── Browser profile paths on Linux ──────────────────────────────────────────

const FIREFOX_BASES = [
  path.join(os.homedir(), '.mozilla', 'firefox'),
  path.join(os.homedir(), 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
  path.join(os.homedir(), '.librewolf'),
];

// Chrome-family: profile roots (we scan all sub-profiles)
const CHROME_ROOTS = [
  { browser: 'chrome',    root: path.join(os.homedir(), '.config', 'google-chrome') },
  { browser: 'chromium',  root: path.join(os.homedir(), '.config', 'chromium') },
  { browser: 'chromium',  root: path.join(os.homedir(), 'snap', 'chromium', 'current', '.config', 'chromium') },
  { browser: 'brave',     root: path.join(os.homedir(), '.config', 'brave-browser') },
  { browser: 'edge',      root: path.join(os.homedir(), '.config', 'microsoft-edge') },
];

const UDEMY_HOST_PATTERN = '%udemy.com%';

// Important Udemy cookies to prioritize
const IMPORTANT_COOKIES = new Set([
  'access_token', 'client_id', 'ud_user_jwt', 'csrftoken',
  'dj_session_id', '__udmy_2_v57r', 'ud_cache_user',
]);

// ─── Class ────────────────────────────────────────────────────────────────────

class BrowserCookieExtractor {
  constructor({ ytDlpPath = 'yt-dlp' } = {}) {
    this.ytDlpPath = ytDlpPath;
    this._Database = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Detect all browsers that have Udemy cookies installed.
   * @returns {Promise<Array<{browser: string, label: string, dbPath?: string, method: string}>>}
   */
  async detectAvailableBrowsers() {
    const found = [];

    // 1. Firefox (direct SQLite — most reliable)
    for (const baseDir of FIREFOX_BASES) {
      if (!await fs.pathExists(baseDir)) continue;
      const profiles = await this._findFirefoxProfiles(baseDir);

      for (const profilePath of profiles) {
        const cookieDb = path.join(profilePath, 'cookies.sqlite');
        if (!await fs.pathExists(cookieDb)) continue;
        if (await this._firefoxHasUdemy(cookieDb)) {
          found.push({
            browser: 'firefox',
            label: `Firefox (${path.basename(profilePath)})`,
            dbPath: cookieDb,
            method: 'sqlite',
          });
        }
      }
    }

    // 2. Chrome-family (via yt-dlp native extraction)
    for (const { browser, root } of CHROME_ROOTS) {
      if (!await fs.pathExists(root)) continue;

      // Check if any profile has Udemy cookies
      const hasUdemy = await this._chromeRootHasUdemy(root);
      if (hasUdemy) {
        const label = this._chromeLabel(browser, root);
        // Avoid duplicates
        if (!found.find((f) => f.browser === browser && f.root === root)) {
          found.push({
            browser,
            label,
            root,
            method: 'ytdlp',
          });
        }
      }
    }

    return found;
  }

  /**
   * Extract cookies from a specific detected browser.
   * @param {{browser: string, method: string, dbPath?: string, root?: string}} browserInfo
   * @returns {Promise<string>} Cookie header string
   */
  async extract(browserInfo) {
    if (browserInfo.method === 'sqlite') {
      return this._extractFirefox(browserInfo.dbPath);
    } else {
      return this._extractViaYtDlp(browserInfo.browser);
    }
  }

  /**
   * Auto-extract: find the first available browser and extract.
   * Prefers Firefox (direct SQLite, no decryption needed).
   * @returns {Promise<{cookieString: string, browser: string, label: string}>}
   */
  async autoExtract() {
    const browsers = await this.detectAvailableBrowsers();

    if (browsers.length === 0) {
      throw new Error(
        'No browser with Udemy cookies found.\n' +
        '  → Make sure you are logged in to Udemy in Chrome or Firefox first.\n' +
        '  → Then restart this tool and try again.',
      );
    }

    // Prefer Firefox (no encryption workarounds)
    const preferred = browsers.find((b) => b.browser === 'firefox') || browsers[0];
    logger.info(`Auto-detected browser: ${preferred.label}`);

    const cookieString = await this.extract(preferred);

    return {
      cookieString,
      browser: preferred.browser,
      label: preferred.label,
    };
  }

  // ─── Firefox (direct SQLite) ─────────────────────────────────────────────────

  async _findFirefoxProfiles(baseDir) {
    const results = [];
    try {
      const entries = await fs.readdir(baseDir);
      for (const entry of entries) {
        const full = path.join(baseDir, entry);
        const stat = await fs.stat(full).catch(() => null);
        if (stat && stat.isDirectory()) {
          if (await fs.pathExists(path.join(full, 'cookies.sqlite'))) {
            results.push(full);
          }
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  async _copySqliteWithWal(src, dest) {
    await fs.copy(src, dest);
    if (await fs.pathExists(`${src}-wal`)) {
      await fs.copy(`${src}-wal`, `${dest}-wal`).catch(() => {});
    }
    if (await fs.pathExists(`${src}-shm`)) {
      await fs.copy(`${src}-shm`, `${dest}-shm`).catch(() => {});
    }
  }

  async _removeSqliteWithWal(tempPath) {
    await fs.remove(tempPath).catch(() => {});
    await fs.remove(`${tempPath}-wal`).catch(() => {});
    await fs.remove(`${tempPath}-shm`).catch(() => {});
  }

  async _firefoxHasUdemy(dbPath) {
    const tempPath = path.join(os.tmpdir(), `ff-check-${Date.now()}.sqlite`);
    try {
      await this._copySqliteWithWal(dbPath, tempPath);
      const db = this._openDb(tempPath);
      const row = db.prepare(
        `SELECT 1 FROM moz_cookies WHERE host LIKE ? LIMIT 1`,
      ).get(UDEMY_HOST_PATTERN);
      db.close();
      return !!row;
    } catch {
      return false;
    } finally {
      await this._removeSqliteWithWal(tempPath);
    }
  }

  async _extractFirefox(dbPath) {
    const tempPath = path.join(os.tmpdir(), `ff-cookies-${Date.now()}.sqlite`);
    await this._copySqliteWithWal(dbPath, tempPath);

    try {
      const db = this._openDb(tempPath);
      const rows = db.prepare(`
        SELECT name, value, host
        FROM moz_cookies
        WHERE host LIKE ?
        ORDER BY lastAccessed DESC
      `).all(UDEMY_HOST_PATTERN);
      db.close();

      return this._buildCookieString(rows);
    } finally {
      await this._removeSqliteWithWal(tempPath);
    }
  }

  // ─── Chrome-family (via yt-dlp) ──────────────────────────────────────────────

  /**
   * Check if any Chrome profile at this root has Udemy cookies.
   * Uses sqlite3 directly (unencrypted check — just looks for row existence).
   */
  async _chromeRootHasUdemy(rootDir) {
    // Scan common profile names
    const profileNames = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 5'];

    for (const name of profileNames) {
      const cookiesFile = path.join(rootDir, name, 'Cookies');
      if (!await fs.pathExists(cookiesFile)) continue;

      const tempPath = path.join(os.tmpdir(), `chr-check-${Date.now()}.sqlite`);
      try {
        await this._copySqliteWithWal(cookiesFile, tempPath);
        const db = this._openDb(tempPath);
        const row = db.prepare(
          `SELECT 1 FROM cookies WHERE host_key LIKE ? LIMIT 1`,
        ).get(UDEMY_HOST_PATTERN);
        db.close();
        if (row) return true;
      } catch {
        // ignore locked / corrupt db
      } finally {
        await this._removeSqliteWithWal(tempPath);
      }
    }
    return false;
  }

  /**
   * Use yt-dlp to export Chrome cookies to a temp Netscape file, then parse it.
   * yt-dlp handles all Chrome encryption (v10/v11/v20/DPAPI/Keyring) natively.
   * @param {string} browser 'chrome' | 'brave' | 'chromium' | 'edge'
   * @returns {Promise<string>} Cookie header string
   */
  async _extractViaYtDlp(browser) {
    const tempCookieFile = path.join(os.tmpdir(), `udemy-ytdlp-cookies-${Date.now()}.txt`);

    logger.debug(`Extracting ${browser} cookies via yt-dlp...`);

    try {
      // Use yt-dlp to extract cookies from the browser directly
      // --cookies-from-browser writes to --cookies output file
      const result = spawnSync(this.ytDlpPath, [
        '--cookies-from-browser', browser,
        '--cookies', tempCookieFile,
        '--skip-download',
        '--quiet',
        '--no-warnings',
        'https://www.udemy.com',
      ], {
        timeout: 30000,
        encoding: 'utf8',
      });

      if (!await fs.pathExists(tempCookieFile)) {
        throw new Error(
          `yt-dlp did not produce a cookies file for ${browser}.\n` +
          `  yt-dlp stderr: ${(result.stderr || '').slice(0, 300)}`,
        );
      }

      // Parse the Netscape cookies file
      const cookieString = await this._parseNetscapeCookieFile(tempCookieFile);
      logger.debug(`Extracted cookies via yt-dlp for ${browser}`);

      return cookieString;
    } finally {
      await fs.remove(tempCookieFile).catch(() => {});
    }
  }


  /**
   * Parse a Netscape-format cookies.txt file and extract Udemy cookies.
   * Format: domain  flag  path  secure  expiry  name  value
   * @param {string} filePath
   * @returns {Promise<string>} Cookie header string
   */
  async _parseNetscapeCookieFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const rows = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split('\t');
      if (parts.length < 7) continue;

      const domain = parts[0];
      const name   = parts[5];
      const value  = parts[6];

      if (!domain.includes('udemy.com')) continue;
      if (!name || !value) continue;

      rows.push({ name, value, host: domain });
    }

    return this._buildCookieString(rows);
  }

  // ─── Shared Helpers ──────────────────────────────────────────────────────────

  _openDb(dbPath) {
    if (!this._Database) {
      this._Database = require('better-sqlite3');
    }
    return this._Database(dbPath, { readonly: true, fileMustExist: true });
  }

  _buildCookieString(rows) {
    if (!rows || rows.length === 0) {
      throw new Error(
        'No Udemy cookies found.\n' +
        '  → Are you logged in to Udemy in this browser?\n' +
        '  → Visit udemy.com and log in, then try again.',
      );
    }

    // Deduplicate by name
    const seen = new Set();
    const unique = rows.filter((r) => {
      if (seen.has(r.name) || !r.value || r.value === 'undefined') return false;
      seen.add(r.name);
      return true;
    });

    // Important cookies first
    unique.sort((a, b) => {
      const aI = IMPORTANT_COOKIES.has(a.name) ? 0 : 1;
      const bI = IMPORTANT_COOKIES.has(b.name) ? 0 : 1;
      return aI - bI;
    });

    const cookieStr = unique.map((r) => `${r.name}=${r.value}`).join('; ');

    const authCount = unique.filter((r) => IMPORTANT_COOKIES.has(r.name)).length;
    logger.debug(`Extracted ${unique.length} Udemy cookies (${authCount} auth cookies)`);

    if (authCount === 0) {
      logger.warn('Warning: No auth cookies found (access_token, client_id). Are you logged in to Udemy?');
    }

    return cookieStr;
  }

  _chromeLabel(browser, rootDir) {
    const labels = {
      chrome: 'Google Chrome',
      brave: 'Brave Browser',
      chromium: 'Chromium',
      edge: 'Microsoft Edge',
    };
    return labels[browser] || 'Chrome-based Browser';
  }
}

module.exports = BrowserCookieExtractor;
