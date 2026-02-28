import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { interpretItem, interpretSession, SIGNAL_WEIGHTS } from '../src/enrichment/behavior-interpreter.mjs';
import { aggregateSignals, calculateAdjustments, generateProposal } from '../src/enrichment/preference-updater.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixtures() {
  const raw = await readFile(join(__dirname, 'fixtures', 'enrichment-items.json'), 'utf-8');
  return JSON.parse(raw);
}

function buildEnrichmentMap(items) {
  const map = new Map();
  for (const item of items) {
    map.set(item.item_id, item);
  }
  return map;
}

// ---- Behavior Interpreter ----

describe('behavior-interpreter', () => {
  it('completed viewing produces strong positive signal', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[0].item_id, viewed: true, completed: true },
      items[0]
    );
    assert.ok(result.signals.length > 0);
    const completed = result.signals.find(s => s.type === 'completed');
    assert.ok(completed);
    assert.equal(completed.strength, SIGNAL_WEIGHTS.completed);
    assert.deepStrictEqual(result.categories, ['fitness']);
  });

  it('early skip produces negative signal', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[1].item_id, viewed: true, completed: false, skipped_at_seconds: 30 },
      items[1]  // duration 600s, so 30s = 5% = early skip
    );
    const skip = result.signals.find(s => s.type === 'skipped_early');
    assert.ok(skip, 'Should detect early skip');
    assert.ok(skip.strength < 0, 'Early skip should be negative');
  });

  it('mid skip produces mild negative signal', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[1].item_id, viewed: true, completed: false, skipped_at_seconds: 240 },
      items[1]  // duration 600s, so 240s = 40% = mid skip
    );
    const skip = result.signals.find(s => s.type === 'skipped_mid');
    assert.ok(skip, 'Should detect mid skip');
    assert.ok(skip.strength < 0);
    assert.ok(skip.strength > SIGNAL_WEIGHTS.skipped_early, 'Mid skip less negative than early skip');
  });

  it('replay produces very strong positive signal', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[0].item_id, viewed: true, completed: true, rewatched: true },
      items[0]
    );
    const replay = result.signals.find(s => s.type === 'replayed');
    assert.ok(replay);
    assert.equal(replay.strength, SIGNAL_WEIGHTS.replayed);
  });

  it('paused and returned produces moderate positive', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[0].item_id, viewed: true, completed: true, paused: true, paused_at_seconds: 60 },
      items[0]
    );
    const paused = result.signals.find(s => s.type === 'paused_and_returned');
    assert.ok(paused);
    assert.equal(paused.strength, SIGNAL_WEIGHTS.paused_and_returned);
  });

  it('unviewed item produces no signals', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[0].item_id, viewed: false },
      items[0]
    );
    assert.equal(result.signals.length, 0);
  });

  it('liked item produces strong positive', async () => {
    const items = await loadFixtures();
    const result = interpretItem(
      { item_id: items[0].item_id, viewed: true, completed: true, liked: true },
      items[0]
    );
    const liked = result.signals.find(s => s.type === 'liked');
    assert.ok(liked);
    assert.equal(liked.strength, SIGNAL_WEIGHTS.liked);
  });

  it('interpretSession aggregates per category and tone', async () => {
    const items = await loadFixtures();
    const enrichmentMap = buildEnrichmentMap(items);

    const telemetry = {
      session_id: 'test-session-1',
      items: [
        { item_id: items[0].item_id, viewed: true, completed: true },       // fitness, energized
        { item_id: items[1].item_id, viewed: true, completed: false, skipped_at_seconds: 30 },  // skill, focused, early skip
        { item_id: items[3].item_id, viewed: true, completed: true, rewatched: true },  // motivation, inspired
      ],
      session_completed: true,
      session_satisfaction: 0.7,
    };

    const result = interpretSession(telemetry, enrichmentMap);
    assert.equal(result.session_id, 'test-session-1');
    assert.equal(result.session_completed, true);
    assert.equal(result.item_count, 3);

    // fitness got positive signals
    assert.ok(result.category_signals.fitness > 0, 'Fitness should be positive');
    // skill_building got negative (early skip)
    assert.ok(result.category_signals.skill_building < 0, 'Skill building should be negative (skipped)');
    // motivation got very strong positive (completed + replayed)
    assert.ok(result.category_signals.motivation > result.category_signals.fitness, 'Motivation (replayed) should be higher');
  });

  it('interpretSession detects abandonment', async () => {
    const items = await loadFixtures();
    const enrichmentMap = buildEnrichmentMap(items);

    const telemetry = {
      session_id: 'abandoned-session',
      items: [
        { item_id: items[0].item_id, viewed: true, completed: true },
        { item_id: items[1].item_id, viewed: true, completed: false, skipped_at_seconds: 60 },
        { item_id: items[3].item_id, viewed: false },
        { item_id: items[4].item_id, viewed: false },
      ],
      session_completed: false,
      session_satisfaction: 0.3,
    };

    const result = interpretSession(telemetry, enrichmentMap);
    assert.equal(result.session_completed, false);
    assert.ok(result.abandonment);
    assert.equal(result.abandonment.last_viewed_index, 1);
    assert.ok(result.abandonment.position_ratio > 0);
    assert.ok(result.abandonment.context);
  });
});

