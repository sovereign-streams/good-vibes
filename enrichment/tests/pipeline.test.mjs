import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../src/pipeline.mjs';
import { LLMTagger } from '../src/enrichers/llm-tagger.mjs';
import { TranscriptFetcher } from '../src/enrichers/transcript.mjs';
import { EthicalFilter } from '../src/guardrails/ethical-filter.mjs';
import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';
import { Validator } from '../src/lib/validator.mjs';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-pipeline.db');

// Mock source that returns fixture data
class MockSource {
  constructor(fixtures) {
    this.fixtures = fixtures;
  }
  get name() { return 'mock'; }
  async search() { return this.fixtures; }
  async getVideoDetails(ids) { return this.fixtures.filter(f => ids.includes(f.videoId)); }
}

describe('Pipeline', () => {
  let store;
  let pipeline;
  let fixtures;

  beforeEach(async () => {
    fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'raw-youtube-meta.json'), 'utf-8'));
    const adapter = new SQLiteAdapter(TEST_DB);
    store = new IndexStore(adapter);
    await store.initialize();

    const taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    const tagger = new LLMTagger({ llmClient: null, taxonomy });
    const transcriptFetcher = new TranscriptFetcher();
    const filter = new EthicalFilter();
    const validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
    const source = new MockSource(fixtures);

    pipeline = new Pipeline({ source, tagger, transcriptFetcher, filter, store, validator });
  });

  afterEach(async () => {
    await store.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('should enrich a single item', async () => {
    const result = await pipeline.enrichItem(fixtures[0]);
    assert.ok(result);
    assert.ok(result.item_id);
    assert.equal(result.source.platform, 'youtube');
    assert.equal(result.source.origin_id, 'abc123def456');
    assert.ok(result.enrichment);
    assert.ok(result.enrichment.categories.length > 0);
    assert.ok(result.enrichment.emotional_tone.primary);
  });

  it('should process a batch', async () => {
    const envelopes = await pipeline.enrichBatch(fixtures.slice(0, 3));
    assert.ok(pipeline.stats.processed >= 3);
    assert.ok(envelopes.length >= 1);
  });

  it('should store enriched items', async () => {
    const item = await pipeline.enrichItem(fixtures[0]);
    await store.put(item);
    const retrieved = await store.get(item.item_id);
    assert.ok(retrieved);
    assert.equal(retrieved.meta.title, fixtures[0].title);
  });

  it('should skip duplicate items', async () => {
    const item = await pipeline.enrichItem(fixtures[0]);
    await store.put(item);
    const item2 = await pipeline.enrichItem(fixtures[0]);
    await store.put(item2);
    // Should not throw, just upsert
    const stats = await store.stats();
    assert.equal(stats.totalItems, 1);
  });

  it('should handle the full pipeline run', async () => {
    const result = await pipeline.run({ query: 'test', maxResults: 5 });
    assert.ok(result.stats.processed > 0);
  });
});
