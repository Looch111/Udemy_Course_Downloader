'use strict';

/**
 * SubtitleHandler.js
 * Downloads subtitles (.vtt) for a lecture and optionally converts them to .srt.
 */

const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { fileExists } = require('../utils/fileSystem');

class SubtitleHandler {
  /**
   * @param {object} options
   * @param {string} [options.lang='en']        - Preferred subtitle language
   * @param {boolean} [options.skipExisting=true]
   */
  constructor({ lang = 'en', skipExisting = true } = {}) {
    this.lang = lang;
    this.skipExisting = skipExisting;
  }

  /**
   * Download subtitles for a lecture into the given directory.
   * Prefers the configured language; falls back to any available language.
   *
   * @param {Array}  captions    - Lecture's caption list from API
   * @param {string} outputDir   - Directory to save the subtitle file
   * @param {string} baseName    - Base filename (without extension)
   * @returns {Promise<string|null>} Path to downloaded subtitle, or null
   */
  async download(captions, outputDir, baseName) {
    if (!captions || captions.length === 0) {
      logger.debug('No subtitles available for this lecture.');
      return null;
    }

    // Find preferred language
    const targetLang = (this.lang || 'en').toLowerCase();
    let caption = captions.find(
      (c) => c.locale_id && c.locale_id.toLowerCase().startsWith(targetLang),
    );

    // Fallback to English, then first available
    if (!caption) {
      caption = captions.find((c) => c.locale_id && c.locale_id.toLowerCase().startsWith('en'));
    }
    if (!caption) {
      caption = captions[0];
    }

    if (!caption || !caption.url) {
      logger.debug('No downloadable subtitle URL found.');
      return null;
    }

    const lang = caption.locale_id || 'en';
    const vttPath = path.join(outputDir, `${baseName}.${lang}.vtt`);
    const srtPath = path.join(outputDir, `${baseName}.${lang}.srt`);

    if (this.skipExisting && (await fileExists(srtPath))) {
      logger.debug(`Subtitle already exists: ${path.basename(srtPath)}`);
      return srtPath;
    }

    try {
      logger.debug(`Downloading subtitle: ${caption.url}`);
      const response = await fetch(caption.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const vttContent = await response.text();
      await fs.outputFile(vttPath, vttContent, 'utf8');

      // Convert to SRT
      const srtContent = this._vttToSrt(vttContent);
      await fs.outputFile(srtPath, srtContent, 'utf8');

      // Remove the intermediate .vtt
      await fs.remove(vttPath);

      logger.debug(`Subtitle saved: ${path.basename(srtPath)}`);
      return srtPath;
    } catch (err) {
      logger.warn(`Failed to download subtitle: ${err.message}`);
      return null;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Format a single WebVTT timestamp (e.g. "01:23.450" or "00:01:23.450") into SRT format ("00:01:23,450").
   * @param {string} ts
   * @returns {string}
   */
  _formatTimestamp(ts) {
    const cleaned = ts.trim().replace(/\./g, ',');
    const parts = cleaned.split(':');
    if (parts.length === 2) {
      return `00:${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
    if (parts.length === 3) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2]}`;
    }
    return cleaned;
  }

  /**
   * Convert WebVTT content to SRT format.
   * @param {string} vtt
   * @returns {string}
   */
  _vttToSrt(vtt) {
    let counter = 1;
    const lines = vtt.replace(/\r\n/g, '\n').split('\n');
    const output = [];

    let i = 0;
    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) i++;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('-->')) {
        // Timestamp line
        const cleanedLine = line.replace(/\s+align:\S+|\s+position:\S+|\s+line:\S+|\s+size:\S+/g, '');
        const timeParts = cleanedLine.split('-->');

        if (timeParts.length === 2) {
          const start = this._formatTimestamp(timeParts[0]);
          const end = this._formatTimestamp(timeParts[1]);

          output.push(String(counter++));
          output.push(`${start} --> ${end}`);

          // Collect text lines
          i++;
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim().replace(/<[^>]+>/g, ''));
            i++;
          }
          output.push(textLines.join('\n'));
          output.push('');
        }
      }

      i++;
    }

    return output.join('\n');
  }
}

module.exports = SubtitleHandler;
