'use strict';

/**
 * VideoDownloader.js
 * Wraps yt-dlp to download Udemy lecture videos.
 *
 * Handles:
 *  - Quality/format selection
 *  - Cookie passing to yt-dlp
 *  - Resume (--continue)
 *  - Progress parsing from yt-dlp stdout
 *  - Post-processing (merging audio+video via ffmpeg)
 */

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { fileExists, fileSize } = require('../utils/fileSystem');

/**
 * Map human-readable quality strings to yt-dlp format selectors.
 */
const QUALITY_FORMATS = {
  '2160': 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160]',
  '1440': 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440]',
  '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]',
  '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]',
  '480':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]',
  '360':  'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]',
  'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
  'worst':'worstvideo+worstaudio/worst',
};

class VideoDownloader {
  /**
   * @param {object} options
   * @param {string}  [options.quality='1080']
   * @param {string}  [options.cookieString]        - Cookie header value for yt-dlp
   * @param {string}  [options.cookieFile]          - Path to Netscape cookies.txt for yt-dlp
   * @param {string}  [options.cookiesFromBrowser]  - Browser name for --cookies-from-browser flag
   *                                                  e.g. 'firefox', 'chrome', 'brave'
   * @param {string}  [options.ytDlpPath='yt-dlp']
   * @param {string}  [options.ffmpegPath='ffmpeg']
   * @param {boolean} [options.skipExisting=true]
   * @param {Function}[options.onProgress]          - Progress callback: ({percent, speed, eta}) => void
   */
  constructor({
    quality = '1080',
    cookieString = null,
    cookieFile = null,
    cookiesFromBrowser = null,
    ytDlpPath = 'yt-dlp',
    ffmpegPath = 'ffmpeg',
    skipExisting = true,
    onProgress = null,
  } = {}) {
    this.quality = quality;
    this.cookieString = cookieString;
    this.cookieFile = cookieFile;
    this.cookiesFromBrowser = cookiesFromBrowser; // e.g. 'firefox' | 'chrome'
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.skipExisting = skipExisting;
    this.onProgress = onProgress;

    this._tempCookieFile = null;
  }

  /**
   * Download a video lecture to the specified output path.
   *
   * @param {string} videoUrl     - Direct stream URL or Udemy lecture URL
   * @param {string} outputPath   - Full output file path (e.g. /downloads/.../001-title.mp4)
   * @returns {Promise<string>}   - Resolved output path
   */
  async download(videoUrl, outputPath) {
    if (this.skipExisting) {
      const exists = await fileExists(outputPath);
      const size = exists ? await fileSize(outputPath) : 0;
      if (exists && size > 0) {
        logger.debug(`Skipping existing video: ${path.basename(outputPath)}`);
        return { status: 'skipped', outputPath };
      }
    }

    await fs.ensureDir(path.dirname(outputPath));

    const args = this._buildArgs(videoUrl, outputPath);
    logger.debug(`yt-dlp args: ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const stderrLines = [];

      proc.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (this.onProgress) {
          const parsed = this._parseProgress(line);
          if (parsed) this.onProgress(parsed);
        }
        logger.debug(`yt-dlp: ${line}`);
      });

      proc.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) {
          stderrLines.push(line);
          logger.debug(`yt-dlp stderr: ${line}`);
        }
      });

      proc.on('close', async (code) => {
        await this._cleanupTempCookie();

        if (code === 0) {
          resolve({ status: 'downloaded', outputPath });
        } else {
          const errMsg = stderrLines.length > 0 ? stderrLines.slice(-5).join('\n  ') : 'No stderr output';
          reject(new Error(`yt-dlp exited with code ${code} for: ${videoUrl}\n  ${errMsg}`));
        }
      });

      proc.on('error', async (err) => {
        await this._cleanupTempCookie();

        if (err.code === 'ENOENT') {
          reject(
            new Error(
              `yt-dlp not found at path: "${this.ytDlpPath}"\n` +
              'Install it with: pip install yt-dlp  or  sudo apt install yt-dlp',
            ),
          );
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Clean up resources (temp cookie file if created).
   */
  async cleanup() {
    await this._cleanupTempCookie();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Build the yt-dlp argument array.
   * @param {string} url
   * @param {string} outputPath
   * @returns {string[]}
   */
  _buildArgs(url, outputPath) {
    const isDirectMp4 = url.includes('.mp4?') || url.includes('.mp4');
    const format = isDirectMp4
      ? 'b/best'
      : (QUALITY_FORMATS[this.quality] || QUALITY_FORMATS['1080']);

    const args = [
      url,
      '--format', format,
      '--output', outputPath,
      '--no-playlist',
      '--continue',              // Resume incomplete downloads
      '--no-overwrites',
      '--merge-output-format', 'mp4',
      '--retries', '3',
      '--fragment-retries', '3',
      '--concurrent-fragments', '4',
      '--add-metadata',
      '--progress',
      '--newline',               // One progress line per update (parseable)
      '--no-warnings',
    ];

    if (!isDirectMp4) {
      args.push('--embed-thumbnail');
    }

    if (this.ffmpegPath && this.ffmpegPath !== 'ffmpeg') {
      args.push('--ffmpeg-location', this.ffmpegPath);
    }

    // Cookie authentication for yt-dlp
    // Priority: --cookies-from-browser > cookie file > cookie string (temp file)
    if (this.cookiesFromBrowser) {
      // Best option: let yt-dlp handle cookie extraction + decryption natively
      args.push('--cookies-from-browser', this.cookiesFromBrowser);
    } else if (this.cookieFile) {
      args.push('--cookies', this.cookieFile);
    } else if (this.cookieString) {
      // Write cookies to a temp Netscape file (yt-dlp doesn't accept raw strings)
      const tempFile = this._createTempCookieFile(this.cookieString);
      args.push('--cookies', tempFile);
    }

    return args;
  }

  /**
   * Write a Netscape cookies.txt from a raw cookie string.
   * @param {string} cookieString
   * @returns {string} Path to temp file
   */
  _createTempCookieFile(cookieString) {
    const os = require('os');
    const tempPath = path.join(os.tmpdir(), `udemy-cookies-${Date.now()}.txt`);

    const lines = ['# Netscape HTTP Cookie File', '# Generated by udemy-dl'];
    const pairs = cookieString.split(';').map((p) => p.trim());

    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      // domain flag path secure expiry name value
      lines.push(`.udemy.com\tTRUE\t/\tFALSE\t9999999999\t${name}\t${value}`);
    }

    fs.outputFileSync(tempPath, lines.join('\n'));
    this._tempCookieFile = tempPath;
    return tempPath;
  }

  async _cleanupTempCookie() {
    if (this._tempCookieFile) {
      await fs.remove(this._tempCookieFile).catch(() => {});
      this._tempCookieFile = null;
    }
  }

  /**
   * Parse a yt-dlp progress line.
   * Example: [download]  45.3% of 234.56MiB at 2.30MiB/s ETA 01:42
   * @param {string} line
   * @returns {{percent: number, speed: string, eta: string}|null}
   */
  _parseProgress(line) {
    const match = line.match(
      /\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\S+\s+at\s+([\d.]+\S+)\s+ETA\s+([\d:]+)/,
    );
    if (!match) return null;

    return {
      percent: parseFloat(match[1]),
      speed: match[2],
      eta: match[3],
    };
  }
}

module.exports = VideoDownloader;
