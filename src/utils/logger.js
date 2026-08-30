'use strict';

/**
 * logger.js
 * Centralized Winston logger with colorized console output.
 * Log level is driven by config (LOG_LEVEL env or default.json).
 */

const { createLogger, format, transports } = require('winston');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');

// Ensure logs directory exists
const LOG_DIR = path.resolve(process.cwd(), 'logs');
fs.ensureDirSync(LOG_DIR);

// ─── Custom Console Format ───────────────────────────────────────────────────

const LEVEL_COLORS = {
  error: chalk.bold.red,
  warn: chalk.bold.yellow,
  info: chalk.bold.cyan,
  http: chalk.magenta,
  debug: chalk.gray,
};

const consoleFormat = format.printf(({ level, message, timestamp }) => {
  const colorize = LEVEL_COLORS[level] || ((s) => s);
  const ts = chalk.dim(timestamp);
  const lvl = colorize(`[${level.toUpperCase().padEnd(5)}]`);
  return `${ts} ${lvl} ${message}`;
});

// ─── Logger Instance ─────────────────────────────────────────────────────────

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
  ),
  transports: [
    // Colorized console
    new transports.Console({
      format: format.combine(format.colorize({ all: false }), consoleFormat),
    }),
    // Persistent log file
    new transports.File({
      filename: path.join(LOG_DIR, 'udemy-dl.log'),
      format: format.combine(format.timestamp(), format.json()),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
    }),
    // Error-only file
    new transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
});

module.exports = logger;
