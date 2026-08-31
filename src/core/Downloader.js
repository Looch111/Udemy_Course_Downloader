'use strict';

/**
 * Downloader.js
 * Main orchestrator for a full Udemy course download.
 *
 * Workflow:
 *  1. Resolve auth credentials
 *  2. Verify authentication
 *  3. Parse course URL → course ID
 *  4. Fetch full curriculum
 *  5. For each lecture (via QueueManager):
 *     a. Fetch detailed lecture data (with stream/download URLs)
 *     b. Download video via VideoDownloader
 *     c. Download subtitles via SubtitleHandler
 *     d. Download supplementary assets via AssetDownloader
 *  6. Write a course manifest (JSON) on completion
 */

const path = require('path');
const chalk = require('chalk');

const UdemyClient      = require('../api/UdemyClient');
const ENDPOINTS        = require('../api/endpoints');
const AuthManager      = require('./AuthManager');
const CourseParser     = require('./CourseParser');
const QueueManager     = require('./QueueManager');
const VideoDownloader  = require('../downloaders/VideoDownloader');
const AssetDownloader  = require('../downloaders/AssetDownloader');
const SubtitleHandler  = require('../downloaders/SubtitleHandler');
const ProgressManager  = require('../utils/progressBar');
const logger           = require('../utils/logger');
const { withRetry }    = require('../utils/retry');
const { ensureDir, writeJson, resolvePath } = require('../utils/fileSystem');
const { numberedName, sanitizeName }        = require('../utils/sanitize');

