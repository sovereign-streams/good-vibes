import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enriched-items.json'), 'utf-8'));

// -- Storage tests --

import { Storage } from '../src/lib/storage.mjs';

describe('Storage', () => {
  let storage;
  let dbPath;

  beforeEach(() => {
    dbPath = join(__dirname, `test-storage-${randomUUID()}.db`);
    storage = new Storage(dbPath);
    storage.initialize();
  });

  afterEach(() => {
    storage.close();
    try { rmSync(dbPath); } catch {}
    try { rmSync(dbPath + '-wal'); } catch {}
    try { rmSync(dbPath + '-shm'); } catch {}
  });

  it('should save and retrieve a profile', () => {
    const profile = { id: 'test-profile', name: 'Test', weights: { fitness: 0.5 } };
    storage.saveProfile(profile);
    const loaded = storage.getProfile('test-profile');
    assert.equal(loaded.id, 'test-profile');
    assert.equal(loaded.weights.fitness, 0.5);
  });

  it('should track active profile', () => {
    storage.saveProfile({ id: 'p1', name: 'P1' });
    storage.saveProfile({ id: 'p2', name: 'P2' });
    storage.setActiveProfile('p1');
    assert.equal(storage.getActiveProfile().id, 'p1');
    storage.setActiveProfile('p2');
    assert.equal(storage.getActiveProfile().id, 'p2');
  });

  it('should list profiles', () => {
    storage.saveProfile({ id: 'a', name: 'Alpha' });
    storage.saveProfile({ id: 'b', name: 'Beta' });
    const list = storage.listProfiles();
    assert.equal(list.length, 2);
    assert.ok(list.some(p => p.id === 'a'));
    assert.ok(list.some(p => p.id === 'b'));
  });

  it('should record and retrieve history', () => {
    const entries = [
      { session_id: 's1', item_id: 'i1', provider_id: 'p1', position: 0, duration_seconds: 300 },
      { session_id: 's1', item_id: 'i2', provider_id: 'p1', position: 1, duration_seconds: 400 },
    ];
    storage.recordServed(entries);
    const history = storage.getSessionHistory('s1');
    assert.equal(history.length, 2);
    assert.equal(history[0].item_id, 'i1');
  });

  it('should update engagement', () => {
    storage.recordServed([{ session_id: 's1', item_id: 'i1', served_at: new Date().toISOString() }]);
    storage.updateEngagement('s1', 'i1', { viewed: true, completion_rate: 0.85 });
    const history = storage.getItemHistory('i1');
    assert.equal(history[0].viewed, 1);
    assert.equal(history[0].completion_rate, 0.85);
  });

  it('should get recent item IDs', () => {
    storage.recordServed([
      { session_id: 's1', item_id: 'recent1', served_at: new Date().toISOString() },
      { session_id: 's1', item_id: 'recent2', served_at: new Date().toISOString() },
    ]);
    const recent = storage.getRecentItemIds(24);
    assert.ok(recent.includes('recent1'));
    assert.ok(recent.includes('recent2'));
  });

  it('should save and retrieve sessions', () => {
    storage.saveSession({
      session_id: 'sess-1',
      profile_id: 'p1',
      template_id: 'standard',
      started_at: new Date().toISOString(),
      item_count: 5,
    });
    const session = storage.getSession('sess-1');
    assert.equal(session.session_id, 'sess-1');
    assert.equal(session.item_count, 5);
  });

  it('should save and retrieve learning snapshots', () => {
    const proposal = { status: 'ready', suggestions: [{ category: 'fitness', delta: 0.05 }] };
    storage.saveLearningSnapshot({ profile_id: 'p1', sessions_analyzed: 5, proposal, accepted: false });
    const snapshots = storage.getLearningSnapshots('p1');
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].proposal.status, 'ready');
    assert.equal(snapshots[0].accepted, false);
  });

  it('should save and list providers', () => {
    storage.saveProvider({ provider_id: 'prov1', endpoint: 'http://localhost:3700', enabled: true });
    const providers = storage.listProviders();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].endpoint, 'http://localhost:3700');
  });
});

// -- Preferences tests --

import {
  normalizeProfile, mergeOverrides, buildIntent,
  applyTimeOfDayEnergy, DEFAULT_WEIGHTS,
} from '../src/profile/preferences.mjs';

