'use strict';

/**
 * QueueManager.js
 * Concurrency-limited async queue built on p-queue.
 * All download tasks run through this queue to respect the configured concurrency limit.
 */

const _PQueueModule = require('p-queue');
const PQueue = _PQueueModule.default || _PQueueModule;
const logger = require('../utils/logger');

class QueueManager {
  /**
   * @param {object} options
   * @param {number} [options.concurrency=3]
   */
  constructor({ concurrency = 3 } = {}) {
    this.concurrency = concurrency;
    this._queue = new PQueue({ concurrency });

    this._taskCount = 0;
    this._completedCount = 0;

    this._queue.on('idle', () => {
      logger.debug(`Queue idle. Completed ${this._completedCount} tasks.`);
    });
  }

  /**
   * Add an async task to the queue.
   * @param {Function} task - Async function to execute
   * @param {object}  [opts]
   * @param {number}  [opts.priority=0] - Higher = sooner
   * @returns {Promise<any>}
   */
  add(task, opts = {}) {
    this._taskCount++;
    const taskId = this._taskCount;
    const priority = opts.priority || 0;

    return this._queue.add(async () => {
      logger.debug(`Queue: starting task #${taskId}`);
      try {
        const result = await task();
        this._completedCount++;
        logger.debug(`Queue: completed task #${taskId} (${this._completedCount}/${this._taskCount})`);
        return result;
      } catch (err) {
        logger.error(`Queue: task #${taskId} failed: ${err.message}`);
        throw err;
      }
    }, { priority });
  }

  /**
   * Wait for all currently queued tasks to complete.
   * @returns {Promise<void>}
   */
  async drain() {
    await this._queue.onIdle();
  }

  /**
   * Current number of tasks waiting + running.
   * @returns {number}
   */
  get size() {
    return this._queue.size + this._queue.pending;
  }

  /**
   * Pause the queue (in-flight tasks complete; new ones wait).
   */
  pause() {
    this._queue.pause();
    logger.debug('Queue paused.');
  }

  /**
   * Resume a paused queue.
   */
  resume() {
    this._queue.start();
    logger.debug('Queue resumed.');
  }
}

module.exports = QueueManager;
