import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

// -- Negotiator tests --

import { negotiate, isCompatible, selectModel, compareVersions } from '../src/sep-client/negotiator.mjs';

describe('Negotiator', () => {
  const mockManifest = {
    sep_version: '0.1.0',
    provider_id: 'test-provider',
    provider_name: 'Test Provider',
    endpoint: 'http://localhost:3700/sep/v1',
    supported_models: ['negotiated', 'curated_payload'],
    supported_content_types: ['video', 'podcast', 'music'],
    enrichment_schema_version: '0.1.0',
    max_payload_size: 100,
    rate_limit: { requests_per_minute: 30, daily_cap: 1000 },
    guardrails: { published: true, version: '0.1.0' },
    capabilities: {
      supports_stateful: true,
      supports_full_index_browse: false,
      supports_telemetry_exchange: true,
    },
  };

  it('should negotiate successfully with compatible provider', () => {
    const result = negotiate(mockManifest, {
      preferred_model: 'negotiated',
      content_types: ['video'],
    });
    assert.equal(result.compatible, true);
    assert.equal(result.exchange_model, 'negotiated');
    assert.ok(result.content_types.includes('video'));
    assert.equal(result.warnings.length, 0);
  });

  it('should fall back to alternative exchange model', () => {
    const manifest = { ...mockManifest, supported_models: ['curated_payload'] };
    const result = negotiate(manifest, { preferred_model: 'negotiated' });
    assert.equal(result.compatible, true);
    assert.equal(result.exchange_model, 'curated_payload');
    assert.ok(result.warnings.length > 0);
  });

  it('should mark incompatible when no overlapping content types', () => {
    const result = negotiate(mockManifest, { content_types: ['article'] });
    assert.equal(result.compatible, false);
    assert.ok(result.warnings.some(w => w.includes('No overlapping content types')));
  });

  it('should cap payload size to provider max', () => {
    const result = negotiate(mockManifest, { desired_payload_size: 200 });
    assert.equal(result.payload_size, 100);
    assert.ok(result.warnings.some(w => w.includes('payload size')));
  });

  it('should detect enrichment version incompatibility', () => {
    const result = negotiate(mockManifest, { min_enrichment_version: '1.0.0' });
    assert.equal(result.enrichment_compatible, false);
    assert.ok(result.warnings.some(w => w.includes('enrichment version')));
  });

  it('should warn when stateful not supported', () => {
    const manifest = {
      ...mockManifest,
      capabilities: { ...mockManifest.capabilities, supports_stateful: false },
    };
    const result = negotiate(manifest, { needs_stateful: true });
    assert.ok(result.warnings.some(w => w.includes('stateful')));
  });

  it('should warn when telemetry not supported', () => {
    const manifest = {
      ...mockManifest,
      capabilities: { ...mockManifest.capabilities, supports_telemetry_exchange: false },
    };
    const result = negotiate(manifest, { needs_telemetry: true });
    assert.ok(result.warnings.some(w => w.includes('telemetry')));
  });

  it('should compare versions correctly', () => {
    assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
    assert.equal(compareVersions('0.2.0', '0.1.0'), 1);
    assert.equal(compareVersions('0.1.0', '1.0.0'), -1);
    assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  });

  it('isCompatible shorthand', () => {
    assert.equal(isCompatible(mockManifest), true);
    assert.equal(isCompatible(mockManifest, { content_types: ['article'] }), false);
  });

  it('selectModel should pick preferred when available', () => {
    assert.equal(selectModel(['negotiated', 'curated_payload'], 'negotiated'), 'negotiated');
    assert.equal(selectModel(['curated_payload'], 'negotiated'), 'curated_payload');
    assert.equal(selectModel(['full_index_browse'], 'negotiated'), 'full_index_browse');
  });

  it('should mark incompatible when no supported models', () => {
    const manifest = { ...mockManifest, supported_models: [] };
    const result = negotiate(manifest);
    assert.equal(result.compatible, false);
  });
});

// -- SEP Client tests (with mock server) --

import { SEPClient } from '../src/sep-client/client.mjs';

