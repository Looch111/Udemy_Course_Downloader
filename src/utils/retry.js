'use strict';

/**
 * retry.js
 * Generic exponential-backoff retry utility.
 */

const logger = require('./logger');

/**
 * Execute an async function with exponential backoff retries.
 *
 * @param {Function} fn           - Async function to execute
 * @param {object}   [options]
 * @param {number}   [options.attempts=3]      - Max attempts
 * @param {number}   [options.delay=2000]      - Initial delay in ms
 * @param {number}   [options.factor=2]        - Backoff multiplier
 * @param {string}   [options.label='Task']    - Label for log messages
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
  const {
    attempts = 3,
    delay = 2000,
    factor = 2,
    label = 'Task',
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === attempts) break;

      logger.warn(
        `${label} failed (attempt ${attempt}/${attempts}): ${err.message}. ` +
        `Retrying in ${currentDelay}ms...`,
      );

      await sleep(currentDelay);
      currentDelay *= factor;
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError.message}`);
}

/**
 * Simple sleep/delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry, sleep };
