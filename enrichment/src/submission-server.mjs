import { createServer } from 'node:http';
import { SchedulerState } from './scheduler-state.mjs';
import { IndexStore } from './store/index-store.mjs';
import { SQLiteAdapter } from './store/adapters/sqlite.mjs';
import { Config } from './lib/config.mjs';

const PORT = parseInt(process.env.SUBMISSION_PORT || '3701', 10);
const RATE_LIMIT_PER_HOUR = 10;

/**
 * Lightweight HTTP server for content URL submissions.
 *
 * Endpoints:
 *   POST /submit          — Submit a YouTube URL for enrichment
 *   GET  /submit/status/:id — Check enrichment status for a queue item
 */
export class SubmissionServer {
  /**
   * @param {object} opts
   * @param {SchedulerState} opts.state
   * @param {IndexStore} opts.store
   * @param {number} [opts.port]
   * @param {number} [opts.rateLimitPerHour]
   */
  constructor({ state, store, port = PORT, rateLimitPerHour = RATE_LIMIT_PER_HOUR }) {
    this.state = state;
    this.store = store;
    this.port = port;
    this.rateLimitPerHour = rateLimitPerHour;
    this._server = null;
  }

  start() {
    this._server = createServer((req, res) => this._handleRequest(req, res));
    this._server.listen(this.port, () => {
      console.log(`[submission-server] Listening on port ${this.port}`);
    });
    return this._server;
  }

  stop() {
    return new Promise((resolve) => {
      if (this._server) {
        this._server.close(resolve);
        this._server = null;
      } else {
        resolve();
      }
    });
  }

  async _handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, `http://localhost:${this.port}`);

      if (req.method === 'POST' && url.pathname === '/submit') {
        await this._handleSubmit(req, res);
      } else if (req.method === 'GET' && url.pathname.startsWith('/submit/status/')) {
        await this._handleStatus(req, res, url);
      } else {
        this._json(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      console.error('[submission-server] Error:', err.message);
      this._json(res, 500, { error: 'Internal server error' });
    }
  }

  async _handleSubmit(req, res) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown';

    // Rate limit check
    const rateCheck = this.state.checkRateLimit(ip, this.rateLimitPerHour);
    if (!rateCheck.allowed) {
      this._json(res, 429, {
        error: 'Rate limit exceeded',
        message: `Maximum ${this.rateLimitPerHour} submissions per hour`,
        retry_after_seconds: 3600,
      });
      return;
    }

    // Parse body
    const body = await this._readBody(req);
    if (!body) {
      this._json(res, 400, { error: 'Request body required' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      this._json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const { url } = parsed;
    if (!url || typeof url !== 'string') {
      this._json(res, 400, { error: 'Missing or invalid "url" field' });
      return;
    }

    // Validate YouTube URL
    const videoId = this._extractYouTubeId(url);
    if (!videoId) {
      this._json(res, 400, {
        error: 'Invalid URL',
        message: 'Only YouTube URLs are currently supported',
      });
      return;
    }

    // Check if already in the index
    const existing = await this.store.getByOriginId('youtube', videoId);
    if (existing) {
      this._json(res, 200, {
        status: 'already_indexed',
        item_id: existing.item_id,
        message: 'This content is already in the Good Vibes index',
      });
      return;
    }

    // Enqueue for enrichment
    const result = this.state.enqueue(url, {
      originId: videoId,
      source: 'submission',
      submitterIp: ip,
    });

    if (result.duplicate) {
      this._json(res, 200, {
        status: 'already_queued',
        queue_id: result.queue_id,
        message: 'This URL is already queued for enrichment',
      });
      return;
    }

    this._json(res, 202, {
      status: 'queued',
      queue_id: result.queue_id,
      message: 'URL has been queued for enrichment',
      status_url: `/submit/status/${result.queue_id}`,
      remaining_submissions: rateCheck.remaining,
    });
  }

  async _handleStatus(req, res, url) {
    const parts = url.pathname.split('/');
    const queueId = parseInt(parts[parts.length - 1], 10);

    if (isNaN(queueId)) {
      this._json(res, 400, { error: 'Invalid queue ID' });
      return;
    }

    const item = this.state.getQueueItem(queueId);
    if (!item) {
      this._json(res, 404, { error: 'Queue item not found' });
      return;
    }

    const response = {
      queue_id: item.queue_id,
      url: item.item_url,
      status: item.status,
      created_at: item.created_at,
    };

    if (item.started_at) response.started_at = item.started_at;
    if (item.completed_at) response.completed_at = item.completed_at;
    if (item.error) response.error = item.error;

    // If completed, try to find the enriched item
    if (item.status === 'completed' && item.item_origin_id) {
      const enriched = await this.store.getByOriginId('youtube', item.item_origin_id);
      if (enriched) {
        response.item_id = enriched.item_id;
      }
    }

    this._json(res, 200, response);
  }

  // ── Helpers ──────────────────────────────────────────────────

  _extractYouTubeId(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace('www.', '');

      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (parsed.pathname === '/watch') {
          return parsed.searchParams.get('v') || null;
        }
        const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch) return shortsMatch[1];
      }

      if (host === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        return id.length === 11 ? id : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      const MAX_BODY = 4096;

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error('Body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  _json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}

// ── CLI entry point ──────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = Config.dbPath;
  const stateDbPath = dbPath.replace('.db', '-scheduler.db');

  const stateStore = new SchedulerState(stateDbPath);
  await stateStore.initialize();

  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  await store.initialize();

  const server = new SubmissionServer({ state: stateStore, store });
  server.start();

  const shutdown = async () => {
    await server.stop();
    stateStore.close();
    await store.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
