'use strict';

/**
 * setup.js
 * Interactive first-time setup wizard.
 * Guides the user through auth setup and saves credentials to .env.
 * Runs automatically when no credentials are found.
 */

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const inquirer = require('inquirer');
const BrowserCookieExtractor = require('../core/BrowserCookieExtractor');
const logger = require('../utils/logger');

const { version } = require('../../package.json');
const ENV_PATH = path.resolve(process.cwd(), '.env');

// ─── Banner ───────────────────────────────────────────────────────────────────

function printSetupBanner() {
  const dateStr = new Date().toISOString().split('T')[0];
  console.log(chalk.bold.yellow(`
╔══════════════════════════════════════════════════════════════╗
║  🔧  UDEMY DOWNLOADER — FIRST-TIME SETUP WIZARD             ║
║      Created by : Kadiri Emmanuel                            ║
║      Version    : v${version.padEnd(41)}║
║      Date       : ${dateStr.padEnd(42)}║
╚══════════════════════════════════════════════════════════════╝
`));
}

// ─── Main Setup Flow ──────────────────────────────────────────────────────────

/**
 * Run the interactive setup wizard.
 * Returns the chosen auth config.
 * @returns {Promise<{method: string, value: string}>}
 */
async function runSetupWizard() {
  printSetupBanner();

  console.log(chalk.dim(
    '  This wizard will save your credentials to .env\n' +
    '  You only need to do this once.\n',
  ));

  // Step 1: Choose auth method
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: chalk.cyan('How would you like to authenticate?'),
      choices: [
        {
          name: `${chalk.green('✨ Auto-detect from browser')}  ${chalk.dim('(Recommended — no copy/paste needed)')}`,
          value: 'auto',
        },
        {
          name: `${chalk.yellow('🔑 Bearer Token')}             ${chalk.dim('(from DevTools Network tab)')}`,
          value: 'token',
        },
        {
          name: `${chalk.yellow('🍪 Cookie String')}            ${chalk.dim('(from DevTools Application tab)')}`,
          value: 'cookies',
        },
        {
          name: `${chalk.yellow('📄 cookies.txt file')}         ${chalk.dim('(Netscape format export)')}`,
          value: 'cookiefile',
        },
      ],
    },
  ]);

  // ── Auto browser extraction ───────────────────────────────────────────────
  if (method === 'auto') {
    return await _handleAutoExtract();
  }

  // ── Bearer Token ──────────────────────────────────────────────────────────
  if (method === 'token') {
    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: chalk.cyan('Paste your Bearer token:'),
        mask: '*',
        validate: (v) => v.trim().length > 20 || 'Token looks too short. Please try again.',
      },
    ]);

    await _saveToEnv({ ACCESS_TOKEN: token.trim() });
    return { method: 'token', value: token.trim() };
  }

  // ── Cookie String ─────────────────────────────────────────────────────────
  if (method === 'cookies') {
    const { cookies } = await inquirer.prompt([
      {
        type: 'input',
        name: 'cookies',
        message: chalk.cyan('Paste your cookie string (name=val; name2=val2):'),
        validate: (v) =>
          v.trim().includes('=') || 'Does not look like a valid cookie string.',
      },
    ]);

    await _saveToEnv({ COOKIE_STRING: cookies.trim() });
    return { method: 'cookies', value: cookies.trim() };
  }

  // ── Cookie File ───────────────────────────────────────────────────────────
  if (method === 'cookiefile') {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: chalk.cyan('Enter the path to your cookies.txt file:'),
        default: './udemy.cookies.txt',
        validate: async (v) => {
          const resolved = path.resolve(process.cwd(), v.trim());
          if (await fs.pathExists(resolved)) return true;
          return `File not found: ${resolved}`;
        },
      },
    ]);

    await _saveToEnv({ COOKIE_FILE: filePath.trim() });
    return { method: 'cookiefile', value: filePath.trim() };
  }
}

// ─── Auto-Extraction ──────────────────────────────────────────────────────────

