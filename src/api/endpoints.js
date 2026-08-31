/**
 * endpoints.js
 * All Udemy API endpoint constants in one place.
 */

const BASE = 'https://www.udemy.com/api-2.0';

const ENDPOINTS = {
  /** Course detail by ID */
  courseDetail: (courseId) =>
    `${BASE}/courses/${courseId}/?fields[course]=id,title,description,url,image_480x270,num_lectures,num_sections`,

  /** Paginated curriculum for a course */
  curriculum: (courseId, page = 1, pageSize = 100) =>
    `${BASE}/courses/${courseId}/cached-subscriber-curriculum-items/?page_size=${pageSize}&page=${page}&fields[lecture]=id,title,object_index,asset,supplementary_assets&fields[chapter]=id,title,object_index,sort_order&fields[asset]=id,asset_type,time_estimation,download_urls,stream_urls,external_url,slide_urls,filename,captions&fields[quiz]=id,title,object_index,supplementary_assets&fields[practice]=id,title,object_index,supplementary_assets`,

  /** Single lecture detail */
  lectureDetail: (courseId, lectureId) =>
    `${BASE}/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=id,title,asset,supplementary_assets&fields[asset]=id,asset_type,download_urls,stream_urls,external_url,slide_urls,filename,captions`,

  /** User's subscribed courses */
  subscribedCourses: (page = 1) =>
    `${BASE}/users/me/subscribed-courses/?page=${page}&page_size=100&fields[course]=id,title,url`,

  /** Auth check */
  me: `${BASE}/users/me/`,
};

module.exports = ENDPOINTS;
