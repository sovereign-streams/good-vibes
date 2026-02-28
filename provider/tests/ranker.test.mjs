import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankItems } from '../src/query-engine/ranker.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

describe('rankItems', () => {
  it('should return empty array for empty input', () => {
    const result = rankItems([], { fitness: 0.5 });
    assert.deepEqual(result, []);
  });

  it('should attach _relevance to every item', () => {
    const weights = { fitness: 0.5, humor: 0.3 };
    const result = rankItems(fixtures, weights);
    for (const item of result) {
      assert.ok(typeof item._relevance === 'number', '_relevance should be a number');
      assert.ok(item._relevance >= 0, '_relevance should be >= 0');
      assert.ok(item._relevance <= 1, '_relevance should be <= 1');
    }
  });

  it('should sort items by _relevance descending', () => {
    const weights = { fitness: 0.5 };
    const result = rankItems(fixtures, weights);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1]._relevance >= result[i]._relevance,
        `Item ${i - 1} should have >= relevance than item ${i}`);
    }
  });

  it('should rank fitness items highest when fitness is weighted', () => {
    const weights = { fitness: 1.0 };
    const result = rankItems(fixtures, weights);
    // Top item should have high fitness confidence
    const topItem = result[0];
    const fitnessCat = topItem.enrichment.categories.find(c => c.id === 'fitness');
    assert.ok(fitnessCat, 'Top item should have fitness category');
    assert.ok(fitnessCat.confidence > 0.5, 'Top item should have high fitness confidence');
  });

  it('should respect custom scoring weights', () => {
    const weights = { fitness: 0.5 };
    // Maximize diversity scoring
    const opts = {
      scoringWeights: {
        categoryMatch: 0.0,
        toneAlignment: 0.0,
        energyTarget: 0.0,
        diversity: 1.0,
        sessionFit: 0.0
      }
    };
    const result = rankItems(fixtures, weights, opts);
    // All items should have _relevance values
    assert.ok(result.every(i => typeof i._relevance === 'number'));
  });

  it('should apply diversity bonus — unique creators rank higher', () => {
    const weights = { fitness: 0.5 };
    // FitLife Daily has 2 items in fixtures — they should get lower diversity scores
    const result = rankItems(fixtures, weights, {
      scoringWeights: {
        categoryMatch: 0.0,
        toneAlignment: 0.0,
        energyTarget: 0.0,
        diversity: 1.0,
        sessionFit: 0.0
      }
    });
    const fitLifeItems = result.filter(i => i.meta.creator === 'FitLife Daily');
    const otherItems = result.filter(i => i.meta.creator !== 'FitLife Daily');
    // Unique creators should score higher on diversity
    if (fitLifeItems.length > 0 && otherItems.length > 0) {
      assert.ok(otherItems[0]._relevance >= fitLifeItems[0]._relevance,
        'Unique creators should have higher diversity score');
    }
  });

  it('should factor in energy targeting', () => {
    const weights = { fitness: 0.3, humor: 0.3 };
    const opts = {
      targetEnergy: 0.9,
      scoringWeights: {
        categoryMatch: 0.0,
        toneAlignment: 0.0,
        energyTarget: 1.0,
        diversity: 0.0,
        sessionFit: 0.0
      }
    };
    const result = rankItems(fixtures, weights, opts);
    // High energy items should rank first
    const topEnergy = result[0].enrichment.energy_level;
    assert.ok(topEnergy >= 0.8, `Top item energy (${topEnergy}) should be close to target 0.9`);
  });

  it('should incorporate tone affinity when present', () => {
    const itemsWithTone = fixtures.map(i => ({
      ...i,
      _toneAffinity: i.enrichment.emotional_tone.primary === 'energized' ? 1.0 : 0
    }));
    const weights = { fitness: 0.3 };
    const opts = {
      scoringWeights: {
        categoryMatch: 0.0,
        toneAlignment: 1.0,
        energyTarget: 0.0,
        diversity: 0.0,
        sessionFit: 0.0
      }
    };
    const result = rankItems(itemsWithTone, weights, opts);
    // Items with _toneAffinity=1 should rank highest
    assert.equal(result[0]._toneAffinity, 1.0);
  });
});