describe('SEPClient', () => {
  let server;
  let baseUrl;
  let mockHandler;

  beforeEach(async () => {
    mockHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    };

    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        req.body = body ? JSON.parse(body) : null;
        mockHandler(req, res);
      });
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  it('should GET manifest', async () => {
    mockHandler = (req, res) => {
      assert.equal(req.url, '/sep/manifest');
      assert.equal(req.method, 'GET');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sep_version: '0.1.0',
        provider_id: 'test',
        provider_name: 'Test',
        supported_models: ['negotiated'],
        supported_content_types: ['video'],
        enrichment_schema_version: '0.1.0',
        max_payload_size: 50,
      }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    const manifest = await client.getManifest();
    assert.equal(manifest.provider_id, 'test');
  });

  it('should POST query with intent', async () => {
    const testItems = FIXTURES.slice(0, 3);
    mockHandler = (req, res) => {
      assert.equal(req.url, '/sep/query');
      assert.equal(req.method, 'POST');
      assert.ok(req.body.intent);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sep_version: '0.1.0',
        provider_id: 'test',
        response_type: 'payload',
        payload: {
          items: testItems,
          total_available: 100,
          returned: testItems.length,
          confidence: 0.85,
        },
      }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    const response = await client.query({
      sep_version: '0.1.0',
      consumer_id: 'test',
      intent: {
        session_type: 'composed',
        target_duration_minutes: 15,
        weights: { fitness: 0.5 },
        filters: { exclude_rage_bait: true },
        context: { time_of_day: 'morning', session_number_today: 1, state_token: null },
      },
      disclosure_level: 'minimal',
      telemetry_opt_in: false,
    });
    assert.equal(response.response_type, 'payload');
    assert.equal(response.payload.items.length, 3);
  });

  it('should throw on error response type', async () => {
    mockHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sep_version: '0.1.0',
        provider_id: 'test',
        response_type: 'error',
        error: { code: 'RATE_LIMITED', message: 'Too many requests', retry_after_seconds: 30 },
      }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    await assert.rejects(
      () => client.query({ sep_version: '0.1.0', consumer_id: 'test', intent: {}, disclosure_level: 'minimal', telemetry_opt_in: false }),
      (err) => {
        assert.equal(err.code, 'RATE_LIMITED');
        assert.equal(err.retryAfter, 30);
        return true;
      }
    );
  });

  it('should throw on redirect response type', async () => {
    mockHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sep_version: '0.1.0',
        provider_id: 'test',
        response_type: 'redirect',
        redirect: { target_url: 'http://other.provider/sep', reason: 'Moved' },
      }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    await assert.rejects(
      () => client.query({ sep_version: '0.1.0', consumer_id: 'test', intent: {}, disclosure_level: 'minimal', telemetry_opt_in: false }),
      (err) => {
        assert.equal(err.code, 'REDIRECT');
        return true;
      }
    );
  });

  it('should POST telemetry', async () => {
    mockHandler = (req, res) => {
      assert.equal(req.url, '/sep/telemetry');
      assert.equal(req.method, 'POST');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    const result = await client.sendTelemetry({
      sep_version: '0.1.0',
      telemetry: {
        session_id: '00000000-0000-0000-0000-000000000000',
        items: [{ item_id: '11111111-1111-1111-1111-111111111111', viewed: true }],
        session_completed: true,
        session_satisfaction: 0.8,
      },
    });
    assert.equal(result.received, true);
  });

  it('should GET browse with params', async () => {
    mockHandler = (req, res) => {
      const url = new URL(req.url, baseUrl);
      assert.equal(url.pathname, '/sep/browse');
      assert.equal(url.searchParams.get('limit'), '10');
      assert.equal(url.searchParams.get('category'), 'fitness');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: FIXTURES.slice(0, 2) }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    const result = await client.browse({ limit: 10, category: 'fitness' });
    assert.equal(result.items.length, 2);
  });

  it('should handle HTTP errors', async () => {
    mockHandler = (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    await assert.rejects(
      () => client.getManifest(),
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it('should cache manifest', async () => {
    let callCount = 0;
    mockHandler = (req, res) => {
      callCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ provider_id: 'cached' }));
    };

    const client = new SEPClient(baseUrl, { timeoutMs: 5000, maxRetries: 0 });
    await client.manifest();
    await client.manifest();
    assert.equal(callCount, 1, 'Should only fetch manifest once');
  });
});

// -- Multi-Source tests --

import { deduplicateItems } from '../src/sep-client/multi-source.mjs';
import { MultiSource } from '../src/sep-client/multi-source.mjs';

