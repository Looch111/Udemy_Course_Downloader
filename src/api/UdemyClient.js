'use strict';

/**
 * UdemyClient.js
 * Axios-based HTTP client for the Udemy API.
 * Handles authentication headers, rate-limit detection, and structured error responses.
 */

const axios = require('axios');
const ENDPOINTS = require('./endpoints');
const logger = require('../utils/logger');

class UdemyClient {
  /**
   * @param {object} authConfig
   * @param {string} [authConfig.accessToken]  - Bearer token
   * @param {string} [authConfig.cookieString] - Raw browser cookie string
   */
  constructor(authConfig = {}) {
    this.authConfig = authConfig;
    const { accessToken, cookieString } = authConfig;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.udemy.com/',
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    if (cookieString) {
      headers['Cookie'] = cookieString;
    }

    if (!accessToken && !cookieString) {
      logger.warn('UdemyClient: No auth credentials provided. Requests may fail.');
    }

    this.client = axios.create({
      baseURL: 'https://www.udemy.com',
      timeout: 30_000,
      headers,
    });

    // Response interceptor for structured errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this._handleError(error),
    );
  }

  /**
   * Perform a GET request with automatic pagination support.
   * @param {string} url
   * @param {object} [params]
   * @returns {Promise<any>}
   */
  async get(url, params = {}) {
    logger.debug(`GET ${url}`);

    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }

    try {
      const response = await this.client.get(url, { params });
      return response.data;
    } catch (err) {
      // Fallback to Python if network error or Cloudflare 403 block occurs
      if (
        !err.response ||
        err.response.status === 403 ||
        err.message.includes('Network error') ||
        err.message.includes('ECONNRESET')
      ) {
        logger.debug(`Axios request failed (${err.message}). Falling back to Python HTTP...`);
        return await this._getViaPython(fullUrl);
      }
      throw err;
    }
  }

  /**
   * Python-based HTTP fallback for bypassing Cloudflare TLS fingerprinting blocks.
   * Python's urllib uses a different TLS stack that is not blocked by Cloudflare.
   * @param {string} requestUrl
   * @returns {Promise<any>}
   */
  async _getViaPython(requestUrl) {
    const { execFile } = require('child_process');
    const util = require('util');
    const execFilePromise = util.promisify(execFile);
    const fs = require('fs-extra');
    const os = require('os');
    const path = require('path');

    const fullTarget = requestUrl.startsWith('http')
      ? requestUrl
      : `https://www.udemy.com${requestUrl}`;

    const cookieString = this.authConfig?.cookieString || '';
    const accessToken = this.authConfig?.accessToken || '';

    // Build Python script with embedded headers/URL — avoids all shell escaping issues
    const cookieEscaped = cookieString.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const tokenEscaped = accessToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const urlEscaped = fullTarget.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const pyScript = `
import urllib.request, urllib.parse, json, ssl, sys

url = '${urlEscaped}'
cookie = '${cookieEscaped}'
token = '${tokenEscaped}'

def make_request(use_token):
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.udemy.com/',
        'X-Requested-With': 'XMLHttpRequest',
    }
    if cookie:
        headers['Cookie'] = cookie
    if use_token and token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, headers=headers)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return r.read()

try:
    # Prefer cookie-only auth (works with Udemy session cookies, avoids token 403)
    if cookie:
        try:
            result = make_request(use_token=False)
            sys.stdout.buffer.write(result)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and token:
                # Retry with token if cookie-only failed
                result = make_request(use_token=True)
                sys.stdout.buffer.write(result)
            else:
                raise
    else:
        result = make_request(use_token=bool(token))
        sys.stdout.buffer.write(result)
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')[:300]
    err_json = json.dumps({'__error__': True, 'status': e.code, 'detail': body})
    sys.stdout.buffer.write(err_json.encode('utf-8'))
except Exception as e:
    err_json = json.dumps({'__error__': True, 'status': 0, 'detail': str(e)})
    sys.stdout.buffer.write(err_json.encode('utf-8'))
`;

    const tmpScript = path.join(os.tmpdir(), `udemy-req-${Date.now()}.py`);

    try {
      await fs.outputFile(tmpScript, pyScript, 'utf8');

      const { stdout } = await execFilePromise('python3', [tmpScript], {
        maxBuffer: 15 * 1024 * 1024,
        timeout: 30000,
      });

      if (!stdout || !stdout.trim()) {
        throw new Error('Empty response from Python HTTP request');
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (jsonErr) {
        throw new Error(`Failed to parse Udemy response as JSON. Response snippet: ${stdout.trim().substring(0, 200)}`);
      }

      if (parsed && parsed.__error__) {
        throw new Error(`HTTP ${parsed.status}: ${parsed.detail}`);
      }

      return parsed;
    } catch (pyErr) {
      throw new Error(`Python HTTP fallback failed: ${pyErr.message}`);
    } finally {
      await fs.remove(tmpScript).catch(() => {});
    }
  }

  /**
   * Fetch all pages of a paginated endpoint and return merged results.
   * @param {Function} urlFn - Function that takes page number and returns URL
   * @returns {Promise<Array>}
   */
  async getAll(urlFn) {
    const allResults = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = urlFn(page);
      const data = await this.get(url);

      if (data.results && Array.isArray(data.results)) {
        allResults.push(...data.results);
        hasMore = data.next !== null && data.results.length > 0;
      } else {
        hasMore = false;
      }

      page++;
    }

    return allResults;
  }

  /**
   * Verify authentication by hitting the /me endpoint.
   * @returns {Promise<{id: number, name: string, email: string}>}
   */
  async verifyAuth() {
    try {
      const data = await this.get(ENDPOINTS.me);
      const name = data.display_name || data.title || data.name || 'Udemy User';
      const email = data.email ? `<${data.email}>` : '';
      return {
        id: data.id,
        name,
        email,
      };
    } catch (err) {
      throw new Error(`Authentication failed: ${err.message}`);
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const detail = data?.detail || data?.message || JSON.stringify(data);

      if (status === 401 || status === 403) {
        throw new Error(
          `[${status}] Unauthorized — Check your access token or cookies.\n  Detail: ${detail}`,
        );
      }
      if (status === 429) {
        throw new Error(`[429] Rate limited by Udemy. Please wait before retrying.`);
      }
      if (status === 404) {
        throw new Error(`[404] Resource not found: ${error.config?.url}`);
      }

      throw new Error(`[${status}] Udemy API error: ${detail}`);
    }

    if (error.request) {
      throw new Error(`Network error — No response received: ${error.message}`);
    }

    throw error;
  }
}

module.exports = UdemyClient;