// ---- Preference Updater ----

describe('preference-updater', () => {
  const baseWeights = {
    fitness: 0.20,
    humor: 0.15,
    skill_building: 0.15,
    motivation: 0.15,
    craft: 0.10,
    music: 0.10,
    stoicism: 0.05,
    nature: 0.05,
    nutrition: 0.03,
    fatherhood: 0.02,
  };

  function makeSessionInterpretation(categorySignals, toneSignals = {}) {
    return {
      session_id: `session-${Math.random().toString(36).slice(2)}`,
      session_completed: true,
      session_satisfaction: 0.7,
      item_count: 5,
      category_signals: categorySignals,
      tone_signals: toneSignals,
      abandonment: null,
      item_details: [],
    };
  }

  it('aggregateSignals computes weighted averages', () => {
    const sessions = [
      makeSessionInterpretation({ fitness: 0.8, humor: -0.3 }),
      makeSessionInterpretation({ fitness: 0.6, humor: 0.2 }),
      makeSessionInterpretation({ fitness: 0.4, humor: 0.5 }),
    ];

    const result = aggregateSignals(sessions);
    assert.ok(result.category_scores.fitness > 0);
    assert.ok(typeof result.category_scores.humor === 'number');
    assert.equal(result.session_count, 3);
  });

  it('aggregateSignals applies decay (newer sessions matter more)', () => {
    const oldPositive = makeSessionInterpretation({ fitness: 1.0 });
    const recentNegative = makeSessionInterpretation({ fitness: -1.0 });

    // With high decay (0.5), old session should be heavily discounted
    const result = aggregateSignals([oldPositive, recentNegative], 0.5);
    assert.ok(result.category_scores.fitness < 0, 'Recent negative should dominate with high decay');
  });

  it('calculateAdjustments produces suggestions', () => {
    const aggregated = {
      category_scores: { fitness: 0.7, humor: -0.4 },
      tone_scores: { energized: 0.5 },
      session_count: 5,
    };

    const { suggestions, summary } = calculateAdjustments(baseWeights, aggregated, 0.1);

    assert.ok(suggestions.length > 0);
    const fitnessSuggestion = suggestions.find(s => s.category === 'fitness');
    assert.ok(fitnessSuggestion);
    assert.ok(fitnessSuggestion.suggested > fitnessSuggestion.current, 'Fitness should increase');
    assert.equal(fitnessSuggestion.direction, 'increase');

    const humorSuggestion = suggestions.find(s => s.category === 'humor');
    assert.ok(humorSuggestion);
    assert.ok(humorSuggestion.suggested < humorSuggestion.current, 'Humor should decrease');
    assert.equal(humorSuggestion.direction, 'decrease');

    assert.ok(summary.length > 0);
  });

  it('calculateAdjustments clamps weights to [0, 1]', () => {
    const extreme = {
      category_scores: { fitness: 10.0, humor: -10.0 },
      tone_scores: {},
      session_count: 1,
    };

    const { suggestions } = calculateAdjustments(baseWeights, extreme, 1.0);
    for (const s of suggestions) {
      assert.ok(s.suggested >= 0 && s.suggested <= 1, `${s.category} suggested ${s.suggested} out of range`);
    }
  });

  it('generateProposal returns insufficient_data for too few sessions', () => {
    const result = generateProposal({
      currentWeights: baseWeights,
      sessionHistory: [makeSessionInterpretation({ fitness: 0.5 })],
      minSessions: 3,
    });
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.sessions_needed, 3);
    assert.equal(result.suggestions.length, 0);
  });

  it('generateProposal returns ready with enough sessions', () => {
    const sessions = [
      makeSessionInterpretation({ fitness: 0.8, humor: -0.3 }),
      makeSessionInterpretation({ fitness: 0.7, humor: -0.2 }),
      makeSessionInterpretation({ fitness: 0.6, humor: 0.1 }),
    ];

    const result = generateProposal({
      currentWeights: baseWeights,
      sessionHistory: sessions,
      minSessions: 3,
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.auto_applied, false);
    assert.ok(result.suggestions.length > 0);
    assert.ok(result.proposed_weights);
    assert.ok(result.proposed_weights.fitness > baseWeights.fitness, 'Fitness weight should increase');
  });

  it('generateProposal never auto-applies', () => {
    const sessions = Array.from({ length: 5 }, () =>
      makeSessionInterpretation({ fitness: 1.0, humor: -1.0 })
    );

    const result = generateProposal({
      currentWeights: baseWeights,
      sessionHistory: sessions,
    });

    assert.equal(result.auto_applied, false);
  });

  it('proposed_weights preserves unchanged categories', () => {
    const sessions = [
      makeSessionInterpretation({ fitness: 0.5 }),
      makeSessionInterpretation({ fitness: 0.5 }),
      makeSessionInterpretation({ fitness: 0.5 }),
    ];

    const result = generateProposal({
      currentWeights: baseWeights,
      sessionHistory: sessions,
    });

    // Categories with no signals should remain unchanged
    assert.equal(result.proposed_weights.nature, baseWeights.nature);
    assert.equal(result.proposed_weights.fatherhood, baseWeights.fatherhood);
  });

  it('summary produces human-readable descriptions', () => {
    const sessions = [
      makeSessionInterpretation({ fitness: 0.9 }),
      makeSessionInterpretation({ fitness: 0.8 }),
      makeSessionInterpretation({ fitness: 0.7 }),
    ];

    const result = generateProposal({
      currentWeights: baseWeights,
      sessionHistory: sessions,
    });

    assert.ok(result.summary.length > 0);
    const fitnessMsg = result.summary.find(s => s.toLowerCase().includes('fitness'));
    assert.ok(fitnessMsg, 'Should mention fitness in summary');
  });
});

