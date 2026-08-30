'use strict';

/**
 * AssetDownloader.js
 * Downloads supplementary assets (PDFs, zip archives, slides, etc.)
 * attached to a lecture.
 */

const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { sanitizeName } = require('../utils/sanitize');
const { fileExists, fileSize } = require('../utils/fileSystem');

class AssetDownloader {
  /**
   * @param {object} options
   * @param {boolean} [options.skipExisting=true]
   * @param {object} [options.authCredentials=null]
   */
  constructor({ skipExisting = true, authCredentials = null } = {}) {
    this.skipExisting = skipExisting;
    this.authCredentials = authCredentials;
  }

  /**
   * Download all supplementary assets for a lecture.
   * @param {Array}  assets     - Normalized supplementary asset list
   * @param {string} outputDir  - Directory to save assets
   * @returns {Promise<string[]>} Array of downloaded file paths
   */
  async downloadAll(assets, outputDir) {
    if (!assets || assets.length === 0) return [];

    const results = [];
    for (const asset of assets) {
      try {
        const filePath = await this.downloadOne(asset, outputDir);
        if (filePath) results.push(filePath);
      } catch (err) {
        logger.warn(`Asset download failed [${asset.title}]: ${err.message}`);
      }
    }
    return results;
  }

  /**
   * Download a single supplementary asset.
   * Resolves the best available download URL from the asset object.
   * @param {object} asset
   * @param {string} outputDir
   * @returns {Promise<string|null>}
   */
  async downloadOne(asset, outputDir) {
    const downloadUrl = this._resolveUrl(asset);

    if (!downloadUrl) {
      logger.debug(`No download URL for asset: ${asset.title}`);
      return null;
    }

    const filename = this._resolveFilename(asset, downloadUrl);
    const filePath = path.join(outputDir, filename);

    if (this.skipExisting && (await fileExists(filePath))) {
      const size = await fileSize(filePath);
      if (size > 0) {
        logger.debug(`Skipping existing asset: ${filename}`);
        return filePath;
      }
    }

    await fs.ensureDir(outputDir);

    logger.debug(`Downloading asset: ${filename}`);

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    };

    if (this.authCredentials?.accessToken) {
      headers['Authorization'] = `Bearer ${this.authCredentials.accessToken}`;
    }
    if (this.authCredentials?.cookieString) {
      headers['Cookie'] = this.authCredentials.cookieString;
    }

    const response = await fetch(downloadUrl, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for asset: ${asset.title}`);
    }

    const fileStream = fs.createWriteStream(filePath);

    try {
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', (err) => {
          fileStream.destroy();
          reject(err);
        });
        fileStream.on('finish', resolve);
        fileStream.on('error', (err) => {
          fileStream.destroy();
          reject(err);
        });
      });

      logger.debug(`Asset saved: ${filename}`);
      return filePath;
    } catch (err) {
      await fs.remove(filePath).catch(() => {});
      throw err;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Pick the best download URL from an asset object.
   * Priority: File download URL > external URL
   * @param {object} asset
   * @returns {string|null}
   */
  _resolveUrl(asset) {
    // File download URLs come as {File: [{file: url}], ...}
    const urls = asset.downloadUrls;
    if (urls) {
      for (const key of Object.keys(urls)) {
        const entries = urls[key];
        if (Array.isArray(entries) && entries.length > 0) {
          return entries[0].file || entries[0].url || null;
        }
      }
    }

    if (asset.externalUrl) return asset.externalUrl;

    return null;
  }

  /**
   * Determine a safe filename for the asset.
   * @param {object} asset
   * @param {string} url
   * @returns {string}
   */
  _resolveFilename(asset, url) {
    if (asset.filename) return sanitizeName(asset.filename);

    // Try to extract from URL
    try {
      const urlObj = new URL(url);
      const basename = path.basename(urlObj.pathname);
      if (basename && basename.includes('.')) return sanitizeName(basename);
    } catch { /* ignore */ }

    const ext = asset.type === 'File' ? '.pdf' : '.bin';
    return sanitizeName(asset.title || 'asset') + ext;
  }
}

module.exports = AssetDownloader;
