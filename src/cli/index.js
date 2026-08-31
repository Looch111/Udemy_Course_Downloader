#!/usr/bin/env node
'use strict';

// Suppress Node.js deprecation and warning logs to keep the terminal interface clean
process.removeAllListeners('warning');

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║             UDEMY COURSE DOWNLOADER  — CLI Entry Point            ║
 * ║                   Professional Node.js Edition                    ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * Designed to be run with a single command:
 *   node src/cli/index.js
 *
 * If no flags are passed, it launches a beautiful interactive dashboard.
 * If flags (like --url) are passed, it runs directly for scripting/automation.
 */

const { program, Option } = require('commander');
const chalk = require('chalk');
const path = require('path');
const inquirer = require('inquirer');
require('dotenv').config();

const { version } = require('../../package.json');
const { getConfig, applyOverrides } = require('../utils/config');
const Downloader = require('../core/Downloader');
const logger = require('../utils/logger');
const { runSetupWizard, runSettingsWizard, credentialsExist } = require('./setup');
const UdemyClient = require('../api/UdemyClient');
const AuthManager = require('../core/AuthManager');
const DependencyChecker = require('../utils/DependencyChecker');

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.clear();
  const dateStr = new Date().toISOString().split('T')[0];
  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║  🎓  UDEMY COURSE DOWNLOADER                                ║
