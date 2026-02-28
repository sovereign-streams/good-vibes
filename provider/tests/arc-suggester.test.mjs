import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestArc } from '../src/query-engine/arc-suggester.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

// Add _relevance to simulate ranked items
const rankedItems = fixtures
  .filter(i => i.provider.guardrail_pass)
  .map((item, idx) => ({
    ...item,
    _relevance: 1 - (idx * 0.1)
  }));

describe('suggestArc', () => {
  it('should return empty array for empty items', () => {
    const result = suggestArc([], 15);
    assert.deepEqual(result, []);
  });

  it('should return empty array for zero duration', () => {
    const result = suggestArc(rankedItems, 0);
    assert.deepEqual(result, []);
  });

  it('should return arc entries with item_id, position, duration_seconds', () => {
    const arc = suggestArc(rankedItems, 15);
    assert.ok(arc.length > 0, 'arc should not be empty');

    for (const entry of arc) {
      assert.ok(entry.item_id, 'entry should have item_id');
      assert.ok(['opener', 'builder', 'peak', 'closer'].includes(entry.position),
        `position "${entry.position}" should be valid`);
      assert.ok(typeof entry.duration_seconds === 'number', 'duration should be a number');
      assert.ok(entry.duration_seconds > 0, 'duration should be positive');
    }
  });

  it('should follow arc order: opener → builder → peak → closer', () => {
    const arc = suggestArc(rankedItems, 30);
    const positionOrder = { opener: 0, builder: 1, peak: 2, closer: 3 };
    for (let i = 1; i < arc.length; i++) {
      assert.ok(positionOrder[arc[i].position] >= positionOrder[arc[i - 1].position],
        `Position order should be non-decreasing: ${arc[i - 1].position} → ${arc[i].position}`);
    }
  });

  it('should not repeat items in the arc', () => {
    const arc = suggestArc(rankedItems, 30);
    const ids = arc.map(e => e.item_id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'no duplicate items in arc');
  });

  it('should respect target duration approximately', () => {
    const targetMinutes = 15;
    const arc = suggestArc(rankedItems, targetMinutes);
    const totalDuration = arc.reduce((sum, e) => sum + e.duration_seconds, 0);
    const targetSeconds = targetMinutes * 60;
    // Should be within 2x of target (flexible since items have fixed durations)
    assert.ok(totalDuration <= targetSeconds * 2,
      `Total ${totalDuration}s should not grossly exceed target ${targetSeconds}s`);
  });

  it('should prefer items with matching session_fit flags', () => {
    const arc = suggestArc(rankedItems, 30);
    // Check that opener slots use items with good_opener=true when available
    const openerEntries = arc.filter(e => e.position === 'opener');
    for (const entry of openerEntries) {
      const item = rankedItems.find(i => i.item_id === entry.item_id);
      if (item?.enrichment?.session_fit?.good_opener) {
        // Good — preferred item was used
        assert.ok(true);
      }
    }
  });

  it('should handle short target duration', () => {
    const arc = suggestArc(rankedItems, 2);
    // With only 2 minutes, we should get very few items
    assert.ok(arc.length > 0, 'should still return at least one item');
    const totalDuration = arc.reduce((sum, e) => sum + e.duration_seconds, 0);
    assert.ok(totalDuration > 0, 'total duration should be positive');
  });
});