class Downloader {
  /**
   * @param {object} config  - Merged config from getConfig() + CLI overrides
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Execute the full download pipeline for a given Udemy course URL.
   * @param {string} courseUrl
   */
  async run(courseUrl) {
    const cfg = this.config;

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    logger.info(chalk.bold.cyan('🔐 Resolving authentication...'));

    const authMgr = new AuthManager({
      accessToken:  cfg.accessToken,
      cookieString: cfg.cookieString,
      cookieFile:   cfg.cookieFile,
      browser:      cfg.browser || null,
      ytDlpPath:    cfg.ytDlpPath,
      autoExtract:  true,
    });

    const authCredentials = await authMgr.resolve();
    // Store the browser name so VideoDownloader can use --cookies-from-browser
    const resolvedBrowser = authCredentials.browser || cfg.browser || null;
    this.client = new UdemyClient(authCredentials);

    // ── 2. Verify auth ───────────────────────────────────────────────────────
    logger.info('Verifying credentials...');
    const user = await this.client.verifyAuth();
    logger.info(chalk.green(`✔  Authenticated as: ${user.name} <${user.email}>`));

    // ── 3. Parse course ──────────────────────────────────────────────────────
    logger.info(chalk.bold.cyan('\n📚 Parsing course...'));

    const parser = new CourseParser(this.client);
    const slug = CourseParser.extractCourseSlug(courseUrl);
    const courseInfo = await parser.resolveCourse(slug);
    const { sections, totalLectures, courseId } = await parser.parseCurriculum(courseInfo.id);

    const courseTitle = sanitizeName(courseInfo.title);

    logger.info(chalk.green(
      `✔  Course: "${courseInfo.title}" — ${sections.length} sections, ${totalLectures} lectures`,
    ));

    // ── 4. Setup output directory ────────────────────────────────────────────
    const outputRoot = path.join(resolvePath(cfg.outputDir), courseTitle);
    await ensureDir(outputRoot);

    logger.info(`📁 Output: ${outputRoot}`);

    // ── 5. Initialize helpers ────────────────────────────────────────────────
    const progress = new ProgressManager();
    progress.start(totalLectures, courseInfo.title, cfg.concurrency);

    const queue = new QueueManager({ concurrency: cfg.concurrency });

    const assetDl = new AssetDownloader({
      skipExisting: cfg.skipExisting,
      authCredentials,
    });

    const subtitleHandler = new SubtitleHandler({
      lang: cfg.subtitleLang,
      skipExisting: cfg.skipExisting,
    });

    // Track stats
    const stats = {
      downloaded: 0,   // total successfully saved
      skipped: 0,      // already existed or disabled
      failed: 0,
      videos: 0,
      articles: 0,
      quizzes: 0,
    };

    // ── 6. Enqueue all lectures ──────────────────────────────────────────────
    logger.info(chalk.bold.cyan('\n⬇️  Starting downloads...\n'));

    const sectionTotal = sections.length;

    for (const section of sections) {
      const sectionDir = path.join(
        outputRoot,
        numberedName(section.index, sectionTotal, section.title),
      );
      await ensureDir(sectionDir);

      const lecTotal = section.lectures.length;

      for (const lecture of section.lectures) {
        const lectureDir = sectionDir;
        const lectureName = numberedName(lecture.index, lecTotal, lecture.title);

        queue.add(async () => {
          const bar = progress.acquireSlot(lecture.title);

          try {
            const result = await this._downloadLecture({
              courseId: courseInfo.id,
              lecture,
              lectureDir,
              lectureName,
              authCredentials,
              resolvedBrowser,
              cfg,
              assetDl,
              subtitleHandler,
              onProgress: (p) => {
                if (bar) bar.update(p.percent);
              },
            });

            const isSkipped = result && result.status === 'skipped';
            if (isSkipped) {
              stats.skipped++;
            } else {
              stats.downloaded++;
              if (lecture.isVideo)   stats.videos++;
              if (lecture.isArticle) stats.articles++;
              if (lecture.isQuiz)    stats.quizzes++;
            }
            progress.releaseSlot(lecture.title, isSkipped);
          } catch (err) {
            stats.failed++;
            logger.error(`✖  Failed: "${lecture.title}": ${err.message}`);
            progress.releaseSlot(lecture.title, false);
          }
        });
      }
    }

    // ── 7. Wait for all downloads ────────────────────────────────────────────
    await queue.drain();
    progress.stop();

    // ── 8. Write manifest ────────────────────────────────────────────────────
    const manifestPath = path.join(outputRoot, 'course-manifest.json');
    await writeJson(manifestPath, {
      id: courseId,
      title: courseInfo.title,
      downloadedAt: new Date().toISOString(),
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        lectures: s.lectures.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.assetType,
        })),
      })),
    });

    // ── 9. Final summary ─────────────────────────────────────────────────────
    this._printSummary(stats, totalLectures, courseInfo.title, outputRoot);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Download a single lecture (video + subtitles + assets).
   */
  async _downloadLecture({
    courseId, lecture, lectureDir, lectureName,
    authCredentials, resolvedBrowser, cfg, assetDl, subtitleHandler, onProgress,
  }) {
    // Check if asset stream/download URLs were already fetched in bulk during curriculum parsing
    let asset = lecture.asset?.rawAsset || lecture.asset || {};
    const hasStreams =
      (asset.stream_urls?.Video?.length > 0) ||
      (asset.streamUrls?.Video?.length > 0) ||
      (asset.download_urls?.Video?.length > 0) ||
      (asset.downloadUrls?.Video?.length > 0) ||
      (asset.stream_urls?.hls?.length > 0) ||
      (asset.streamUrls?.hls?.length > 0);

    // Only fetch single lecture detail if stream data was missing from bulk curriculum
    if (!hasStreams && lecture.isVideo) {
      try {
        const detail = await withRetry(
          () => this.client.get(ENDPOINTS.lectureDetail(courseId, lecture.id)),
          { attempts: cfg.retryAttempts, delay: cfg.retryDelay, label: `Lecture fetch [${lecture.title}]` },
        );
        if (detail && detail.asset) {
          asset = detail.asset;
        }
      } catch (err) {
        logger.debug(`Primary lecture detail fetch failed for "${lecture.title}": ${err.message}. Trying direct course fallback...`);
        try {
          const fallbackUrl = `https://www.udemy.com/api-2.0/courses/${courseId}/lectures/${lecture.id}/?fields[lecture]=id,title,asset,supplementary_assets&fields[asset]=id,asset_type,download_urls,stream_urls,external_url,slide_urls,filename,captions`;
          const detail = await this.client.get(fallbackUrl);
          if (detail && detail.asset) {
            asset = detail.asset;
          }
        } catch (fallbackErr) {
          logger.warn(`Lecture detail fetch failed for "${lecture.title}": ${fallbackErr.message}`);
        }
      }
    }

    let status = 'downloaded';

    if (lecture.isVideo) {
      // ── Video ────────────────────────────────────────────────────────────
      const streamUrl = this._resolveStreamUrl(asset, cfg.quality);

      if (!streamUrl) {
        logger.warn(`No stream URL found for: "${lecture.title}"`);
        return { status: 'skipped' };
      }

      const videoPath = path.join(lectureDir, `${lectureName}.mp4`);

      const videoDl = new VideoDownloader({
        quality:            cfg.quality,
        cookieString:       resolvedBrowser ? null : (authCredentials.cookieString || null),
        cookieFile:         resolvedBrowser ? null : (cfg.cookieFile || null),
        cookiesFromBrowser: resolvedBrowser || null,
        ytDlpPath:          cfg.ytDlpPath,
        ffmpegPath:         cfg.ffmpegPath,
        skipExisting:       cfg.skipExisting,
        onProgress,
      });

      const dlResult = await withRetry(
        () => videoDl.download(streamUrl, videoPath),
        { attempts: cfg.retryAttempts, delay: cfg.retryDelay, label: `Video [${lecture.title}]` },
      );

      if (dlResult && dlResult.status === 'skipped') {
        status = 'skipped';
      }

      await videoDl.cleanup();

      // ── Subtitles ────────────────────────────────────────────────────────
      if (cfg.subtitles) {
        const captions = asset.captions || lecture.asset?.captions || [];
        await subtitleHandler.download(captions, lectureDir, lectureName);
      }
    } else if (lecture.isArticle) {
      // ── Article — save as HTML if enabled ────────────────────────────────
      if (!cfg.downloadArticles) {
        logger.debug(`Skipping article (disabled): "${lecture.title}"`);
        status = 'skipped';
      } else {
        const fs = require('fs-extra');
        const articlePath = path.join(lectureDir, `${lectureName}.html`);
        const body = asset.body || asset.data || '';
        if (body) {
          if (cfg.skipExisting && (await fs.pathExists(articlePath))) {
            logger.debug(`Skipping existing article: ${path.basename(articlePath)}`);
            status = 'skipped';
          } else {
            await fs.outputFile(articlePath, body, 'utf8');
            logger.debug(`Article saved: ${path.basename(articlePath)}`);
          }
        } else {
          logger.debug(`No body content for article: "${lecture.title}"`);
          status = 'skipped';
        }
      }
    } else if (lecture.isQuiz) {
      // ── Quiz / Practice Test — save metadata as JSON if enabled ──────────
      if (!cfg.downloadQuizzes) {
        logger.debug(`Skipping quiz (disabled): "${lecture.title}"`);
        status = 'skipped';
      } else {
        const fs = require('fs-extra');
        const quizPath = path.join(lectureDir, `${lectureName}.json`);
        if (cfg.skipExisting && (await fs.pathExists(quizPath))) {
          logger.debug(`Skipping existing quiz: ${path.basename(quizPath)}`);
          status = 'skipped';
        } else {
          const quizData = {
            id: lecture.id,
            title: lecture.title,
            type: lecture.assetType || 'Quiz',
            note: 'Quiz/Practice content must be completed on Udemy.com — answers and questions are not exposed via the API.',
            udemy_url: `https://www.udemy.com/course/lecture/${lecture.id}/`,
          };
          await fs.outputJson(quizPath, quizData, { spaces: 2 });
          logger.debug(`Quiz info saved: ${path.basename(quizPath)}`);
        }
      }
    } else {
      // Unknown type — skip
      logger.debug(`Skipping unknown content type "${lecture.assetType}" for: "${lecture.title}"`);
      status = 'skipped';
    }

    // ── Supplementary Assets ─────────────────────────────────────────────
    if (cfg.downloadAssets && lecture.supplementaryAssets.length > 0) {
      const assetsDir = path.join(lectureDir, `${lectureName}_assets`);
      const downloaded = await assetDl.downloadAll(lecture.supplementaryAssets, assetsDir);
      if (downloaded.length > 0) {
        logger.debug(`  ${downloaded.length} assets saved for "${lecture.title}"`);
        // If assets were downloaded, we can count it as downloaded
        status = 'downloaded';
      }
    }

    return { status };
  }

  /**
   * Helper to parse height resolution from Udemy stream/download entry.
   * Handles Udemy's legacy code '1' for 1080p, explicit height numbers, and URL patterns.
   */
  _parseStreamHeight(entry) {
    if (!entry) return 0;
    const label = String(entry.label || '').trim();
    const file = String(entry.file || entry.url || '').toLowerCase();

    if (label === '1' || label === '1080' || file.includes('1080') || file.includes('syndication_1080')) {
      return 1080;
    }
    if (label === '2160' || file.includes('2160')) return 2160;
    if (label === '1440' || file.includes('1440')) return 1440;
    if (label === '720' || file.includes('720') || file.includes('webhd_720')) return 720;
    if (label === '480' || file.includes('480')) return 480;
    if (label === '360' || file.includes('360') || file.includes('webhd.')) return 360;

    const numeric = parseInt(label, 10);
    if (!isNaN(numeric) && numeric > 1) return numeric;
    return 0;
  }

  /**
   * Resolve the best stream URL from an asset for the configured quality.
   * Tries download_urls first, then stream_urls, HLS, media_sources, and external_url.
   * @param {object} asset
   * @param {string} quality
   * @returns {string|null}
   */
  _resolveStreamUrl(asset, quality) {
    const targetHeight = quality === 'best' ? 9999 : (quality === 'worst' ? 1 : parseInt(quality, 10));

    const getStreams = (obj, key1, key2) => obj?.[key1] || obj?.[key2] || null;

    // 1. Prefer direct download URLs (no DRM)
    const dlUrlsObj = getStreams(asset, 'download_urls', 'downloadUrls');
    const dlUrls = dlUrlsObj?.Video;
    if (dlUrls && Array.isArray(dlUrls) && dlUrls.length > 0) {
      const sorted = [...dlUrls]
        .filter((u) => u.label || u.file || u.url)
        .sort((a, b) => this._parseStreamHeight(b) - this._parseStreamHeight(a));

      const match = sorted.find((u) => this._parseStreamHeight(u) <= targetHeight);
      if (match) return match.file || match.url;
      if (sorted[0]) return sorted[0].file || sorted[0].url;
    }

    // 2. Fall back to stream URLs (Video)
    const stUrlsObj = getStreams(asset, 'stream_urls', 'streamUrls');
    const stUrls = stUrlsObj?.Video;
    if (stUrls && Array.isArray(stUrls) && stUrls.length > 0) {
      const sorted = [...stUrls]
        .filter((u) => u.label || u.file || u.url)
        .sort((a, b) => this._parseStreamHeight(b) - this._parseStreamHeight(a));

      const match = sorted.find((u) => this._parseStreamHeight(u) <= targetHeight);
      if (match) return match.file || match.url;
      if (sorted[0]) return sorted[0].file || sorted[0].url;
    }

    // 3. Fall back to HLS stream URLs
    const hlsUrls = stUrlsObj?.hls;
    if (hlsUrls && Array.isArray(hlsUrls) && hlsUrls.length > 0) {
      const sorted = [...hlsUrls]
        .filter((u) => u.label || u.file || u.url)
        .sort((a, b) => this._parseStreamHeight(b) - this._parseStreamHeight(a));

      const match = sorted.find((u) => this._parseStreamHeight(u) <= targetHeight);
      if (match) return match.file || match.url;
      if (hlsUrls[0]) return hlsUrls[0].file || hlsUrls[0].url;
    }

    // 4. Media sources array
    const mediaSources = getStreams(asset, 'media_sources', 'mediaSources');
    if (mediaSources && Array.isArray(mediaSources) && mediaSources.length > 0) {
      const first = mediaSources[0];
      if (first && (first.src || first.file)) return first.src || first.file;
    }

    // 5. External URL
    const externalUrl = asset.external_url || asset.externalUrl;
    if (externalUrl) {
      return externalUrl;
    }

    return null;
  }

  /**
   * Print a rich final summary.
   */
  _printSummary(stats, total, courseTitle, outputRoot) {
    console.log('\n');
    console.log(chalk.bold('━'.repeat(60)));
    console.log(chalk.bold.green('  ✅  Download Complete!'));
    console.log(chalk.bold('━'.repeat(60)));
    console.log(chalk.cyan(`  Course   : `) + chalk.white(courseTitle));
    console.log(chalk.cyan(`  Output   : `) + chalk.white(outputRoot));
    console.log(chalk.cyan(`  Total    : `) + chalk.white(`${total} curriculum items`));
    console.log(chalk.bold('─'.repeat(60)));
    console.log(chalk.green(`  Saved    : `) + chalk.white(`${stats.downloaded}`));
    if (stats.videos > 0)
      console.log(chalk.dim(`             • ${stats.videos} video(s)`));
    if (stats.articles > 0)
      console.log(chalk.dim(`             • ${stats.articles} article(s)`));
    if (stats.quizzes > 0)
      console.log(chalk.dim(`             • ${stats.quizzes} quiz/practice file(s)`));
    console.log(chalk.yellow(`  Skipped  : `) + chalk.white(`${stats.skipped}`));
    if (stats.failed > 0) {
      console.log(chalk.red(`  Failed   : `) + chalk.white(`${stats.failed}`));
    }
    console.log(chalk.bold('━'.repeat(60)));
    console.log(chalk.dim(`  Log file : ./logs/udemy-dl.log`));
    console.log(chalk.bold('━'.repeat(60)) + '\n');
  }
}

module.exports = Downloader;
