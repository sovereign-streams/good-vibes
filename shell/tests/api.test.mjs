/**
 * Shell API tests.
 *
 * Spins up the shell server on a random port, exercises each API route,
 * and tears down. Uses node:test — no external test runner needed.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Point PAE at a disposable test database
const testDbPath = join(__dirname, `test-shell-${randomUUID()}.db`);
process.env.SHELL_DB_PATH = testDbPath;
process.env.SHELL_PORT = '0'; // let OS pick a free port
process.env.SHELL_HOST = '127.0.0.1';

import { createShellServer } from '../src/server.mjs';

// ── Helpers ─────────────────────────────────────────────────

let baseUrl;
let server;
let bridge;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ── Setup / Teardown ────────────────────────────────────────

before(async () => {
  const app = createShellServer();
  bridge = app.bridge;
  server = app.server;

  await bridge.initialize();

  // Seed a test profile
  bridge.pae.saveProfile({
    id: 'test-default',
    name: 'Test Default',
    description: 'A test profile',
    weights: { fitness: 0.3, humor: 0.3, skill_building: 0.2, motivation: 0.2 },
  });
  bridge.pae.setActiveProfile('test-default');

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(() => {
  server.close();
  bridge.close();
  try { rmSync(testDbPath); } catch {}
  try { rmSync(testDbPath + '-wal'); } catch {}
  try { rmSync(testDbPath + '-shm'); } catch {}
});

// ── Profile endpoints ───────────────────────────────────────

describe('GET /api/profiles', () => {
  it('should list profiles', async () => {
    const { status, data } = await api('GET', '/api/profiles');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 1);
    assert.ok(data.some(p => p.id === 'test-default'));
  });
});

describe('GET /api/profiles/:id', () => {
  it('should return a profile by id', async () => {
    const { status, data } = await api('GET', '/api/profiles/test-default');
    assert.equal(status, 200);
    assert.equal(data.id, 'test-default');
    assert.equal(data.name, 'Test Default');
  });

  it('should return 404 for unknown profile', async () => {
    const { status } = await api('GET', '/api/profiles/nonexistent');
    assert.equal(status, 404);
  });
});

describe('POST /api/profiles', () => {
  it('should create a new profile', async () => {
    const { status, data } = await api('POST', '/api/profiles', {
      id: 'new-profile',
      name: 'New Profile',
      weights: { fitness: 0.5, humor: 0.5 },
    });
    assert.equal(status, 201);
    assert.equal(data.id, 'new-profile');
  });
});

describe('PUT /api/profiles/:id', () => {
  it('should update a profile', async () => {
    const { status, data } = await api('PUT', '/api/profiles/test-default', {
      name: 'Updated Name',
      weights: { fitness: 0.4, humor: 0.6 },
    });
    assert.equal(status, 200);
    assert.equal(data.name, 'Updated Name');
  });
});

// ── Session endpoints ───────────────────────────────────────

describe('POST /api/session', () => {
  it('should create a session', async () => {
    const { status, data } = await api('POST', '/api/session', {
      profileId: 'test-default',
    });
    assert.equal(status, 201);
    assert.ok(data.session_id);
    assert.equal(data.profile_id, 'test-default');
  });
});

describe('GET /api/session/:id', () => {
  it('should return session details', async () => {
    // Create a session first
    const create = await api('POST', '/api/session', { profileId: 'test-default' });
    const sessionId = create.data.session_id;

    const { status, data } = await api('GET', `/api/session/${sessionId}`);
    assert.equal(status, 200);
    assert.equal(data.session_id, sessionId);
  });

  it('should return 404 for unknown session', async () => {
    const { status } = await api('GET', '/api/session/nonexistent');
    assert.equal(status, 404);
  });
});

describe('POST /api/session/:id/engage', () => {
  it('should accept engagement signals', async () => {
    const create = await api('POST', '/api/session', { profileId: 'test-default' });
    const sessionId = create.data.session_id;

    const { status, data } = await api('POST', `/api/session/${sessionId}/engage`, {
      items: [{ item_id: 'test-item-1', viewed: true, completion_rate: 0.8 }],
    });
    assert.equal(status, 200);
    assert.equal(data.recorded, true);
  });
});

describe('GET /api/session/:id/next', () => {
  it('should return next item info', async () => {
    const create = await api('POST', '/api/session', { profileId: 'test-default' });
    const sessionId = create.data.session_id;

    const { status, data } = await api('GET', `/api/session/${sessionId}/next`);
    assert.equal(status, 200);
    assert.ok('remaining' in data);
  });
});

describe('POST /api/session/:id/skip', () => {
  it('should skip an item', async () => {
    const create = await api('POST', '/api/session', { profileId: 'test-default' });
    const sessionId = create.data.session_id;

    const { status, data } = await api('POST', `/api/session/${sessionId}/skip`, {});
    assert.equal(status, 200);
    assert.ok('skipped' in data);
  });
});

describe('POST /api/session/:id/complete', () => {
  it('should complete a session', async () => {
    const create = await api('POST', '/api/session', { profileId: 'test-default' });
    const sessionId = create.data.session_id;

    const { status, data } = await api('POST', `/api/session/${sessionId}/complete`, {
      satisfaction: 0.8,
    });
    assert.equal(status, 200);
    assert.equal(data.completed, true);
  });
});

// ── History ─────────────────────────────────────────────────

describe('GET /api/history', () => {
  it('should return session history', async () => {
    const { status, data } = await api('GET', '/api/history');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
  });

  it('should respect limit param', async () => {
    const { status, data } = await api('GET', '/api/history?limit=2');
    assert.equal(status, 200);
    assert.ok(data.length <= 2);
  });
});

// ── Learning ────────────────────────────────────────────────

describe('GET /api/learning/suggestions', () => {
  it('should return suggestions (or insufficient_data)', async () => {
    const { status, data } = await api('GET', '/api/learning/suggestions');
    assert.equal(status, 200);
    assert.ok(data.status); // 'insufficient_data' or 'ready'
  });
});

describe('POST /api/learning/apply', () => {
  it('should handle proposal application', async () => {
    // With no valid proposal, it should still respond gracefully
    const { status, data } = await api('POST', '/api/learning/apply', {
      status: 'ready',
      proposed_weights: { fitness: 0.4, humor: 0.3 },
    });
    assert.equal(status, 200);
    assert.ok(data);
  });
});

// ── Providers ───────────────────────────────────────────────

describe('GET /api/providers', () => {
  it('should list providers', async () => {
    const { status, data } = await api('GET', '/api/providers');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
  });
});

describe('POST /api/providers', () => {
  it('should require endpoint field', async () => {
    const { status } = await api('POST', '/api/providers', {});
    assert.equal(status, 400);
  });

  it('should add a provider', async () => {
    const { status, data } = await api('POST', '/api/providers', {
      endpoint: 'http://localhost:9999',
    });
    assert.equal(status, 201);
    assert.ok(data);
  });
});

describe('DELETE /api/providers/:id', () => {
  it('should remove a provider', async () => {
    // Add then remove
    await api('POST', '/api/providers', { endpoint: 'http://localhost:9998' });
    const { status, data } = await api('DELETE', `/api/providers/${encodeURIComponent('http://localhost:9998')}`);
    assert.equal(status, 200);
    assert.equal(data.removed, true);
  });
});

// ── Stats ───────────────────────────────────────────────────

describe('GET /api/stats', () => {
  it('should return usage stats', async () => {
    const { status, data } = await api('GET', '/api/stats');
    assert.equal(status, 200);
    assert.ok('total_sessions' in data);
    assert.ok('completed_sessions' in data);
    assert.ok('avg_satisfaction' in data);
    assert.ok('providers' in data);
    assert.ok('active_sessions' in data);
  });
});

// ── CORS ────────────────────────────────────────────────────

describe('CORS', () => {
  it('should respond to OPTIONS preflight', async () => {
    const res = await fetch(`${baseUrl}/api/profiles`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get('access-control-allow-origin'));
  });

  it('should include CORS headers on API responses', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });
});

// ── Static files ────────────────────────────────────────────

describe('Static file serving', () => {
  it('should serve index.html at root', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Good Vibes'));
  });

  it('should serve manifest.json', async () => {
    const res = await fetch(`${baseUrl}/manifest.json`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.short_name, 'GoodVibes');
  });

  it('should serve service worker', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('javascript'));
  });
});

// ── 404 handling ────────────────────────────────────────────

describe('404 handling', () => {
  it('should return 404 for unknown API routes', async () => {
    const { status } = await api('GET', '/api/nonexistent');
    assert.equal(status, 404);
  });
});
