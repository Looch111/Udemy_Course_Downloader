'use strict';

/**
 * CourseParser.js
 * Fetches and normalizes the full Udemy course curriculum into a structured tree:
 *
 *   Course
 *   └── Section[]
 *       └── Lecture[] { id, title, type, asset, supplementaryAssets }
 *
 * Handles pagination automatically.
 */

const ENDPOINTS = require('../api/endpoints');
const logger = require('../utils/logger');

/** Asset types that represent downloadable video */
const VIDEO_TYPES = new Set(['Video', 'Video Mash', 'ExternalLink']);

class CourseParser {
  /**
   * @param {UdemyClient} client
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Extract the course slug or numeric course ID from a Udemy course URL.
   * Supports slug-based, numeric ID, draft, and /course-dashboard-redirect/ URLs.
   * @param {string} url
   * @returns {string} courseSlug or courseId
   */
  static extractCourseSlug(url) {
    const redirectMatch = url.match(/course_id=(\d+)/i);
    if (redirectMatch) return redirectMatch[1];

    const draftMatch = url.match(/udemy\.com\/course\/draft\/(\d+)/i);
    if (draftMatch) return draftMatch[1];

    const slugMatch = url.match(/udemy\.com\/course\/([^/?#]+)/i);
    if (slugMatch) return slugMatch[1];

    const numericMatch = url.match(/udemy\.com\/(\d+)/i);
    if (numericMatch) return numericMatch[1];

    throw new Error(
      `Cannot extract course slug from URL: ${url}\n` +
      'Expected format: https://www.udemy.com/course/<course-slug>/',
    );
  }

  /**
   * Resolve course slug to numeric course ID via the course detail API.
   * @param {string} slug
   * @returns {Promise<{id: number, title: string}>}
   */
  async resolveCourse(slug) {
    logger.debug(`Resolving course slug/id: ${slug}`);

    // If slug is numeric, fetch directly by ID
    if (/^\d+$/.test(slug)) {
      try {
        const detailUrl = ENDPOINTS.courseDetail(slug);
        const data = await this.client.get(detailUrl);
        if (data && data.id) {
          logger.debug(`Resolved numeric ID → id=${data.id}, title="${data.title}"`);
          return data;
        }
      } catch (e) {
        logger.debug(`Direct ID lookup failed for "${slug}": ${e.message}`);
      }
    }

    // Primary: Search user's subscribed (purchased) courses by slug keyword
    // This is the most reliable endpoint since the user must be enrolled anyway
    try {
      const searchTerm = slug.replace(/-/g, ' ').split(' ').slice(0, 3).join(' ');
      const subscribedUrl = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/?search=${encodeURIComponent(searchTerm)}&fields[course]=id,title,url&page_size=20&ordering=title`;
      const data = await this.client.get(subscribedUrl);
      if (data.results && data.results.length > 0) {
        // Try exact slug match first
        const exactMatch = data.results.find((c) =>
          c.url && c.url.includes(slug),
        );
        const course = exactMatch || data.results[0];
        logger.debug(`Resolved via subscribed courses → id=${course.id}, title="${course.title}"`);
        return course;
      }
    } catch (e) {
      logger.debug(`Subscribed course search failed for "${slug}": ${e.message}`);
    }

    // Fallback: try all subscribed courses if keyword search failed
    try {
      const allSubUrl = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/?fields[course]=id,title,url&page_size=50&ordering=title`;
      const data = await this.client.get(allSubUrl);
      if (data.results && data.results.length > 0) {
        const match = data.results.find((c) => c.url && c.url.includes(slug));
        if (match) {
          logger.debug(`Resolved via full subscribed courses list → id=${match.id}, title="${match.title}"`);
          return match;
        }
      }
    } catch (e) {
      logger.debug(`Full subscribed courses list failed: ${e.message}`);
    }

    // Fallback: slug lookup via url_name query on public courses endpoint
    const url = `https://www.udemy.com/api-2.0/courses/?url_name=${encodeURIComponent(slug)}&fields[course]=id,title,url`;
    try {
      const data = await this.client.get(url);
      if (data.results && data.results.length > 0) {
        const course = data.results[0];
        logger.debug(`Resolved via public courses endpoint → id=${course.id}, title="${course.title}"`);
        return course;
      }
    } catch (e) {
      logger.debug(`Public courses slug lookup failed for "${slug}": ${e.message}`);
    }

    // Last fallback: try direct course detail ID lookup
    try {
      const detailUrl = ENDPOINTS.courseDetail(slug);
      const data = await this.client.get(detailUrl);
      if (data && data.id) {
        logger.debug(`Resolved via fallback detail endpoint → id=${data.id}, title="${data.title}"`);
        return data;
      }
    } catch { /* ignore */ }

    throw new Error(
      `Course not found for slug/ID "${slug}".\n` +
      '  Make sure you are enrolled/purchased and your auth credentials are valid.\n' +
      `  Searched for: "${slug}"`,
    );
  }

  /**
   * Fetch the full curriculum for a course.
   * @param {number|string} courseId
   * @returns {Promise<ParsedCourse>}
   */
  async parseCurriculum(courseId) {
    logger.info(`Fetching curriculum for course ID: ${courseId}`);

    const allItems = await this.client.getAll(
      (page) => ENDPOINTS.curriculum(courseId, page, 100),
    );

    logger.debug(`Total curriculum items fetched: ${allItems.length}`);

    return this._buildCourseTree(courseId, allItems);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Transform flat curriculum items into a nested Course → Section → Lecture tree.
   * @param {number} courseId
   * @param {Array}  items
   * @returns {ParsedCourse}
   */
  _buildCourseTree(courseId, items) {
    const sections = [];
    let currentSection = null;
    let sectionIndex = 0;

    for (const item of items) {
      if (item._class === 'chapter') {
        sectionIndex++;
        currentSection = {
          id: item.id,
          index: sectionIndex,
          title: item.title,
          lectures: [],
        };
        sections.push(currentSection);
      } else if (item._class === 'lecture' || item._class === 'quiz' || item._class === 'practice') {
        if (!currentSection) {
          // Lectures before any section — create an implicit one
          currentSection = {
            id: 0,
            index: 0,
            title: 'Introduction',
            lectures: [],
          };
          sections.push(currentSection);
        }

        currentSection.lectures.push(this._normalizeLecture(item));
      }
    }

    const totalLectures = sections.reduce((sum, s) => sum + s.lectures.length, 0);

    logger.info(`Parsed ${sections.length} sections, ${totalLectures} lectures.`);

    return {
      courseId,
      sections,
      totalLectures,
    };
  }

  /**
   * Normalize a raw lecture item into our standard shape.
   * @param {object} item
   * @returns {NormalizedLecture}
   */
  _normalizeLecture(item) {
    const asset = item.asset || {};
    let assetType = asset.asset_type || 'Unknown';
    const isQuiz = item._class === 'quiz' || item._class === 'practice';
    if (isQuiz && assetType === 'Unknown') {
      assetType = 'Quiz';
    }

    return {
      id: item.id,
      index: item.object_index || 0,
      title: item.title || `${isQuiz ? 'Quiz' : 'Lecture'} ${item.id}`,
      isVideo: VIDEO_TYPES.has(assetType),
      isArticle: assetType === 'Article',
      isQuiz,
      assetType,
      asset: {
        id: asset.id,
        type: assetType,
        downloadUrls: asset.download_urls || {},
        streamUrls: asset.stream_urls || {},
        externalUrl: asset.external_url || null,
        filename: asset.filename || null,
        captions: asset.captions || [],
        rawAsset: asset,
      },
      supplementaryAssets: (item.supplementary_assets || []).map((sa) => ({
        id: sa.id,
        title: sa.title || sa.filename,
        type: sa.asset_type,
        filename: sa.filename || null,
        downloadUrls: sa.download_urls || {},
        externalUrl: sa.external_url || null,
      })),
    };
  }
}

module.exports = CourseParser;