async function _handleAutoExtract() {
  console.log(chalk.dim('\n  🔍 Scanning for browsers with Udemy cookies...\n'));

  const extractor = new BrowserCookieExtractor();
  let browsers;

  try {
    browsers = await extractor.detectAvailableBrowsers();
  } catch (err) {
    console.error(chalk.red(`  ✖  Browser scan failed: ${err.message}`));
    return await _fallbackToManual();
  }

  if (browsers.length === 0) {
    console.log(chalk.yellow(
      '  ⚠  No browser found with Udemy cookies.\n' +
      '     Make sure you are logged in to Udemy in your browser first.\n',
    ));
    return await _fallbackToManual();
  }

  let selectedBrowser;

  if (browsers.length === 1) {
    selectedBrowser = browsers[0];
    console.log(chalk.green(`  ✔  Found: ${selectedBrowser.label}`));
  } else {
    // Let user pick which browser
    const { chosen } = await inquirer.prompt([
      {
        type: 'list',
        name: 'chosen',
        message: chalk.cyan('Multiple browsers found. Which one to use?'),
        choices: browsers.map((b, i) => ({ name: b.label, value: i })),
      },
    ]);
    selectedBrowser = browsers[chosen];
  }

  console.log(chalk.dim(`\n  Extracting cookies from ${selectedBrowser.label}...`));

  try {
    const cookieString = await extractor.extract(selectedBrowser);

    // Verify it contains the access_token
    if (!cookieString.includes('access_token=')) {
      console.log(chalk.yellow(
        '  ⚠  Warning: access_token cookie not found.\n' +
        '     You may not be logged in to Udemy in this browser.\n',
      ));
    } else {
      console.log(chalk.green('  ✔  access_token found — you are logged in!'));
    }

    await _saveToEnv({
      COOKIE_STRING: cookieString,
      BROWSER_TYPE: selectedBrowser.browser,
    });

    return {
      method: 'auto',
      value: cookieString,
      browser: selectedBrowser.browser,
      browserLabel: selectedBrowser.label,
    };
  } catch (err) {
    console.error(chalk.red(`  ✖  Cookie extraction failed: ${err.message}`));
    return await _fallbackToManual();
  }
}

async function _fallbackToManual() {
  console.log(chalk.dim('\n  Falling back to manual setup...\n'));
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'Choose another auth method:',
      choices: [
        { name: '🔑 Bearer Token', value: 'token' },
        { name: '🍪 Cookie String', value: 'cookies' },
        { name: '📄 cookies.txt file', value: 'cookiefile' },
      ],
    },
  ]);

  // Re-run with chosen method
  const fakeMethod = { method };
  // Inline the logic — delegate back by temporarily setting method
  if (method === 'token') {
    const { token } = await inquirer.prompt([{
      type: 'password', name: 'token', message: 'Paste your Bearer token:', mask: '*',
      validate: (v) => v.trim().length > 20 || 'Token too short',
    }]);
    await _saveToEnv({ ACCESS_TOKEN: token.trim() });
    return { method: 'token', value: token.trim() };
  }
  if (method === 'cookies') {
    const { cookies } = await inquirer.prompt([{
      type: 'input', name: 'cookies', message: 'Paste your cookie string:',
      validate: (v) => v.trim().includes('=') || 'Invalid cookie string',
    }]);
    await _saveToEnv({ COOKIE_STRING: cookies.trim() });
    return { method: 'cookies', value: cookies.trim() };
  }
  if (method === 'cookiefile') {
    const { filePath } = await inquirer.prompt([{
      type: 'input', name: 'filePath', message: 'Path to cookies.txt:', default: './udemy.cookies.txt',
    }]);
    await _saveToEnv({ COOKIE_FILE: filePath.trim() });
    return { method: 'cookiefile', value: filePath.trim() };
  }
}

// ─── .env Writer ─────────────────────────────────────────────────────────────

/**
 * Merge new key-value pairs into the .env file (create if doesn't exist).
 * @param {object} vars
 */
