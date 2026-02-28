import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { matchItems } from '../src/query-engine/matcher.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

/** In-memory mock store that mimics IndexStore.query(). */
function createMockStore(items) {
  return {
    query: async (filters) => {
      let result = [...items];

      if (filters.guardrailPass !== undefined) {
        result = result.filter(i => i.provider.guardrail_pass === filters.guardrailPass);
      }
      if (filters.contentType) {
        result = result.filter(i => i.source.content_type === filters.contentType);
      }
      if (filters.language) {
        result = result.filter(i => i.meta.language === filters.language);
      }
      if (filters.categories?.length) {
        result = result.filter(i => {
          const cats = (i.enrichment.categories || []).map(c => c.id);
          return filters.categories.some(cat => cats.includes(cat));
        });
      }
      if (filters.limit) {
        result = result.slice(0, filters.limit);
      }
      return result;
    }
  };
}

describe('matchItems', () => {
  let store;

  beforeEach(() => {
    store = createMockStore(fixtures);
  });

  it('should return items matching weighted categories', async () => {
    const intent = {
      weights: { fitness: 0.5 },
      filters: {}
    };
    const items = await matchItems(store, intent);
    assert.ok(items.length > 0);
    // Every returned item should have a fitness category
    for (const item of items) {
      const cats = item.enrichment.categories.map(c => c.id);
      assert.ok(cats.includes('fitness'), `Item ${item.item_id} should have fitness category`);
    }
  });

  it('should exclude rage bait when filter is set', async () => {
    const intent = {
      weights: { motivation: 0.5 },
      filters: { exclude_rage_bait: true }
    };
    const items = await matchItems(store, intent);
    for (const item of items) {
      assert.ok(!item.enrichment.emotional_tone?.rage_bait, 'no rage bait items');
    }
  });

  it('should filter by min_energy_level', async () => {
    const intent = {
      weights: { fitness: 0.5, motivation: 0.3 },
      filters: { min_energy_level: 0.8 }
    };
    const items = await matchItems(store, intent);
    for (const item of items) {
      assert.ok(item.enrichment.energy_level >= 0.8,
        `Item energy ${item.enrichment.energy_level} should be >= 0.8`);
    }
  });

  it('should filter by max_cognitive_load', async () => {
    const intent = {
      weights: { fitness: 0.3, humor: 0.3 },
      filters: { max_cognitive_load: 0.3 }
    };
    const items = await matchItems(store, intent);
    for (const item of items) {
      assert.ok(item.enrichment.cognitive_load <= 0.3,
        `Item cognitive_load ${item.enrichment.cognitive_load} should be <= 0.3`);
    }
  });

  it('should exclude previously served items', async () => {
    const intent = {
      weights: { fitness: 0.5 },
      filters: {}
    };
    const excludeIds = new Set(['11111111-1111-1111-1111-111111111111']);
    const items = await matchItems(store, intent, { excludeIds });
    const ids = items.map(i => i.item_id);
    assert.ok(!ids.includes('11111111-1111-1111-1111-111111111111'));
  });

  it('should add _toneAffinity based on time_of_day', async () => {
    const intent = {
      weights: { fitness: 0.3, humor: 0.3 },
      filters: {},
      context: { time_of_day: 'morning' }
    };
    const items = await matchItems(store, intent);
    // Morning prefers energized, inspired, focused
    const energizedItem = items.find(i => i.enrichment.emotional_tone.primary === 'energized');
    if (energizedItem) {
      assert.equal(energizedItem._toneAffinity, 1.0, 'energized should have full affinity in morning');
    }
  });

  it('should handle empty weights gracefully', async () => {
    const intent = {
      weights: {},
      filters: {}
    };
    const items = await matchItems(store, intent);
    assert.ok(items.length > 0, 'should return items even with empty weights');
  });

  it('should filter by content_type via store query', async () => {
    const intent = {
      weights: { music: 0.5 },
      filters: { content_type: 'music' }
    };
    const store2 = createMockStore(fixtures);
    const items = await matchItems(store2, intent);
    // The only music item in fixtures is the Lo-Fi one
    for (const item of items) {
      assert.equal(item.source.content_type, 'music');
    }
  });
});
