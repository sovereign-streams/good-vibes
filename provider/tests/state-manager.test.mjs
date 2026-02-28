import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { StateManager } from '../src/query-engine/state-manager.mjs';

describe('StateManager', () => {
  let sm;

  beforeEach(() => {
    sm = new StateManager({ ttlMs: 5000 });
  });

  it('should create a session and return a token', () => {
    const token = sm.create({ servedItemIds: ['a', 'b'] });
    assert.ok(token, 'token should be truthy');
    assert.equal(typeof token, 'string');
  });

  it('should retrieve session state by token', () => {
    const token = sm.create({ servedItemIds: ['a'] });
    const state = sm.get(token);
    assert.ok(state);
    assert.ok(state.servedItemIds.has('a'));
    assert.equal(state.roundNumber, 1);
  });

  it('should return null for unknown token', () => {
    const state = sm.get('nonexistent-token');
    assert.equal(state, null);
  });

  it('should return null for null token', () => {
    const state = sm.get(null);
    assert.equal(state, null);
  });

  it('should advance a session and merge served IDs', () => {
    const token = sm.create({ servedItemIds: ['a'] });
    const nextToken = sm.advance(token, { servedItemIds: ['b', 'c'] });

    assert.equal(nextToken, token, 'token should remain same on advance');
    const state = sm.get(nextToken);
    assert.ok(state.servedItemIds.has('a'));
    assert.ok(state.servedItemIds.has('b'));
    assert.ok(state.servedItemIds.has('c'));
    assert.equal(state.roundNumber, 2);
  });

  it('should create new session when advancing with null token', () => {
    const token = sm.advance(null, { servedItemIds: ['x', 'y'] });
    assert.ok(token);
    const state = sm.get(token);
    assert.ok(state.servedItemIds.has('x'));
    assert.ok(state.servedItemIds.has('y'));
    assert.equal(state.roundNumber, 1);
  });

  it('should return served IDs via getServedIds', () => {
    const token = sm.create({ servedItemIds: ['a', 'b'] });
    const ids = sm.getServedIds(token);
    assert.ok(ids instanceof Set);
    assert.equal(ids.size, 2);
    assert.ok(ids.has('a'));
    assert.ok(ids.has('b'));
  });

  it('should return empty set for unknown token via getServedIds', () => {
    const ids = sm.getServedIds('nope');
    assert.ok(ids instanceof Set);
    assert.equal(ids.size, 0);
  });

  it('should track arc history across rounds', () => {
    const token = sm.create();
    sm.advance(token, { arcPositions: ['opener', 'builder'] });
    sm.advance(token, { arcPositions: ['peak', 'closer'] });
    const state = sm.get(token);
    assert.deepEqual(state.arcHistory, ['opener', 'builder', 'peak', 'closer']);
  });

  it('should expire sessions after TTL', async () => {
    const shortSm = new StateManager({ ttlMs: 50 });
    const token = shortSm.create({ servedItemIds: ['a'] });
    assert.ok(shortSm.get(token));

    await new Promise(resolve => setTimeout(resolve, 80));

    assert.equal(shortSm.get(token), null);
  });

  it('should report size correctly', () => {
    assert.equal(sm.size, 0);
    sm.create();
    sm.create();
    assert.equal(sm.size, 2);
  });
});
