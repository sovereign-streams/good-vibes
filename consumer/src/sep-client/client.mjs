/**
 * SEP Client — Stream Exchange Protocol client for querying providers.
 *
 * Handles all SEP endpoints: manifest, query, telemetry, browse.
 * Includes retry with exponential backoff, timeout handling,
 * and response validation against SEP schemas.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '../lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, '..', '..', '..', 'spec', '2026-02-28');

export class SEPClient {
  /**
   * @param {string} baseUrl - Provider base URL (e.g., "http://localhost:3700")
   * @param {object} [options]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.maxRetries]
   * @param {function} [options.validator] - Optional response validator
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || Config.requestTimeoutMs;
    this.maxRetries = options.maxRetries ?? Config.maxRetries;
    this.validator = options.validator || null;
    this._manifest = null;
  }

  /**
   * GET /sep/manifest — Fetch provider manifest.
   *
   * @returns {object} Provider manifest
   */
  async getManifest() {
    const response = await this._request('GET', '/sep/manifest');
    this._manifest = response;
    return response;
  }

  /**
   * Get cached manifest or fetch it.
   *
   * @returns {object}
   */
  async manifest() {
    if (!this._manifest) {
      await this.getManifest();
    }
    return this._manifest;
  }

  /**
   * POST /sep/query — Send consumer intent and receive content payload.
   *
   * @param {object} intent - Consumer intent object (SEP consumer-intent schema)
   * @returns {object} Provider response
   */
  async query(intent) {
    const response = await this._request('POST', '/sep/query', intent);

    if (response.response_type === 'error') {
      const err = new Error(response.error?.message || 'Provider returned an error');
      err.code = response.error?.code || 'PROVIDER_ERROR';
      err.retryAfter = response.error?.retry_after_seconds;
      throw err;
    }

    if (response.response_type === 'redirect') {
      const err = new Error(`Provider redirected to: ${response.redirect?.target_url}`);
      err.code = 'REDIRECT';
      err.redirectUrl = response.redirect?.target_url;
      err.reason = response.redirect?.reason;
      throw err;
    }

    return response;
  }

  /**
   * POST /sep/telemetry — Send engagement telemetry to provider.
   *
   * @param {object} telemetry - Telemetry payload (SEP telemetry schema)
   * @returns {object} Provider acknowledgment
   */
  async sendTelemetry(telemetry) {
    return this._request('POST', '/sep/telemetry', telemetry);
  }

  /**
   * GET /sep/browse — Browse provider content index.
   *
   * @param {object} [params] - Query parameters
   * @param {number} [params.limit=20]
   * @param {number} [params.offset=0]
   * @param {string} [params.category]
   * @param {string} [params.content_type]
   * @param {string} [params.language]
   * @returns {object} Browse response
   */
  async browse(params = {}) {
    const searchParams = new URLSearchParams();
    if (params.limit != null) searchParams.set('limit', String(params.limit));
    if (params.offset != null) searchParams.set('offset', String(params.offset));
    if (params.category) searchParams.set('category', params.category);
    if (params.content_type) searchParams.set('content_type', params.content_type);
    if (params.language) searchParams.set('language', params.language);
    if (params.min_schema_version) searchParams.set('min_schema_version', params.min_schema_version);

    const qs = searchParams.toString();
    const path = qs ? `/sep/browse?${qs}` : '/sep/browse';
    return this._request('GET', path);
  }

  /**
   * Internal request handler with retry and timeout.
   *
   * @param {string} method - HTTP method
   * @param {string} path - URL path
   * @param {object} [body] - Request body for POST
   * @returns {object} Parsed JSON response
   */
  async _request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const options = {
          method,
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        };

        if (body && method === 'POST') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        clearTimeout(timer);

        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, attempt) * 1000;
          lastError = new Error(`HTTP ${response.status} from ${url}`);
          lastError.statusCode = response.status;

          if (attempt < this.maxRetries) {
            await sleep(delay);
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const err = new Error(`HTTP ${response.status}: ${errBody}`);
          err.statusCode = response.status;
          throw err;
        }

        const data = await response.json();

        if (this.validator) {
          this.validator(data, method, path);
        }

        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          lastError = new Error(`Request to ${url} timed out after ${this.timeoutMs}ms`);
          lastError.code = 'TIMEOUT';
        } else {
          lastError = err;
        }

        const isRetryable = err.name === 'AbortError' ||
          err.code === 'ECONNREFUSED' ||
          err.code === 'ECONNRESET' ||
          err.cause?.code === 'ECONNREFUSED' ||
          err.cause?.code === 'ECONNRESET';

        if (isRetryable && attempt < this.maxRetries) {
          await sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        if (!isRetryable) throw lastError;
      }
    }

    throw lastError;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
