import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleQuery, stateManager } from '../src/handlers/query.mjs';
import { handleManifest } from '../src/handlers/manifest.mjs';
import { handleTelemetry } from '../src/handlers/telemetry.mjs';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

describe('handleManifest', () => {
  it('should return a valid provider manifest', () => {
    const manifest = handleManifest();
    assert.equal(manifest.sep_version, '0.1.0');
    assert.equal(manifest.provider_id, 'good-vibes-main');
    assert.ok(manifest.provider_name);
    assert.ok(manifest.endpoint);
    assert.ok(Array.isArray(manifest.supported_models));
    assert.ok(manifest.guardrails);
    assert.ok(manifest.guardrails.published);
    assert.ok(manifest.rate_limit);
    assert.ok(manifest.rate_limit.requests_per_minute > 0);
    assert.ok(manifest.rate_limit.daily_cap > 0);
    assert.ok(manifest.max_payload_size > 0);
  });
});

describe('handleQuery — validation', () => {
  it('should reject null body', async () => {
    await assert.rejects(() => handleQuery(null), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_INTENT');
      return true;
    });
  });

  it('should reject body without intent', async () => {
    await assert.rejects(() => handleQuery({ foo: 'bar' }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should reject intent without session_type', async () => {
    await assert.rejects(() => handleQuery({
      intent: { weights: { fitness: 0.5 }, filters: {}, context: {} }
    }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should reject intent without weights', async () => {
    await assert.rejects(() => handleQuery({
      intent: { session_type: 'composed', filters: {}, context: {} }
    }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should reject invalid weight values', async () => {
    await assert.rejects(() => handleQuery({
      intent: {
        session_type: 'composed',
        weights: { fitness: 2.0 },
        filters: {},
        context: {}
      }
    }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });
});

describe('handleTelemetry — validation', () => {
  const testDir = join(__dirname, '.tmp-telemetry');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    process.env.TELEMETRY_LOG = join(testDir, 'test-telemetry.jsonl');
  });

  afterEach(() => {
    delete process.env.TELEMETRY_LOG;
    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('should reject null body', async () => {
    await assert.rejects(() => handleTelemetry(null), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_TELEMETRY');
      return true;
    });
  });

  it('should reject body without telemetry', async () => {
    await assert.rejects(() => handleTelemetry({ foo: 'bar' }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should reject telemetry without session_id', async () => {
    await assert.rejects(() => handleTelemetry({
      telemetry: { items: [], session_completed: true, session_satisfaction: 0.8 }
    }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should reject telemetry item without viewed flag', async () => {
    await assert.rejects(() => handleTelemetry({
      telemetry: {
        session_id: 'test-session',
        items: [{ item_id: 'abc' }],
        session_completed: true,
        session_satisfaction: 0.8
      }
    }), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it('should accept valid telemetry and return accepted status', async () => {
    const result = await handleTelemetry({
      sep_version: '0.1.0',
      telemetry: {
        session_id: 'test-session-123',
        items: [
          { item_id: '11111111-1111-1111-1111-111111111111', viewed: true, view_duration_seconds: 120, completed: true }
        ],
        session_completed: true,
        session_satisfaction: 0.9
      }
    });
    assert.equal(result.status, 'accepted');
    assert.equal(result.sep_version, '0.1.0');
  });
});

describe('StateManager integration via handleQuery', () => {
  it('stateManager should track sessions', () => {
    const token = stateManager.create({ servedItemIds: ['a', 'b'] });
    assert.ok(token);
    const served = stateManager.getServedIds(token);
    assert.ok(served.has('a'));
    assert.ok(served.has('b'));
  });
});
