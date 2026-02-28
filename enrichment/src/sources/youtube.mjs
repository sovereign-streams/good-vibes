import { BaseSource } from './base.mjs';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const QUOTA_WARN_THRESHOLD = 8000;
const QUOTA_LIMIT = 10000;
const MAX_IDS_PER_REQUEST = 50;
const MAX_RETRIES = 3;

export class YouTubeSource extends BaseSource {
  /**
   * @param {string} apiKey - YouTube Data API v3 key. Falls back to YOUTUBE_API_KEY env var.
   */
  constructor(apiKey) {
    super({});
    this.apiKey = apiKey || process.env.YOUTUBE_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        'YouTube API key is required. Provide it as a constructor argument ' +
        'or set the YOUTUBE_API_KEY environment variable.'
      );
    }
    this.quotaUsed = 0;
  }

  get name() {
    return 'youtube';
  }

  /**
   * Search YouTube for videos matching a query.
   * Costs 100 quota units per call.
   * @param {string} query
   * @param {number} [maxResults=50]
   * @returns {Promise<object[]>} Array of video metadata objects.
   */
  async search(query, maxResults = 50) {
    this._trackQuota(100);

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: query,
      maxResults: String(Math.min(maxResults, 50)),
      key: this.apiKey,
    });

    const url = `${YOUTUBE_API_BASE}/search?${params}`;
    const data = await this._fetchWithRetry(url);

    return (data.items || []).map(item => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      description: item.snippet?.description,
      channelTitle: item.snippet?.channelTitle,
      publishedAt: item.snippet?.publishedAt,
      thumbnails: item.snippet?.thumbnails,
    }));
  }

  /**
   * Get detailed metadata for an array of video IDs.
   * Costs 1 quota unit per call (not per ID).
   * Automatically batches into groups of 50.
   * @param {string[]} videoIds
   * @returns {Promise<object[]>} Array of detailed metadata objects.
   */
  async getVideoDetails(videoIds) {
    const results = [];

    for (let i = 0; i < videoIds.length; i += MAX_IDS_PER_REQUEST) {
      const batch = videoIds.slice(i, i + MAX_IDS_PER_REQUEST);
      this._trackQuota(1);

      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: batch.join(','),
        key: this.apiKey,
      });

      const url = `${YOUTUBE_API_BASE}/videos?${params}`;
      const data = await this._fetchWithRetry(url);

      for (const item of (data.items || [])) {
        results.push({
          videoId: item.id,
          title: item.snippet?.title,
          description: item.snippet?.description,
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          thumbnails: item.snippet?.thumbnails,
          tags: item.snippet?.tags || [],
          defaultLanguage: item.snippet?.defaultLanguage || null,
          defaultAudioLanguage: item.snippet?.defaultAudioLanguage || null,
          duration: this.parseDuration(item.contentDetails?.duration),
          statistics: {
            viewCount: parseInt(item.statistics?.viewCount || '0', 10),
            likeCount: parseInt(item.statistics?.likeCount || '0', 10),
            commentCount: parseInt(item.statistics?.commentCount || '0', 10),
          },
        });
      }
    }

    return results;
  }

  /**
   * Alias for getVideoDetails to satisfy BaseSource interface.
   */
  async getDetails(ids) {
    return this.getVideoDetails(ids);
  }

  /**
   * Attempt to fetch captions/transcript for a video.
   * Note: The YouTube Data API v3 captions endpoint requires OAuth, so this
   * attempts to use the captions.list endpoint to discover available tracks.
   * Full transcript download would require additional auth or a third-party approach.
   * @param {string} videoId
   * @returns {Promise<string|null>} Transcript text or null if unavailable.
   */
  async getTranscript(videoId) {
    try {
      this._trackQuota(50);

      const params = new URLSearchParams({
        part: 'snippet',
        videoId,
        key: this.apiKey,
      });

      const url = `${YOUTUBE_API_BASE}/captions?${params}`;
      const data = await this._fetchWithRetry(url);

      if (!data.items || data.items.length === 0) {
        return null;
      }

      // The captions.list endpoint only tells us what tracks exist.
      // Actual transcript download requires OAuth or alternative methods.
      // Return null for now -- the TranscriptFetcher layer handles this gracefully.
      console.log(`[youtube] Captions available for ${videoId} (${data.items.length} tracks), but download requires OAuth`);
      return null;
    } catch (err) {
      console.warn(`[youtube] Could not fetch transcript for ${videoId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Parse a YouTube ISO 8601 duration string into seconds.
   * Examples: "PT4M13S" -> 253, "PT1H2M3S" -> 3723, "PT30S" -> 30
   * @param {string} iso8601 - Duration string like "PT4M13S".
   * @returns {number} Duration in seconds.
   */
  parseDuration(iso8601) {
    if (!iso8601) return 0;

    const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Track quota usage and warn when approaching the daily limit.
   * @private
   */
  _trackQuota(units) {
    this.quotaUsed += units;
    if (this.quotaUsed >= QUOTA_WARN_THRESHOLD && this.quotaUsed < QUOTA_LIMIT) {
      console.warn(`[youtube] Quota warning: ${this.quotaUsed}/${QUOTA_LIMIT} units used`);
    }
    if (this.quotaUsed >= QUOTA_LIMIT) {
      console.error(`[youtube] Quota limit reached: ${this.quotaUsed}/${QUOTA_LIMIT} units used`);
    }
  }

  /**
   * Fetch a URL with retry logic: 3 attempts, exponential backoff.
   * Retries on HTTP 429, 500, and 503 responses.
   * @private
   */
  async _fetchWithRetry(url, attempt = 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;
      const shouldRetry = (status === 429 || status === 500 || status === 503) && attempt < MAX_RETRIES;

      if (shouldRetry) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(`[youtube] HTTP ${status}, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await this._sleep(delayMs);
        return this._fetchWithRetry(url, attempt + 1);
      }

      // Non-retryable error or exhausted retries
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (_) { /* ignore */ }
      throw new Error(`YouTube API error ${status}: ${errorBody}`);
    } catch (err) {
      if (err.message.startsWith('YouTube API error')) {
        throw err;
      }

      // Network error -- retry if attempts remain
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.warn(`[youtube] Network error, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
        await this._sleep(delayMs);
        return this._fetchWithRetry(url, attempt + 1);
      }

      throw new Error(`YouTube API request failed after ${MAX_RETRIES} attempts: ${err.message}`);
    }
  }

  /**
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