// ---- Default Profiles ----

describe('default-profiles', () => {
  const profileNames = [
    'morning-warrior',
    'evening-wind-down',
    'skill-sprint',
    'sunday-scroll',
    'good-vibes-default',
  ];

  for (const name of profileNames) {
    it(`${name}.json is valid`, async () => {
      const raw = await readFile(join(__dirname, '..', 'default-profiles', `${name}.json`), 'utf-8');
      const profile = JSON.parse(raw);

      assert.ok(profile.id, 'has id');
      assert.ok(profile.name, 'has name');
      assert.ok(profile.description, 'has description');
      assert.ok(profile.weights, 'has weights');
      assert.ok(profile.filters, 'has filters');
      assert.ok(profile.preferred_arc_template, 'has preferred_arc_template');
      assert.ok(typeof profile.target_duration_minutes === 'number', 'has target_duration_minutes');
      assert.ok(profile.energy_preferences, 'has energy_preferences');
      assert.ok(profile.tone_preferences, 'has tone_preferences');

      // Weights should all be between 0 and 1
      for (const [cat, w] of Object.entries(profile.weights)) {
        assert.ok(w >= 0 && w <= 1, `${name}: weight for ${cat} is ${w}, expected [0,1]`);
      }

      // Should reference a valid arc template
      const validTemplates = ['standard', 'quick-hit', 'deep-dive', 'wind-down', 'explorer'];
      assert.ok(
        validTemplates.includes(profile.preferred_arc_template),
        `${name}: invalid arc template ${profile.preferred_arc_template}`
      );
    });
  }

  it('good-vibes-default is balanced', async () => {
    const raw = await readFile(join(__dirname, '..', 'default-profiles', 'good-vibes-default.json'), 'utf-8');
    const profile = JSON.parse(raw);
    // Should have weights for most categories
    const catCount = Object.keys(profile.weights).length;
    assert.ok(catCount >= 10, `Default profile should cover many categories (has ${catCount})`);
  });

  it('skill-sprint is 80% skill_building', async () => {
    const raw = await readFile(join(__dirname, '..', 'default-profiles', 'skill-sprint.json'), 'utf-8');
    const profile = JSON.parse(raw);
    assert.equal(profile.weights.skill_building, 0.80);
    assert.equal(profile.preferred_arc_template, 'deep-dive');
  });

  it('morning-warrior has high energy minimum', async () => {
    const raw = await readFile(join(__dirname, '..', 'default-profiles', 'morning-warrior.json'), 'utf-8');
    const profile = JSON.parse(raw);
    assert.ok(profile.filters.min_energy_level >= 0.5, 'Morning warrior should require high energy');
    assert.ok(profile.weights.fitness >= 0.25, 'Morning warrior should be fitness-heavy');
  });

  it('evening-wind-down has low cognitive load', async () => {
    const raw = await readFile(join(__dirname, '..', 'default-profiles', 'evening-wind-down.json'), 'utf-8');
    const profile = JSON.parse(raw);
    assert.ok(profile.filters.max_cognitive_load <= 0.4, 'Evening wind-down should cap cognitive load');
    assert.equal(profile.preferred_arc_template, 'wind-down');
  });
});