describe('Preferences', () => {
  it('should normalize a profile with defaults', () => {
    const profile = normalizeProfile({ id: 'test' });
    assert.equal(profile.id, 'test');
    assert.equal(typeof profile.weights.fitness, 'number');
    assert.equal(profile.filters.exclude_rage_bait, true);
    assert.equal(profile.preferred_arc_template, 'standard');
  });

  it('should merge user weights with defaults', () => {
    const profile = normalizeProfile({
      id: 'custom',
      weights: { fitness: 0.8, humor: 0.9 },
    });
    assert.equal(profile.weights.fitness, 0.8);
    assert.equal(profile.weights.humor, 0.9);
    // Unspecified categories get defaults
    assert.equal(profile.weights.craft, DEFAULT_WEIGHTS.craft);
  });

  it('should clamp weights to [0, 1]', () => {
    const profile = normalizeProfile({
      id: 'extreme',
      weights: { fitness: 1.5, humor: -0.3 },
    });
    assert.equal(profile.weights.fitness, 1.0);
    assert.equal(profile.weights.humor, 0.0);
  });

  it('should merge overrides into a base profile', () => {
    const base = normalizeProfile({ id: 'base', weights: { fitness: 0.5 } });
    const merged = mergeOverrides(base, {
      weights: { fitness: 0.9 },
      target_duration_minutes: 30,
    });
    assert.equal(merged.weights.fitness, 0.9);
    assert.equal(merged.target_duration_minutes, 30);
    // Other weights preserved
    assert.equal(merged.weights.humor, base.weights.humor);
  });

  it('should build a consumer intent from a profile', () => {
    const profile = normalizeProfile({ id: 'test' });
    const intent = buildIntent(profile, { time_of_day: 'morning' });
    assert.equal(intent.sep_version, '0.1.0');
    assert.equal(intent.intent.session_type, 'composed');
    assert.equal(intent.intent.context.time_of_day, 'morning');
    assert.ok(intent.intent.weights.fitness > 0);
    assert.equal(intent.intent.filters.exclude_rage_bait, true);
  });

  it('should apply time-of-day energy adjustments', () => {
    const base = normalizeProfile({ id: 'test' });
    const morning = applyTimeOfDayEnergy(base, 'morning');
    const evening = applyTimeOfDayEnergy(base, 'evening');
    assert.ok(morning.energy_preferences.ideal > evening.energy_preferences.ideal);
  });

  it('should exclude rage bait content via filters', () => {
    const profile = normalizeProfile({ id: 'test' });
    const rageBaitItem = FIXTURES.find(i => i.enrichment.emotional_tone.rage_bait);
    assert.ok(rageBaitItem, 'Fixture should have a rage bait item');
    // The profile's filters should exclude rage bait
    assert.equal(profile.filters.exclude_rage_bait, true);
  });
});

// -- History tests --

import { History } from '../src/profile/history.mjs';

describe('History', () => {
  let storage, history;
  let dbPath;

  beforeEach(() => {
    dbPath = join(__dirname, `test-history-${randomUUID()}.db`);
    storage = new Storage(dbPath);
    storage.initialize();
    history = new History(storage);
  });

  afterEach(() => {
    storage.close();
    try { rmSync(dbPath); } catch {}
    try { rmSync(dbPath + '-wal'); } catch {}
    try { rmSync(dbPath + '-shm'); } catch {}
  });

  it('should record served items', () => {
    history.recordServed('session-1', [
      { item_id: 'item-1', provider_id: 'p1', position: 0, duration_seconds: 300 },
      { item_id: 'item-2', provider_id: 'p1', position: 1, duration_seconds: 400 },
    ]);
    const details = history.getSessionDetails('session-1');
    assert.ok(details === null); // No session record yet, only history

    // But served count works
    assert.equal(history.getServedCount('item-1'), 1);
    assert.equal(history.getServedCount('item-2'), 1);
    assert.equal(history.getServedCount('item-3'), 0);
  });

  it('should track engagement signals', () => {
    history.recordServed('s1', [{ item_id: 'i1' }]);
    history.recordEngagement('s1', 'i1', { viewed: true, completion_rate: 0.75 });
    assert.equal(history.getAverageCompletion('i1'), 0.75);
  });

  it('should track recency', () => {
    history.recordServed('s1', [{ item_id: 'recent-1' }, { item_id: 'recent-2' }]);
    const recent = history.getRecentItemIds(24);
    assert.ok(recent.includes('recent-1'));
    assert.ok(recent.includes('recent-2'));
  });

  it('should save and complete sessions', () => {
    history.saveSession({
      session_id: 'sess-1',
      profile_id: 'p1',
      template_id: 'standard',
      started_at: new Date().toISOString(),
      item_count: 5,
    });
    history.completeSession('sess-1', { completed: true, satisfaction: 0.8 });
    const session = history.getSessionDetails('sess-1');
    assert.ok(session.completed);
    assert.equal(session.satisfaction, 0.8);
    assert.ok(session.ended_at);
  });

  it('should get engagement summaries', () => {
    history.saveSession({
      session_id: 'sess-1',
      profile_id: 'p1',
      started_at: new Date().toISOString(),
      item_count: 2,
    });
    history.recordServed('sess-1', [
      { item_id: 'i1', duration_seconds: 300 },
      { item_id: 'i2', duration_seconds: 400 },
    ]);
    history.recordEngagement('sess-1', 'i1', { viewed: true, completion_rate: 1.0 });
    history.recordEngagement('sess-1', 'i2', { viewed: true, completion_rate: 0.5, skipped: true });

    const summaries = history.getEngagementSummaries(10);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].total_items, 2);
    assert.equal(summaries[0].viewed_count, 2);
  });
});