describe('MultiSource', () => {
  it('should deduplicate items by item_id', () => {
    const items = [
      { item_id: 'a', title: 'first' },
      { item_id: 'b', title: 'second' },
      { item_id: 'a', title: 'duplicate' },
      { item_id: 'c', title: 'third' },
    ];
    const deduped = deduplicateItems(items);
    assert.equal(deduped.length, 3);
    assert.equal(deduped[0].title, 'first'); // First occurrence wins
  });

  it('should return empty result with no providers', async () => {
    const ms = new MultiSource();
    const result = await ms.queryAll({ intent: { weights: {} } });
    assert.equal(result.items.length, 0);
    assert.equal(result.all_failed, false);
  });

  describe('with mock providers', () => {
    let servers = [];
    let urls = [];

    beforeEach(async () => {
      servers = [];
      urls = [];
    });

    afterEach(async () => {
      for (const s of servers) {
        await new Promise(resolve => s.close(resolve));
      }
    });

    async function createMockProvider(items, options = {}) {
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          if (options.fail) {
            res.writeHead(500);
            res.end('Internal error');
            return;
          }

          if (req.url === '/sep/manifest') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              sep_version: '0.1.0',
              provider_id: options.id || 'test',
              provider_name: 'Test',
              supported_models: ['negotiated'],
              supported_content_types: ['video'],
              enrichment_schema_version: '0.1.0',
              max_payload_size: 50,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            sep_version: '0.1.0',
            provider_id: options.id || 'test',
            response_type: 'payload',
            payload: {
              items,
              total_available: items.length,
              returned: items.length,
              confidence: 0.8,
              state_token: options.stateToken || null,
            },
          }));
        });
      });

      await new Promise(resolve => server.listen(0, resolve));
      const url = `http://localhost:${server.address().port}`;
      servers.push(server);
      urls.push(url);
      return url;
    }

    it('should query multiple providers and merge results', async () => {
      const url1 = await createMockProvider(FIXTURES.slice(0, 3), { id: 'provider-1' });
      const url2 = await createMockProvider(FIXTURES.slice(3, 6), { id: 'provider-2' });

      const ms = new MultiSource({ timeoutMs: 5000, maxRetries: 0 });
      ms.addProvider(url1);
      ms.addProvider(url2);

      const result = await ms.queryAll({
        sep_version: '0.1.0',
        consumer_id: 'test',
        intent: {
          session_type: 'composed',
          target_duration_minutes: 15,
          weights: { fitness: 0.5 },
          filters: {},
          context: {},
        },
        disclosure_level: 'minimal',
        telemetry_opt_in: false,
      });

      assert.equal(result.providers.length, 2);
      assert.ok(result.items.length >= 5); // 3 + 3, minus any dups
      assert.equal(result.all_failed, false);
    });

    it('should handle partial failures gracefully', async () => {
      const url1 = await createMockProvider(FIXTURES.slice(0, 3), { id: 'good-provider' });
      const url2 = await createMockProvider([], { id: 'bad-provider', fail: true });

      const ms = new MultiSource({ timeoutMs: 5000, maxRetries: 0 });
      ms.addProvider(url1);
      ms.addProvider(url2);

      const result = await ms.queryAll({
        sep_version: '0.1.0',
        consumer_id: 'test',
        intent: { session_type: 'composed', target_duration_minutes: 15, weights: {}, filters: {}, context: {} },
        disclosure_level: 'minimal',
        telemetry_opt_in: false,
      });

      assert.equal(result.partial, true);
      assert.ok(result.items.length > 0, 'Should have items from successful provider');
      assert.ok(result.errors.length > 0, 'Should have errors from failed provider');
    });

    it('should deduplicate across providers', async () => {
      // Both providers return overlapping items
      const url1 = await createMockProvider(FIXTURES.slice(0, 4), { id: 'p1' });
      const url2 = await createMockProvider(FIXTURES.slice(2, 6), { id: 'p2' });

      const ms = new MultiSource({ timeoutMs: 5000, maxRetries: 0 });
      ms.addProvider(url1);
      ms.addProvider(url2);

      const result = await ms.queryAll({
        sep_version: '0.1.0',
        consumer_id: 'test',
        intent: { session_type: 'composed', target_duration_minutes: 15, weights: {}, filters: {}, context: {} },
        disclosure_level: 'minimal',
        telemetry_opt_in: false,
      });

      const uniqueIds = new Set(result.items.map(i => i.item_id));
      assert.equal(uniqueIds.size, result.items.length, 'No duplicate items');
    });

    it('should fetch all manifests', async () => {
      const url1 = await createMockProvider([], { id: 'manifest-test-1' });
      const url2 = await createMockProvider([], { id: 'manifest-test-2' });

      const ms = new MultiSource({ timeoutMs: 5000, maxRetries: 0 });
      ms.addProvider(url1);
      ms.addProvider(url2);

      const manifests = await ms.fetchAllManifests();
      assert.equal(manifests.length, 2);
      assert.ok(manifests.every(m => m.manifest != null));
    });
  });
});
