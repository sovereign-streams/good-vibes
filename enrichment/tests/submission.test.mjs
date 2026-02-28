import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SubmissionServer } from '../src/submission-server.mjs';
import { SchedulerState } from '../src/scheduler-state.mjs';
import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';
import { unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_STATE_DB = join(__dirname, 'test-submission-state.db');
const TEST_STORE_DB = join(__dirname, 'test-submission-store.db');

// Use a dynamic port to avoid conflicts
let testPort = 0;

function makeRequest(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${port}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    fetch(url, {
      ...options,
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        resolve({ status: res.status, data });
      })
      .catch(reject);
  });
}

describe('SubmissionServer', () => {
  let state;
  let store;
  let server;
  let port;

  beforeEach(async () => {
    state = new SchedulerState(TEST_STATE_DB);
    await state.initialize();

    const adapter = new SQLiteAdapter(TEST_STORE_DB);
    store = new IndexStore(adapter);
    await store.initialize();

    // Use port 0 for automatic assignment
    server = new SubmissionServer({ state, store, port: 0, rateLimitPerHour: 5 });
    const httpServer = server.start();

    // Wait for the server to start and get the assigned port
    await new Promise((resolve) => {
      httpServer.on('listening', () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await server.stop();
    state.close();
    await store.close();
    if (existsSync(TEST_STATE_DB)) unlinkSync(TEST_STATE_DB);
    if (existsSync(TEST_STORE_DB)) unlinkSync(TEST_STORE_DB);
  });

  // ── URL extraction tests ─────────────────────────────────────

  describe('YouTube URL extraction', () => {
    it('should extract video ID from standard URL', () => {
      assert.equal(server._extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('should extract video ID from short URL', () => {
      assert.equal(server._extractYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('should extract video ID from shorts URL', () => {
      assert.equal(server._extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('should return null for non-YouTube URLs', () => {
      assert.equal(server._extractYouTubeId('https://vimeo.com/123456'), null);
    });

    it('should return null for invalid URLs', () => {
      assert.equal(server._extractYouTubeId('not a url'), null);
    });

    it('should handle mobile YouTube URLs', () => {
      assert.equal(server._extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });
  });

  // ── POST /submit ─────────────────────────────────────────────

  describe('POST /submit', () => {
    it('should queue a valid YouTube URL', async () => {
      const { status, data } = await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      assert.equal(status, 202);
      assert.equal(data.status, 'queued');
      assert.ok(data.queue_id);
      assert.ok(data.status_url);
    });

    it('should reject missing URL field', async () => {
      const { status, data } = await makeRequest(port, 'POST', '/submit', {});

      assert.equal(status, 400);
      assert.ok(data.error);
    });

    it('should reject non-YouTube URLs', async () => {
      const { status, data } = await makeRequest(port, 'POST', '/submit', {
        url: 'https://vimeo.com/123456',
      });

      assert.equal(status, 400);
      assert.equal(data.error, 'Invalid URL');
    });

    it('should reject invalid JSON', async () => {
      const url = `http://127.0.0.1:${port}/submit`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      assert.equal(res.status, 400);
    });

    it('should detect already-queued URLs', async () => {
      await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      const { status, data } = await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      assert.equal(status, 200);
      assert.equal(data.status, 'already_queued');
    });

    it('should detect already-indexed content', async () => {
      // Put an item in the store first
      await store.put({
        item_id: 'existing-123',
        sep_version: '0.1.0',
        source: {
          platform: 'youtube',
          origin_url: 'https://www.youtube.com/watch?v=existing123',
          origin_id: 'existing123',
          content_type: 'video',
          duration_seconds: 120,
        },
        meta: {
          title: 'Existing Video',
          creator: 'Test',
          published: '2026-01-01T00:00:00Z',
          original_tags: [],
          language: 'en',
          thumbnail_url: '',
        },
        enrichment: { schema_version: '0.1.0', categories: [] },
        provider: { id: 'good-vibes-main', guardrail_pass: true, guardrail_version: '0.1.0' },
      });

      const { status, data } = await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=existing123',
      });

      assert.equal(status, 200);
      assert.equal(data.status, 'already_indexed');
      assert.equal(data.item_id, 'existing-123');
    });

    it('should enforce rate limits', async () => {
      // Make 5 requests (our test limit)
      for (let i = 0; i < 5; i++) {
        await makeRequest(port, 'POST', '/submit', {
          url: `https://www.youtube.com/watch?v=video${String(i).padStart(6, '0')}test`,
        });
      }

      // 6th should be rate limited
      const { status, data } = await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=rateLimited',
      });

      assert.equal(status, 429);
      assert.ok(data.error.includes('Rate limit'));
    });
  });

  // ── GET /submit/status/:id ───────────────────────────────────

  describe('GET /submit/status/:id', () => {
    it('should return status of a queued item', async () => {
      const submitResult = await makeRequest(port, 'POST', '/submit', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      const queueId = submitResult.data.queue_id;

      const { status, data } = await makeRequest(port, 'GET', `/submit/status/${queueId}`);

      assert.equal(status, 200);
      assert.equal(data.queue_id, queueId);
      assert.equal(data.status, 'pending');
      assert.ok(data.url);
    });

    it('should return 404 for non-existent queue ID', async () => {
      const { status } = await makeRequest(port, 'GET', '/submit/status/99999');

      assert.equal(status, 404);
    });

    it('should return 400 for invalid queue ID', async () => {
      const { status } = await makeRequest(port, 'GET', '/submit/status/notanumber');

      assert.equal(status, 400);
    });
  });

  // ── Other routes ─────────────────────────────────────────────

  describe('routing', () => {
    it('should return 404 for unknown routes', async () => {
      const { status } = await makeRequest(port, 'GET', '/unknown');
      assert.equal(status, 404);
    });

    it('should handle OPTIONS for CORS', async () => {
      const url = `http://127.0.0.1:${port}/submit`;
      const res = await fetch(url, { method: 'OPTIONS' });
      assert.equal(res.status, 204);
    });
  });
});