║      Created by : Kadiri Emmanuel                            ║
║      Version    : v${version.padEnd(41)}║
║      Date       : ${dateStr.padEnd(42)}║
║      Powered by : yt-dlp + Udemy API                         ║
╚══════════════════════════════════════════════════════════════╝
`));
}

// ─── CLI Options Definition ──────────────────────────────────────────────────

program
  .name('udemy-dl')
  .description('Professional Udemy course downloader (Interactive & CLI Modes)')
  .version(version, '-v, --version', 'Display current version')
  .option('-u, --url <url>', 'Udemy course URL')
  .option('-t, --token <token>', 'Udemy Bearer access token')
  .option('-c, --cookies <string>', 'Raw browser cookie string')
  .option('--cookie-file <path>', 'Path to a Netscape-format cookies.txt file')
  .addOption(
    new Option('--browser <browser>', 'Browser to auto-extract cookies from')
      .choices(['firefox', 'chrome', 'chromium', 'brave', 'edge'])
  )
  .addOption(
    new Option('-q, --quality <quality>', 'Video quality to download')
      .choices(['360', '480', '720', '1080', '1440', '2160', 'best', 'worst'])
      .default('1080'),
  )
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('-n, --concurrency <number>', 'Simultaneous downloads (1-10)', (v) => parseInt(v, 10), 3)
  .option('--no-subtitles', 'Skip subtitle downloads')
  .option('--subtitle-lang <lang>', 'Subtitle language code', 'en')
  .option('--no-assets', 'Skip supplementary asset downloads')
  .option('--no-skip', 'Re-download files even if they already exist')
  .option('--yt-dlp-path <path>', 'Custom path to the yt-dlp binary', 'yt-dlp')
  .option('--ffmpeg-path <path>', 'Custom path to the ffmpeg binary', 'ffmpeg')
  .addOption(
    new Option('-l, --log-level <level>', 'Log verbosity level')
      .choices(['error', 'warn', 'info', 'debug'])
      .default('info'),
  );

// ─── Interactive Dashboard ───────────────────────────────────────────────────

async function runInteractiveDashboard() {
  while (true) {
    printBanner();

    const config = getConfig();

    // Show current state
    console.log(chalk.dim('  Current Configuration:'));
    console.log(chalk.dim(`    • Quality     : ${config.quality}p`));
    console.log(chalk.dim(`    • Output Dir  : ${path.resolve(config.outputDir)}`));
    console.log(chalk.dim(`    • Concurrency : ${config.concurrency} files`));
    console.log(chalk.dim(`    • Subtitles   : ${config.subtitles ? 'Yes' : 'No'}`));
    console.log(chalk.dim(`    • Assets      : ${config.downloadAssets ? 'Yes' : 'No'}`));
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('What would you like to do?'),
        choices: [
          { name: `${chalk.bold.green('🚀  Download a Course')}       ${chalk.dim('(Paste link and start)')}`, value: 'download' },
          { name: `${chalk.yellow('⚙️   Configure Settings')}      ${chalk.dim('(Change folder, quality, concurrency)')}`, value: 'settings' },
          { name: `${chalk.yellow('🔐  Setup Credentials')}       ${chalk.dim('(Login token/cookies configuration)')}`, value: 'auth' },
          { name: `${chalk.yellow('🩺  Test Authentication')}     ${chalk.dim('(Check if your credentials work)')}`, value: 'test' },
          { name: `${chalk.red('❌  Exit')}`, value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      console.log(chalk.bold.green('\n  Goodbye! 👋\n'));
      process.exit(0);
    }

    try {
      if (action === 'download') {
        const { url } = await inquirer.prompt([
          {
            type: 'input',
            name: 'url',
            message: chalk.cyan('Paste the Udemy course URL:'),
            validate: (v) => v.includes('udemy.com/course/') || 'Please enter a valid Udemy course URL.',
          },
        ]);

        console.log('\n');
        const downloader = new Downloader(config);
        await downloader.run(url.trim());

        // Pause to let user read success message
        await inquirer.prompt([{ type: 'input', name: 'any', message: chalk.dim('Press Enter to return to menu...') }]);
      }

      else if (action === 'settings') {
        printBanner();
        await runSettingsWizard();
        await inquirer.prompt([{ type: 'input', name: 'any', message: chalk.dim('\nPress Enter to return to menu...') }]);
      }

      else if (action === 'auth') {
        printBanner();
        await runSetupWizard();
        await inquirer.prompt([{ type: 'input', name: 'any', message: chalk.dim('\nPress Enter to return to menu...') }]);
      }

      else if (action === 'test') {
        printBanner();
        console.log(chalk.cyan('🩺 Testing connection and credentials...'));

        const authMgr = new AuthManager({
          accessToken: config.accessToken,
          cookieString: config.cookieString,
          cookieFile: config.cookieFile,
          browser: config.browser,
        });

        const credentials = await authMgr.resolve();
        const client = new UdemyClient(credentials);

        const profile = await client.verifyAuth();
        console.log(chalk.green(`\n  ✅  Connection successful!`));
        console.log(chalk.white(`      Logged in as : ${profile.name}`));
        console.log(chalk.white(`      Email        : ${profile.email}`));
        console.log();

        await inquirer.prompt([{ type: 'input', name: 'any', message: chalk.dim('Press Enter to return to menu...') }]);
      }
    } catch (err) {
      console.error(chalk.bold.red(`\n  ✖  Error: ${err.message}`));
      await inquirer.prompt([{ type: 'input', name: 'any', message: chalk.dim('\nPress Enter to return to menu...') }]);
    }
  }
}

// ─── Direct Command Action (CLI Mode) ────────────────────────────────────────

program.action(async (options) => {
  printBanner();

  // Ensure system dependencies are installed and available
  try {
    const checker = new DependencyChecker();
    const binaries = await checker.ensureDependencies();
    applyOverrides({
      ytDlpPath: binaries.ytDlpPath,
      ffmpegPath: binaries.ffmpegPath,
    });
  } catch (depErr) {
    logger.warn(`Dependency check warning: ${depErr.message}`);
  }

  // If no URL is provided, launch the interactive dashboard!
  if (!options.url) {
    await runInteractiveDashboard();
    return;
  }

  applyOverrides({
    accessToken: options.token,
    cookieString: options.cookies,
    cookieFile: options.cookieFile,
    browser: options.browser,
    quality: options.quality,
    outputDir: options.output,
    concurrency: options.concurrency,
    subtitles: options.subtitles,
    subtitleLang: options.subtitleLang,
    downloadAssets: options.assets,
    skipExisting: options.skip,
    ytDlpPath: options.ytDlpPath,
    ffmpegPath: options.ffmpegPath,
    logLevel: options.logLevel,
  });

  const config = getConfig();
  logger.level = config.logLevel;

  const downloader = new Downloader(config);
  try {
    await downloader.run(options.url);
    process.exit(0);
  } catch (err) {
    logger.error(chalk.bold.red(`\n✖  Fatal: ${err.message}`));
    process.exit(1);
  }
});

// ─── Parse CLI ───────────────────────────────────────────────────────────────

program.parse(process.argv);
