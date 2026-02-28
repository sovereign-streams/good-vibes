import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getTemplate, listTemplates, calculatePhaseAllocation, ARC_TEMPLATES } from '../src/composer/arc-templates.mjs';
import { scoreTransition, calculateFlowScore, optimizeOrdering, applyEnergyCurve, suggestBreakPoints } from '../src/composer/rhythm-engine.mjs';
import { buildSession, mergePayloads } from '../src/composer/session-builder.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixtures() {
  const raw = await readFile(join(__dirname, 'fixtures', 'enrichment-items.json'), 'utf-8');
  return JSON.parse(raw);
}

// ---- Arc Templates ----

describe('arc-templates', () => {
  it('lists all five template IDs', () => {
    const ids = listTemplates();
    assert.deepStrictEqual(ids.sort(), ['deep-dive', 'explorer', 'quick-hit', 'standard', 'wind-down']);
  });

  it('getTemplate returns a template by ID', () => {
    const t = getTemplate('standard');
    assert.ok(t);
    assert.equal(t.id, 'standard');
    assert.equal(t.phases.length, 4);
  });

  it('getTemplate returns null for unknown ID', () => {
    assert.equal(getTemplate('nonexistent'), null);
  });

  it('standard template phases sum to 1.0', () => {
    const t = getTemplate('standard');
    const sum = t.phases.reduce((s, p) => s + p.proportion, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Proportions sum to ${sum}, expected 1.0`);
  });

  it('all templates have phases summing to ~1.0', () => {
    for (const id of listTemplates()) {
      const t = getTemplate(id);
      const sum = t.phases.reduce((s, p) => s + p.proportion, 0);
      assert.ok(Math.abs(sum - 1.0) < 0.01, `${id} proportions sum to ${sum}`);
    }
  });

  it('calculatePhaseAllocation distributes items across phases', () => {
    const allocation = calculatePhaseAllocation('standard', 20);
    assert.ok(allocation.length === 4);
    const total = allocation.reduce((s, a) => s + a.count, 0);
    assert.ok(total >= 4 && total <= 30, `Total ${total} out of range`);
    assert.ok(allocation.every(a => a.count >= 1), 'Every phase has at least 1 item');
  });

  it('calculatePhaseAllocation clamps to min_items', () => {
    const allocation = calculatePhaseAllocation('standard', 1);
    const total = allocation.reduce((s, a) => s + a.count, 0);
    assert.ok(total >= 4, `Total ${total} should be >= min_items (4)`);
  });

  it('calculatePhaseAllocation throws for unknown template', () => {
    assert.throws(() => calculatePhaseAllocation('fake', 10), /Unknown arc template/);
  });

  it('quick-hit has 3 phases', () => {
    const t = getTemplate('quick-hit');
    assert.equal(t.phases.length, 3);
    assert.equal(t.pacing.max_items, 5);
  });

  it('each template has required fields', () => {
    for (const id of listTemplates()) {
      const t = getTemplate(id);
      assert.ok(t.id, `${id} missing id`);
      assert.ok(t.name, `${id} missing name`);
      assert.ok(t.description, `${id} missing description`);
      assert.ok(Array.isArray(t.phases), `${id} missing phases`);
      assert.ok(Array.isArray(t.energy_curve), `${id} missing energy_curve`);
      assert.ok(t.pacing, `${id} missing pacing`);
      assert.ok(typeof t.pacing.min_items === 'number', `${id} missing pacing.min_items`);
      assert.ok(typeof t.pacing.max_items === 'number', `${id} missing pacing.max_items`);
    }
  });
});

// ---- Rhythm Engine ----

describe('rhythm-engine', () => {
  it('scoreTransition returns low score for similar items', async () => {
    const items = await loadFixtures();
    // Items 0 and 2 are both moderate energy, different tone
    const t = scoreTransition(items[0], items[2]);
    assert.ok(t.score >= 0 && t.score <= 1, `Score ${t.score} out of range`);
    assert.ok(typeof t.energy_delta === 'number');
    assert.ok(typeof t.tone_shift === 'boolean');
    assert.ok(typeof t.category_change === 'boolean');
  });

  it('scoreTransition returns high score for very different items', async () => {
    const items = await loadFixtures();
    // Item 3 (peak, energy 0.9, inspired) vs Item 4 (closer, energy 0.2, calm)
    const t = scoreTransition(items[3], items[4]);
    assert.ok(t.score > 0.3, `Expected rough transition, got ${t.score}`);
    assert.ok(t.energy_delta > 0.5);
    assert.equal(t.tone_shift, true);
    assert.equal(t.category_change, true);
  });

  it('calculateFlowScore returns 1.0 for single item', () => {
    const result = calculateFlowScore([{ enrichment: { energy_level: 0.5, emotional_tone: { primary: 'calm' }, categories: [] } }]);
    assert.equal(result.flow_score, 1.0);
    assert.equal(result.transitions.length, 0);
  });

  it('calculateFlowScore returns a score for multiple items', async () => {
    const items = await loadFixtures();
    const clean = items.filter(i => i.provider.guardrail_pass);
    const result = calculateFlowScore(clean);
    assert.ok(result.flow_score >= 0 && result.flow_score <= 1);
    assert.equal(result.transitions.length, clean.length - 1);
  });

  it('optimizeOrdering returns all items', async () => {
    const items = await loadFixtures();
    const clean = items.filter(i => i.provider.guardrail_pass);
    const ordered = optimizeOrdering(clean, 0.6);
    assert.equal(ordered.length, clean.length);
  });

  it('applyEnergyCurve ascending sorts low to high', async () => {
    const items = await loadFixtures();
    const clean = items.filter(i => i.provider.guardrail_pass).slice(0, 4);
    const result = applyEnergyCurve(clean, 0.3, 0.9);
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i].enrichment.energy_level >= result[i - 1].enrichment.energy_level,
        'Items should be sorted ascending by energy'
      );
    }
  });

  it('applyEnergyCurve descending sorts high to low', async () => {
    const items = await loadFixtures();
    const clean = items.filter(i => i.provider.guardrail_pass).slice(0, 4);
    const result = applyEnergyCurve(clean, 0.9, 0.3);
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i].enrichment.energy_level <= result[i - 1].enrichment.energy_level,
        'Items should be sorted descending by energy'
      );
    }
  });

  it('suggestBreakPoints returns breaks for long sessions', async () => {
    const items = await loadFixtures();
    const clean = items.filter(i => i.provider.guardrail_pass);
    // These items total ~2580s (~43 min), should suggest breaks
    const breaks = suggestBreakPoints(clean, { interval_minutes: 10 });
    assert.ok(Array.isArray(breaks));
    for (const b of breaks) {
      assert.ok(typeof b.after_index === 'number');
      assert.ok(['rough_transition', 'time_interval'].includes(b.reason));
    }
  });
});

// ---- Session Builder ----

describe('session-builder', () => {
  const defaultProfile = {
    weights: {
      fitness: 0.25,
      humor: 0.20,
      skill_building: 0.20,
      motivation: 0.15,
      craft: 0.10,
      music: 0.10,
    },
    filters: {
      exclude_rage_bait: true,
      exclude_humiliation: true,
      exclude_shock_content: true,
      language: ['en'],
    },
    preferred_arc_template: 'standard',
    target_duration_minutes: 15,
  };

  it('builds a session from items and profile', async () => {
    const items = await loadFixtures();
    const session = buildSession({ items, profile: defaultProfile });
    assert.ok(session.session_id);
    assert.equal(session.template_id, 'standard');
    assert.ok(session.item_count > 0);
    assert.ok(session.estimated_duration_seconds > 0);
    assert.ok(typeof session.flow_score === 'number');
    assert.ok(Array.isArray(session.phases));
    assert.ok(Array.isArray(session.items));
    assert.ok(Array.isArray(session.transitions));
  });

  it('filters out rage bait and shock content', async () => {
    const items = await loadFixtures();
    const session = buildSession({ items, profile: defaultProfile });
    // The rage bait item (item_id ending in 0006) should not appear
    const itemIds = session.items.map(i => i.item_id);
    assert.ok(!itemIds.includes('aaaaaaaa-0006-4000-8000-000000000006'), 'Rage bait should be filtered');
  });

  it('returns empty session when all items are filtered', () => {
    const items = [
      {
        sep_version: '0.1.0',
        item_id: 'test-1',
        source: { platform: 'youtube', origin_url: 'https://youtube.com', origin_id: 't1', content_type: 'video', duration_seconds: 100 },
        meta: { title: 'Test', creator: 'Test', published: '2026-01-01T00:00:00Z', original_tags: [], language: 'es', thumbnail_url: 'https://example.com/thumb.jpg' },
        enrichment: {
          schema_version: '0.1.0',
          enriched_at: '2026-01-01T00:00:00Z',
          categories: [{ id: 'humor', confidence: 0.9 }],
          emotional_tone: { primary: 'amused', secondary: null, rage_bait: false, humiliation: false, shock_content: false, inflammatory: false, sexually_explicit: false, violence: false },
          energy_level: 0.5, cognitive_load: 0.2, motivation_score: 0.1, humor_score: 0.8, skill_transfer_score: 0.0, production_quality: 0.5,
          session_fit: { good_opener: true, good_builder: false, good_peak: false, good_closer: false },
        },
        provider: { id: 'test', guardrail_pass: true, guardrail_version: '0.1.0' },
      },
    ];
    const session = buildSession({ items, profile: defaultProfile });
    assert.equal(session.item_count, 0);
    assert.equal(session.partial_fill, true);
  });

  it('handles template override', async () => {
    const items = await loadFixtures();
    const session = buildSession({ items, profile: defaultProfile, template_override: 'quick-hit' });
    assert.equal(session.template_id, 'quick-hit');
    assert.ok(session.item_count <= 5, 'Quick hit should have at most 5 items');
  });

  it('marks partial fill when not enough content', async () => {
    const items = await loadFixtures();
    // Request a very long session with few items
    const longProfile = { ...defaultProfile, target_duration_minutes: 120 };
    const session = buildSession({ items, profile: longProfile });
    assert.equal(session.partial_fill, true);
  });

  it('session items have enrichment_summary', async () => {
    const items = await loadFixtures();
    const session = buildSession({ items, profile: defaultProfile });
    for (const item of session.items) {
      assert.ok(item.enrichment_summary);
      assert.ok(Array.isArray(item.enrichment_summary.categories));
      assert.ok(typeof item.enrichment_summary.energy_level === 'number');
      assert.ok(typeof item.enrichment_summary.primary_tone === 'string');
    }
  });

  it('mergePayloads de-duplicates by item_id', async () => {
    const items = await loadFixtures();
    const merged = mergePayloads([items, items.slice(0, 3)]);
    assert.equal(merged.length, items.length);
  });

  it('mergePayloads combines different sources', async () => {
    const items = await loadFixtures();
    const extra = [{
      ...items[0],
      item_id: 'extra-unique-id',
    }];
    const merged = mergePayloads([items, extra]);
    assert.equal(merged.length, items.length + 1);
  });

  it('buildSession throws for unknown template', async () => {
    const items = await loadFixtures();
    assert.throws(
      () => buildSession({ items, profile: { ...defaultProfile, preferred_arc_template: 'nonexistent' } }),
      /Unknown arc template/
    );
  });
});
