'use strict';

/**
 * fileSystem.js
 * Filesystem helpers: directory creation, existence checks, move with overwrite.
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * Ensure a directory exists (creates recursively).
 * @param {string} dirPath
 */
async function ensureDir(dirPath) {
  await fs.ensureDir(dirPath);
}

/**
 * Check if a file exists on disk.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the size of a file in bytes. Returns 0 if not found.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
async function fileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Compute the MD5 hash of a file (for integrity checks).
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Write JSON data to a file with pretty formatting.
 * @param {string} filePath
 * @param {object} data
 */
async function writeJson(filePath, data) {
  await fs.writeJson(filePath, data, { spaces: 2 });
}

/**
 * Read JSON from a file. Returns null if file doesn't exist.
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
async function readJson(filePath) {
  try {
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
}

/**
 * Resolve and normalize an output path to an absolute path.
 * @param {string} rawPath
 * @returns {string}
 */
function resolvePath(rawPath) {
  return path.resolve(process.cwd(), rawPath);
}

module.exports = {
  ensureDir,
  fileExists,
  fileSize,
  md5File,
  writeJson,
  readJson,
  resolvePath,
  path,
};