// -- Session Builder tests (using fixtures) --

import { buildSession, mergePayloads } from '../src/composer/session-builder.mjs';

describe('Session Builder', () => {
  const profile = normalizeProfile({ id: 'test-profile' });

  it('should build a session from enriched items', () => {
    const cleanItems = FIXTURES.filter(i => !i.enrichment.emotional_tone.rage_bait);
    const session = buildSession({ items: cleanItems, profile });
    assert.ok(session.session_id);
    assert.ok(session.item_count > 0);
    assert.ok(session.phases.length > 0);
    assert.equal(typeof session.flow_score, 'number');
  });

  it('should return empty session when no items pass filters', () => {
    const rageBaitOnly = FIXTURES.filter(i => i.enrichment.emotional_tone.rage_bait);
    const session = buildSession({ items: rageBaitOnly, profile });
    assert.equal(session.item_count, 0);
    assert.equal(session.partial_fill, true);
  });

  it('should merge payloads and deduplicate', () => {
    const payload1 = [FIXTURES[0], FIXTURES[1]];
    const payload2 = [FIXTURES[1], FIXTURES[2]]; // item 1 is duplicate
    const merged = mergePayloads([payload1, payload2]);
    assert.equal(merged.length, 3);
    // No duplicates
    const ids = merged.map(i => i.item_id);
    assert.equal(new Set(ids).size, 3);
  });

  it('should filter out rage bait via profile filters', () => {
    const session = buildSession({ items: FIXTURES, profile });
    const sessionItemIds = session.items.map(i => i.item_id);
    const rageBaitId = FIXTURES.find(i => i.enrichment.emotional_tone.rage_bait).item_id;
    assert.ok(!sessionItemIds.includes(rageBaitId), 'Rage bait should be filtered out');
  });
});

// -- PAE integration tests --

import { PAE } from '../src/pae.mjs';

describe('PAE', () => {
  let pae;
  let dbPath;

  beforeEach(async () => {
    dbPath = join(__dirname, `test-pae-${randomUUID()}.db`);
    pae = new PAE({
      dbPath,
      profilesDir: join(__dirname, '..', 'default-profiles'),
    });
    await pae.initialize();
  });

  afterEach(() => {
    pae.close();
    try { rmSync(dbPath); } catch {}
    try { rmSync(dbPath + '-wal'); } catch {}
    try { rmSync(dbPath + '-shm'); } catch {}
  });

  it('should initialize with default profiles', () => {
    const profiles = pae.listProfiles();
    assert.ok(profiles.length >= 4, `Expected at least 4 profiles, got ${profiles.length}`);
    const ids = profiles.map(p => p.id);
    assert.ok(ids.includes('good-vibes-default'));
    assert.ok(ids.includes('morning-warrior'));
  });

  it('should set and get active profile', () => {
    pae.setActiveProfile('morning-warrior');
    const profile = pae.getProfile('morning-warrior');
    assert.equal(profile.id, 'morning-warrior');
    assert.ok(profile.weights.fitness > 0.2);
  });

  it('should create a session', () => {
    pae.setActiveProfile('good-vibes-default');
    const session = pae.createSession({ timeOfDay: 'morning' });
    assert.ok(session.session_id);
    assert.ok(session.profile);
    assert.ok(session.intent);
    assert.equal(session.intent.intent.context.time_of_day, 'morning');
  });

  it('should create a session with overrides', () => {
    pae.setActiveProfile('good-vibes-default');
    const session = pae.createSession({
      overrides: { weights: { fitness: 0.9 }, target_duration_minutes: 30 },
    });
    assert.equal(session.profile.weights.fitness, 0.9);
    assert.equal(session.profile.target_duration_minutes, 30);
  });

  it('should report engagement signals', () => {
    pae.setActiveProfile('good-vibes-default');
    const session = pae.createSession();
    const result = pae.reportEngagement(session, {
      items: [
        { item_id: 'test-1', viewed: true, completion_rate: 1.0 },
        { item_id: 'test-2', viewed: true, completion_rate: 0.5, skipped: true },
      ],
      session_completed: true,
      satisfaction: 0.8,
    });
    assert.equal(result.recorded, true);
    assert.equal(result.items_updated, 2);
  });

  it('should save and retrieve custom profiles', () => {
    pae.saveProfile({ id: 'custom-test', name: 'Custom Test', weights: { fitness: 1.0 } });
    const loaded = pae.getProfile('custom-test');
    assert.equal(loaded.id, 'custom-test');
    assert.equal(loaded.weights.fitness, 1.0);
  });

  it('should throw if not initialized', () => {
    const uninit = new PAE({ dbPath: '/tmp/unused.db' });
    assert.throws(() => uninit.createSession(), /not initialized/i);
  });

  it('should handle requestContent with no providers', async () => {
    pae.setActiveProfile('good-vibes-default');
    const session = pae.createSession();
    const result = await pae.requestContent(session);
    assert.equal(result.status, 'no_providers');
    assert.deepEqual(result.items, []);
  });
});

