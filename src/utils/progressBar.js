'use strict';

/**
 * progressBar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A clean, flicker-free progress display powered by a timer-based render loop.
 *
 * HOW IT WORKS
 *  - One render loop fires every RENDER_INTERVAL_MS (100ms).
 *  - Each tick, it builds a multi-line string from the current state and calls
 *    logUpdate(), which erases the previous block and rewrites the same lines.
 *  - No cursor-movement math, no race conditions between concurrent updates.
 *
 * TTY FALLBACK
 *  - In non-TTY environments (pipes, CI), falls back to plain logger lines.
 */

const chalk    = require('chalk');
const logger   = require('./logger');

// log-update v4 is CommonJS compatible
const logUpdate = require('log-update');

const RENDER_INTERVAL_MS = 100;
const BAR_WIDTH          = 25;
const TITLE_MAX          = 38;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp and truncate a string to maxLen, padding with spaces if shorter. */
function fitTitle(str, maxLen) {
  if (!str) return ' '.repeat(maxLen);
  if (str.length > maxLen) return str.substring(0, maxLen - 1) + '…';
  return str.padEnd(maxLen);
}

/** Render a percentage bar as a fixed-width block string. */
function renderBar(pct) {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty  = BAR_WIDTH - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

/** Format a percentage number into a padded string like "  45.3%". */
function fmtPct(pct) {
  return `${pct.toFixed(1).padStart(5)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────

class ProgressManager {
  constructor() {
    this._isTTY       = false;
    this._timer       = null;

    // Overall course progress
    this._total       = 0;
    this._done        = 0;       // completed lectures (downloaded + skipped)
    this._courseTitle = '';

    // Concurrent slot state  [ { title, pct, idle } ]
    this._slots       = [];
  }

  /**
   * Start the render loop.
   * @param {number} totalLectures
   * @param {string} courseTitle
   * @param {number} concurrency
   */
  start(totalLectures, courseTitle, concurrency = 3) {
    this._total       = totalLectures;
    this._done        = 0;
    this._courseTitle = courseTitle;
    this._isTTY       = !!(process.stdout.isTTY && process.env.TERM !== 'dumb');

    if (!this._isTTY) {
      logger.info(`[Progress] Starting download of "${courseTitle}" (${totalLectures} items)...`);
      return;
    }

    // Build a fixed pool of slots (one per concurrent worker)
    this._slots = Array.from({ length: concurrency }, () => ({
      title: 'Idle',
      pct:   0,
      idle:  true,
    }));

    // Kick off render loop
    this._timer = setInterval(() => this._render(), RENDER_INTERVAL_MS);
    // Unref so the timer never prevents process.exit()
    if (this._timer.unref) this._timer.unref();

    // First paint
    this._render();
  }

  /**
   * Acquire a slot for a lecture. Returns a progress updater object.
   * @param {string} lectureTitle
   * @returns {{ update(pct: number): void }}
   */
  acquireSlot(lectureTitle) {
    if (!this._isTTY) {
      logger.info(`[Download] Starting: "${lectureTitle}"`);
      return { update: () => {} };
    }

    // Find a free slot; if none, create an overflow slot
    let slot = this._slots.find((s) => s.idle);
    if (!slot) {
      slot = { title: lectureTitle, pct: 0, idle: false };
      this._slots.push(slot);
    }

    slot.title = lectureTitle;
    slot.pct   = 0;
    slot.idle  = false;

    return {
      update: (pct) => {
        slot.pct = Math.min(100, Math.max(0, pct));
      },
    };
  }

  /**
   * Release a slot when a lecture finishes.
   * @param {string} lectureTitle  - must match what was passed to acquireSlot
   * @param {boolean} wasSkipped
   */
  releaseSlot(lectureTitle, wasSkipped) {
    this._done++;

    if (!this._isTTY) {
      const tag = wasSkipped ? 'Skipped' : 'Done';
      logger.info(`[${tag}] "${lectureTitle}" (${this._done}/${this._total})`);
      return;
    }

    // Mark slot idle
    const slot = this._slots.find((s) => !s.idle && s.title === lectureTitle);
    if (slot) {
      slot.pct  = 100;
      slot.idle = true;
      slot.title = 'Idle';
    }
  }

  /**
   * Stop the render loop and print the final static frame.
   */
  stop() {
    if (!this._isTTY) return;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    // Final frame — all done
    this._done = this._total;
    this._render();
    logUpdate.done();   // persist the last frame (no more erasure)
    console.log();      // blank line before summary
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Build and paint the full status block.
   */
  _render() {
    const lines = [];

    // ── Overall course bar ──────────────────────────────────────────────────
    const coursePct = this._total > 0
      ? (this._done / this._total) * 100
      : 0;

    const courseBar   = renderBar(coursePct);
    const coursePctS  = fmtPct(coursePct);
    const courseTitle = fitTitle(this._courseTitle, TITLE_MAX);

    lines.push(
      `  ${chalk.cyan('Course')}   ${courseBar} ${chalk.bold(coursePctS)} ${chalk.dim(courseTitle)}`,
    );

    // ── Per-slot lecture bars ───────────────────────────────────────────────
    for (const slot of this._slots) {
      if (slot.idle) {
        lines.push(
          `  ${chalk.dim('Lecture')}  ${renderBar(0)} ${chalk.dim('  0.0%')} ${chalk.dim('─'.padEnd(TITLE_MAX))}`,
        );
      } else {
        const bar   = renderBar(slot.pct);
        const pctS  = fmtPct(slot.pct);
        const title = fitTitle(slot.title, TITLE_MAX);
        lines.push(
          `  ${chalk.yellow('Lecture')}  ${bar} ${chalk.bold(pctS)} ${chalk.white(title)}`,
        );
      }
    }

    logUpdate(lines.join('\n'));
  }
}

module.exports = ProgressManager;
