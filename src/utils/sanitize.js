'use strict';

/**
 * sanitize.js
 * Utilities for creating safe, filesystem-friendly filenames and paths.
 */

const sanitize = require('sanitize-filename');

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;
const MAX_LENGTH = 200;

/**
 * Sanitize a string for safe use as a filename or folder name.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return 'untitled';

  let clean = sanitize(name, { replacement: '_' })
    .replace(ILLEGAL_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (RESERVED_NAMES.test(clean)) {
    clean = `_${clean}`;
  }

  if (clean.length > MAX_LENGTH) {
    clean = clean.substring(0, MAX_LENGTH).trim();
  }

  return clean || 'untitled';
}

/**
 * Create a zero-padded index string for numbered ordering.
 * @param {number} index
 * @param {number} total
 * @returns {string}  e.g. "003" when total >= 100
 */
function padIndex(index, total = 999) {
  const digits = String(total).length;
  return String(index).padStart(Math.max(digits, 2), '0');
}

/**
 * Build a numbered folder/file name: "01-Section-Title"
 * @param {number} index
 * @param {number} total
 * @param {string} title
 * @returns {string}
 */
function numberedName(index, total, title) {
  return `${padIndex(index, total)}-${sanitizeName(title)}`;
}

module.exports = { sanitizeName, padIndex, numberedName };