async function _saveToEnv(vars) {
  let existing = '';
  if (await fs.pathExists(ENV_PATH)) {
    existing = await fs.readFile(ENV_PATH, 'utf8');
  }

  const lines = existing.split('\n');
  const updatedKeys = new Set();

  // Update existing lines
  const updatedLines = lines.map((line) => {
    const [key] = line.split('=');
    const trimmedKey = key?.trim();
    if (trimmedKey && vars.hasOwnProperty(trimmedKey)) {
      updatedKeys.add(trimmedKey);
      return `${trimmedKey}=${vars[trimmedKey]}`;
    }
    return line;
  });

  // Append new keys
  for (const [key, value] of Object.entries(vars)) {
    if (!updatedKeys.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  await fs.outputFile(ENV_PATH, updatedLines.filter((l) => l !== undefined).join('\n'));

  // Update process.env in memory immediately
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = String(value);
  }

  // Refresh config cache
  require('../utils/config').reloadConfig();

  console.log(chalk.green(`\n  ✔  Credentials saved to .env\n`));
}


// ─── Settings Wizard ─────────────────────────────────────────────────────────

/**
 * Run the interactive settings configuration wizard.
 */
async function runSettingsWizard() {
  const currentConfig = require('../utils/config').getConfig();

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'quality',
      message: chalk.cyan('Preferred video quality:'),
      choices: ['360', '480', '720', '1080', '1440', '2160', 'best', 'worst'],
      default: currentConfig.quality,
    },
    {
      type: 'input',
      name: 'outputDir',
      message: chalk.cyan('Output directory:'),
      default: currentConfig.outputDir,
    },
    {
      type: 'input',
      name: 'concurrency',
      message: chalk.cyan('Simultaneous downloads (1-10):'),
      default: String(currentConfig.concurrency),
      validate: (v) => {
        const n = parseInt(v, 10);
        return (!isNaN(n) && n >= 1 && n <= 10) || 'Please enter a number between 1 and 10';
      },
    },
    {
      type: 'confirm',
      name: 'subtitles',
      message: chalk.cyan('Download subtitles?'),
      default: currentConfig.subtitles,
    },
    {
      type: 'confirm',
      name: 'downloadAssets',
      message: chalk.cyan('Download supplementary assets (PDFs, slides, source files)?'),
      default: currentConfig.downloadAssets,
    },
    {
      type: 'confirm',
      name: 'downloadArticles',
      message: chalk.cyan('Download article lectures (saved as .html files)?'),
      default: currentConfig.downloadArticles !== false,
    },
    {
      type: 'confirm',
      name: 'downloadQuizzes',
      message: chalk.cyan('Save quiz & practice test info (saved as .json bookmark files)?'),
      default: currentConfig.downloadQuizzes !== false,
    },
  ]);

  await _saveToEnv({
    QUALITY: answers.quality,
    OUTPUT_DIR: answers.outputDir,
    CONCURRENCY: answers.concurrency,
  });

  // Also update default.json directly to persist JSON fields
  const defaultJsonPath = path.resolve(process.cwd(), 'config', 'default.json');
  if (await fs.pathExists(defaultJsonPath)) {
    const json = await fs.readJson(defaultJsonPath);
    json.quality = answers.quality;
    json.outputDir = answers.outputDir;
    json.concurrency = parseInt(answers.concurrency, 10);
    json.subtitles = answers.subtitles;
    json.downloadAssets = answers.downloadAssets;
    json.downloadArticles = answers.downloadArticles;
    json.downloadQuizzes = answers.downloadQuizzes;
    await fs.writeJson(defaultJsonPath, json, { spaces: 2 });
  }

  // Refresh config cache
  require('../utils/config').applyOverrides(answers);

  console.log(chalk.green('\n  ✔  Settings updated and saved!'));
}

// ─── Helper: check if credentials exist ─────────────────────────────────────

/**
 * Check if auth credentials are already configured (.env or environment).
 * @returns {boolean}
 */
function credentialsExist() {
  return !!(
    process.env.ACCESS_TOKEN ||
    process.env.COOKIE_STRING ||
    process.env.COOKIE_FILE
  );
}

module.exports = { runSetupWizard, runSettingsWizard, credentialsExist };
