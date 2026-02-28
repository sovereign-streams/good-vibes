import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SchedulerState } from '../src/scheduler-state.mjs';
import { Scheduler } from '../src/scheduler.mjs';
import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';
import { unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_STATE_DB = join(__dirname, 'test-scheduler-state.db');
const TEST_STORE_DB = join(__dirname, 'test-scheduler-store.db');

// ── SchedulerState tests ───────────────────────────────────────

describe('SchedulerState', () => {
  let state;

  beforeEach(async () => {
    state = new SchedulerState(TEST_STATE_DB);
    await state.initialize();
  });

  afterEach(() => {
    state.close();
    if (existsSync(TEST_STATE_DB)) unlinkSync(TEST_STATE_DB);
  });

  // ── Job tracking ─────────────────────────────────────────────

  describe('job tracking', () => {
    it('should record job start and retrieve it', () => {
      state.recordJobStart('test-job');
      const job = state.getJob('test-job');
      assert.ok(job);
      assert.equal(job.job_id, 'test-job');
      assert.equal(job.last_status, 'running');
      assert.equal(job.run_count, 1);
    });

    it('should record job completion', () => {
      state.recordJobStart('test-job');
      state.recordJobComplete('test-job', 1500, '2026-03-01T00:00:00Z');
      const job = state.getJob('test-job');
      assert.equal(job.last_status, 'completed');
      assert.equal(job.last_duration_ms, 1500);
      assert.equal(job.next_run, '2026-03-01T00:00:00Z');
    });

    it('should record job failure', () => {
      state.recordJobStart('test-job');
      state.recordJobFailed('test-job', 500, 'Something went wrong');
      const job = state.getJob('test-job');
      assert.equal(job.last_status, 'failed');
      assert.equal(job.last_duration_ms, 500);
    });

    it('should increment run count on subsequent starts', () => {
      state.recordJobStart('test-job');
      state.recordJobComplete('test-job', 100);
      state.recordJobStart('test-job');
      const job = state.getJob('test-job');
      assert.equal(job.run_count, 2);
    });

    it('should return null for non-existent job', () => {
      const job = state.getJob('no-such-job');
      assert.equal(job, null);
    });
  });

  // ── Queue management ─────────────────────────────────────────

  describe('queue', () => {
    it('should enqueue and dequeue items', () => {
      const { queue_id, duplicate } = state.enqueue('https://youtube.com/watch?v=abc123', {
        originId: 'abc123',
      });
      assert.ok(queue_id > 0);
      assert.equal(duplicate, false);

      const item = state.dequeue();
      assert.ok(item);
      assert.equal(item.item_url, 'https://youtube.com/watch?v=abc123');
      assert.equal(item.item_origin_id, 'abc123');
    });

    it('should detect duplicate pending items by origin ID', () => {
      state.enqueue('https://youtube.com/watch?v=abc123', { originId: 'abc123' });
      const result = state.enqueue('https://youtube.com/watch?v=abc123', { originId: 'abc123' });
      assert.equal(result.duplicate, true);
    });

    it('should dequeue in FIFO order', () => {
      state.enqueue('https://youtube.com/watch?v=first', { originId: 'first' });
      state.enqueue('https://youtube.com/watch?v=second', { originId: 'second' });

      const first = state.dequeue();
      assert.equal(first.item_origin_id, 'first');

      const second = state.dequeue();
      assert.equal(second.item_origin_id, 'second');
    });

    it('should dequeue higher priority items first', () => {
      state.enqueue('https://youtube.com/watch?v=low', { originId: 'low', priority: 0 });
      state.enqueue('https://youtube.com/watch?v=high', { originId: 'high', priority: 10 });

      const first = state.dequeue();
      assert.equal(first.item_origin_id, 'high');
    });

    it('should mark items as completed', () => {
      const { queue_id } = state.enqueue('https://youtube.com/watch?v=test');
      state.dequeue();
      state.completeQueueItem(queue_id);

      const item = state.getQueueItem(queue_id);
      assert.equal(item.status, 'completed');
      assert.ok(item.completed_at);
    });

    it('should mark items as failed with error', () => {
      const { queue_id } = state.enqueue('https://youtube.com/watch?v=test');
      state.dequeue();
      state.failQueueItem(queue_id, 'Network error');

      const item = state.getQueueItem(queue_id);
      assert.equal(item.status, 'failed');
      assert.equal(item.error, 'Network error');
    });

    it('should return null when queue is empty', () => {
      const item = state.dequeue();
      assert.equal(item, null);
    });

    it('should count pending items', () => {
      state.enqueue('https://youtube.com/watch?v=a', { originId: 'a' });
      state.enqueue('https://youtube.com/watch?v=b', { originId: 'b' });
      assert.equal(state.getPendingCount(), 2);

      state.dequeue();
      assert.equal(state.getPendingCount(), 1);
    });
  });

  // ── Rate limiting ────────────────────────────────────────────

  describe('rate limiting', () => {
    it('should allow requests within limit', () => {
      const result = state.checkRateLimit('127.0.0.1', 3);
      assert.equal(result.allowed, true);
      assert.equal(result.remaining, 2);
    });

    it('should block requests exceeding limit', () => {
      for (let i = 0; i < 3; i++) {
        state.checkRateLimit('127.0.0.1', 3);
      }
      const result = state.checkRateLimit('127.0.0.1', 3);
      assert.equal(result.allowed, false);
      assert.equal(result.remaining, 0);
    });

    it('should track limits per IP', () => {
      for (let i = 0; i < 3; i++) {
        state.checkRateLimit('1.2.3.4', 3);
      }
      // Different IP should still be allowed
      const result = state.checkRateLimit('5.6.7.8', 3);
      assert.equal(result.allowed, true);
    });

    it('should decrement remaining correctly', () => {
      const r1 = state.checkRateLimit('127.0.0.1', 5);
      assert.equal(r1.remaining, 4);

      const r2 = state.checkRateLimit('127.0.0.1', 5);
      assert.equal(r2.remaining, 3);
    });
  });
});

// ── Scheduler tests ────────────────────────────────────────────

describe('Scheduler', () => {
  let scheduler;

  afterEach(async () => {
    if (scheduler) await scheduler.stop();
    if (existsSync(TEST_STORE_DB)) unlinkSync(TEST_STORE_DB);
    const stateDb = TEST_STORE_DB.replace('.db', '-scheduler.db');
    if (existsSync(stateDb)) unlinkSync(stateDb);
  });

  it('should construct with default options', () => {
    scheduler = new Scheduler({
      dbPath: TEST_STORE_DB,
    });
    assert.ok(scheduler);
    assert.equal(scheduler.currentSchemaVersion, '0.1.0');
  });

  it('should queue lazy re-enrichment for outdated items', async () => {
    scheduler = new Scheduler({
      dbPath: TEST_STORE_DB,
      currentSchemaVersion: '0.2.0',
    });

    // Manually initialize state to test queueLazyReEnrich
    scheduler._state = new SchedulerState(TEST_STORE_DB.replace('.db', '-scheduler.db'));
    await scheduler._state.initialize();

    const item = {
      item_id: 'test-123',
      source: { origin_id: 'vid123', origin_url: 'https://youtube.com/watch?v=vid123' },
      enrichment: { schema_version: '0.1.0' },
    };

    const queued = scheduler.queueLazyReEnrich(item);
    assert.equal(queued, true);
    assert.equal(scheduler._state.getPendingCount(), 1);
  });

  it('should not queue lazy re-enrichment for current items', async () => {
    scheduler = new Scheduler({
      dbPath: TEST_STORE_DB,
      currentSchemaVersion: '0.1.0',
    });

    scheduler._state = new SchedulerState(TEST_STORE_DB.replace('.db', '-scheduler.db'));
    await scheduler._state.initialize();

    const item = {
      item_id: 'test-123',
      source: { origin_id: 'vid123', origin_url: 'https://youtube.com/watch?v=vid123' },
      enrichment: { schema_version: '0.1.0' },
    };

    const queued = scheduler.queueLazyReEnrich(item);
    assert.equal(queued, false);
    assert.equal(scheduler._state.getPendingCount(), 0);
  });

  it('should correctly compare versions', () => {
    scheduler = new Scheduler({ dbPath: TEST_STORE_DB });
    assert.equal(scheduler._compareVersions('0.1.0', '0.1.0'), 0);
    assert.equal(scheduler._compareVersions('0.1.0', '0.2.0'), -1);
    assert.equal(scheduler._compareVersions('1.0.0', '0.9.9'), 1);
  });

  it('should randomly sample correctly', () => {
    scheduler = new Scheduler({ dbPath: TEST_STORE_DB });
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const sample = scheduler._randomSample(items, 3);
    assert.equal(sample.length, 3);
    // All items should be from the original array
    for (const s of sample) {
      assert.ok(items.includes(s));
    }

    // If sample size >= array, return all
    const fullSample = scheduler._randomSample(items, 20);
    assert.equal(fullSample.length, 10);
  });
});
