'use strict';

/**
 * config.js
 * Loads and merges configuration from:
 *   1. config/default.json  (project defaults)
 *   2. .env file            (environment overrides)
 *   3. CLI flags            (highest priority — applied externally)
 */

const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'default.json');

let _config = null;

/**
 * Load and return the merged config object.
 * Cached after first load.
 * @returns {object}
 */
function getConfig() {
  if (_config) return _config;

  // Load defaults
  let defaults = {};
  if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
    defaults = fs.readJsonSync(DEFAULT_CONFIG_PATH);
  }

  // Overlay env vars
  _config = {
    ...defaults,
    outputDir:     process.env.OUTPUT_DIR     || defaults.outputDir     || './downloads',
    quality:       process.env.QUALITY        || defaults.quality       || '1080',
    concurrency:   Number(process.env.CONCURRENCY || defaults.concurrency || 3),
    retryAttempts: Number(defaults.retryAttempts  || 3),
    retryDelay:    Number(defaults.retryDelay     || 2000),
    subtitles:     defaults.subtitles         !== false,
    subtitleLang:  defaults.subtitleLang       || 'en',
    downloadAssets:defaults.downloadAssets    !== false,
    downloadArticles:process.env.DOWNLOAD_ARTICLES !== undefined ? process.env.DOWNLOAD_ARTICLES === 'true' : (defaults.downloadArticles !== false),
    downloadQuizzes: process.env.DOWNLOAD_QUIZZES  !== undefined ? process.env.DOWNLOAD_QUIZZES  === 'true' : (defaults.downloadQuizzes  !== false),
    skipExisting:  defaults.skipExisting       !== false,
    logLevel:      process.env.LOG_LEVEL       || defaults.logLevel     || 'info',
    ytDlpPath:     _resolveBinaryPath(defaults.ytDlpPath || 'yt-dlp'),
    ffmpegPath:    _resolveBinaryPath(defaults.ffmpegPath || 'ffmpeg'),
    // Auth — never stored in default.json
    accessToken:   process.env.ACCESS_TOKEN    || null,
    cookieString:  process.env.COOKIE_STRING   || null,
  };

  return _config;
}

function _resolveBinaryPath(cmd) {
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? `${cmd}.exe` : cmd;
  const localBin = path.join(process.cwd(), 'bin', binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return cmd;
}

/**
 * Merge CLI-provided overrides into the config (highest priority).
 * @param {object} overrides
 */
function applyOverrides(overrides = {}) {
  const cfg = getConfig();
  Object.assign(cfg, overrides);
}

/**
 * Reset the cached configuration object and reload from disk/environment.
 * @returns {object}
 */
function reloadConfig() {
  _config = null;
  return getConfig();
}

module.exports = { getConfig, applyOverrides, reloadConfig };

