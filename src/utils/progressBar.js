'use strict';

/**
 * progressBar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A clean, flicker-free, single-location progress display for Udemy Downloader.
 *
 * FEATURES:
 *  - Dynamic width calculation based on terminal columns (prevents line wrapping).
 *  - Intercepts stdout writes to clear active progress block before logging,
 *    preventing duplicate stacked progress lines.
 *  - Sleek, modern styling for overall course progress and active worker slots.
 */

const chalk     = require('chalk');
const logUpdate = require('log-update');
const logger    = require('./logger');

const RENDER_INTERVAL_MS = 100;
const BAR_WIDTH          = 20;

class ProgressManager {
  constructor() {
    this._isTTY              = false;
    this._timer              = null;
    this._isRendering        = false;
    this._originalStdoutWrite = null;

    // Overall course progress
    this._total       = 0;
    this._done        = 0;
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

    // Intercept stdout to clear progress box before any logger write
    this._originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
      if (this._timer && !this._isRendering) {
        this._isRendering = true;
        try {
          logUpdate.clear();
        } catch (_) {}
        this._isRendering = false;
      }
      return this._originalStdoutWrite(chunk, encoding, callback);
    };

    // Build fixed pool of worker slots
    this._slots = Array.from({ length: concurrency }, () => ({
      title: 'Idle',
      pct:   0,
      idle:  true,
    }));

    // Kick off render loop
    this._timer = setInterval(() => this._render(), RENDER_INTERVAL_MS);
    if (this._timer.unref) this._timer.unref();

    this._render();
  }

  /**
   * Acquire a slot for a lecture.
   * @param {string} lectureTitle
   * @returns {{ update(pct: number): void }}
   */
  acquireSlot(lectureTitle) {
    if (!this._isTTY) {
      logger.info(`[Download] Starting: "${lectureTitle}"`);
      return { update: () => {} };
    }

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
   * @param {string} lectureTitle
   * @param {boolean} wasSkipped
   */
  releaseSlot(lectureTitle, wasSkipped) {
    this._done++;

    if (!this._isTTY) {
      const tag = wasSkipped ? 'Skipped' : 'Done';
      logger.info(`[${tag}] "${lectureTitle}" (${this._done}/${this._total})`);
      return;
    }

    const slot = this._slots.find((s) => !s.idle && s.title === lectureTitle);
    if (slot) {
      slot.pct   = 100;
      slot.idle  = true;
      slot.title = 'Idle';
    }
  }

  /**
   * Stop the render loop and unhook stdout.
   */
  stop() {
    if (!this._isTTY) return;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    this._done = this._total;
    this._render();
    logUpdate.done();

    // Restore original stdout.write
    if (this._originalStdoutWrite) {
      process.stdout.write = this._originalStdoutWrite;
      this._originalStdoutWrite = null;
    }

    console.log(); // Blank line before summary
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _renderBar(pct) {
    const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * BAR_WIDTH);
    const empty  = BAR_WIDTH - filled;
    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  }

  _fitText(text, maxLen) {
    if (!text) return ' '.repeat(maxLen);
    if (text.length > maxLen) {
      return text.substring(0, maxLen - 1) + '…';
    }
    return text.padEnd(maxLen);
  }

  _render() {
    if (this._isRendering) return;
    this._isRendering = true;

    try {
      const termCols = Math.max(50, (process.stdout.columns || 80) - 2);
      const lines = [];

      // ── Course Progress Line ──────────────────────────────────────────────
      const coursePct = this._total > 0 ? (this._done / this._total) * 100 : 0;
      const courseBar = this._renderBar(coursePct);
      const coursePctStr = `${coursePct.toFixed(1).padStart(5)}%`;

      const coursePrefix = `  ${chalk.cyan.bold('Course')}   ${courseBar} ${chalk.bold(coursePctStr)} `;
      const courseMeta   = `(${this._done}/${this._total}) ${this._courseTitle}`;
      const courseAvail  = Math.max(5, termCols - 42);
      const courseFit    = this._fitText(courseMeta, courseAvail);

      lines.push(`${coursePrefix}${chalk.dim(courseFit)}`);

      // ── Per-Slot Worker Lines ─────────────────────────────────────────────
      this._slots.forEach((slot, idx) => {
        const slotLabel = `  ${chalk.yellow(`Slot ${idx + 1}`)}   `;
        if (slot.idle) {
          const emptyBar = this._renderBar(0);
          const idleMeta = 'Idle';
          const avail    = Math.max(5, termCols - 42);
          const fit      = this._fitText(idleMeta, avail);
          lines.push(`${slotLabel}${emptyBar} ${chalk.dim('  0.0%')} ${chalk.dim(fit)}`);
        } else {
          const slotBar = this._renderBar(slot.pct);
          const slotPctStr = `${slot.pct.toFixed(1).padStart(5)}%`;
          const avail = Math.max(5, termCols - 42);
          const fit   = this._fitText(slot.title, avail);
          lines.push(`${slotLabel}${slotBar} ${chalk.bold(slotPctStr)} ${chalk.white(fit)}`);
        }
      });

      logUpdate(lines.join('\n'));
    } catch (_) {
      // Ignore intermittent render glitches
    } finally {
      this._isRendering = false;
    }
  }
}

module.exports = ProgressManager;