// -- Learning tests --

import { Learning } from '../src/profile/learning.mjs';

describe('Learning', () => {
  let storage, history, learning;
  let dbPath;

  beforeEach(() => {
    dbPath = join(__dirname, `test-learning-${randomUUID()}.db`);
    storage = new Storage(dbPath);
    storage.initialize();
    history = new History(storage);
    learning = new Learning(storage, history);
  });

  afterEach(() => {
    storage.close();
    try { rmSync(dbPath); } catch {}
    try { rmSync(dbPath + '-wal'); } catch {}
    try { rmSync(dbPath + '-shm'); } catch {}
  });

  it('should return insufficient data with too few sessions', () => {
    const profile = normalizeProfile({ id: 'test' });
    const enrichmentMap = new Map();
    const proposal = learning.generateAdjustmentProposal(profile, enrichmentMap, { minSessions: 3 });
    assert.equal(proposal.status, 'insufficient_data');
  });

  it('should apply proposal weights', () => {
    const profile = normalizeProfile({ id: 'test' });
    const proposal = {
      status: 'ready',
      proposed_weights: { fitness: 0.5, humor: 0.3 },
    };
    const updated = learning.applyProposal(profile, proposal);
    assert.equal(updated.weights.fitness, 0.5);
    assert.equal(updated.weights.humor, 0.3);
  });

  it('should not apply non-ready proposals', () => {
    const profile = normalizeProfile({ id: 'test' });
    const proposal = { status: 'no_changes' };
    const updated = learning.applyProposal(profile, proposal);
    assert.deepEqual(updated.weights, profile.weights);
  });

  it('should generate proposal from enough sessions', () => {
    const profile = normalizeProfile({ id: 'test' });
    const enrichmentMap = new Map();

    // Create fixtures and sessions
    for (const item of FIXTURES) {
      enrichmentMap.set(item.item_id, item);
    }

    // Record 5 sessions with engagement data
    const cleanItems = FIXTURES.filter(i => !i.enrichment.emotional_tone.rage_bait);
    for (let i = 0; i < 5; i++) {
      const sessionId = `learn-session-${i}`;
      history.saveSession({
        session_id: sessionId,
        profile_id: 'test',
        started_at: new Date(Date.now() - (5 - i) * 3600000).toISOString(),
        item_count: cleanItems.length,
        completed: true,
        satisfaction: 0.7 + i * 0.05,
      });
      history.recordServed(sessionId, cleanItems.map((item, idx) => ({
        item_id: item.item_id,
        position: idx,
        duration_seconds: item.source.duration_seconds,
      })));
      // Mark some as viewed/completed
      for (const item of cleanItems) {
        history.recordEngagement(sessionId, item.item_id, {
          viewed: true,
          completion_rate: item.enrichment.categories[0]?.id === 'fitness' ? 0.95 : 0.4,
        });
      }
    }

    const proposal = learning.generateAdjustmentProposal(profile, enrichmentMap, { minSessions: 3 });
    assert.ok(['ready', 'no_changes'].includes(proposal.status), `Expected ready or no_changes, got ${proposal.status}`);
    assert.equal(proposal.auto_applied, false);
  });
});
