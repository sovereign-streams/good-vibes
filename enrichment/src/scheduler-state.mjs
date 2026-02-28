import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Tracks scheduler job state in SQLite — last run times, job status, and
 * the re-enrichment queue for lazy/on-demand items.
 */
export class SchedulerState {
  /**
   * @param {string} dbPath - Path to the scheduler state database.
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async initialize() {
    mkdirSync(dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        last_run TEXT,
        last_status TEXT,
        last_duration_ms INTEGER,
        run_count INTEGER DEFAULT 0,
        next_run TEXT,
        config TEXT
      );

      CREATE TABLE IF NOT EXISTS queue (
        queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_url TEXT NOT NULL,
        item_origin_id TEXT,
        source TEXT DEFAULT 'submission',
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        submitter_ip TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_queue_status
        ON queue (status);

      CREATE INDEX IF NOT EXISTS idx_queue_origin_id
        ON queue (item_origin_id);

      CREATE TABLE IF NOT EXISTS rate_limits (
        ip TEXT NOT NULL,
        window_start TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        PRIMARY KEY (ip, window_start)
      );
    `);
  }

  // ── Job tracking ─────────────────────────────────────────────

  getJob(jobId) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
    if (row && row.config) {
      try { row.config = JSON.parse(row.config); } catch { row.config = {}; }
    }
    return row || null;
  }

  recordJobStart(jobId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO jobs (job_id, last_run, last_status, run_count)
      VALUES (@jobId, @now, 'running', 1)
      ON CONFLICT(job_id) DO UPDATE SET
        last_run = @now,
        last_status = 'running',
        run_count = run_count + 1
    `).run({ jobId, now });
  }

  recordJobComplete(jobId, durationMs, nextRun = null) {
    this.db.prepare(`
      UPDATE jobs SET last_status = 'completed', last_duration_ms = @durationMs,
        next_run = @nextRun
      WHERE job_id = @jobId
    `).run({ jobId, durationMs, nextRun });
  }

  recordJobFailed(jobId, durationMs, error) {
    this.db.prepare(`
      UPDATE jobs SET last_status = 'failed', last_duration_ms = @durationMs
      WHERE job_id = @jobId
    `).run({ jobId, durationMs });
  }

  // ── Queue management ─────────────────────────────────────────

  /**
   * Add a URL to the enrichment queue.
   * @returns {{ queue_id: number, duplicate: boolean }}
   */
  enqueue(url, { originId = null, source = 'submission', priority = 0, submitterIp = null } = {}) {
    // Check for duplicate pending/in-progress items
    if (originId) {
      const existing = this.db.prepare(
        "SELECT queue_id FROM queue WHERE item_origin_id = ? AND status IN ('pending', 'processing')"
      ).get(originId);
      if (existing) {
        return { queue_id: existing.queue_id, duplicate: true };
      }
    }

    const result = this.db.prepare(`
      INSERT INTO queue (item_url, item_origin_id, source, priority, created_at, submitter_ip)
      VALUES (@url, @originId, @source, @priority, @createdAt, @submitterIp)
    `).run({
      url,
      originId,
      source,
      priority,
      createdAt: new Date().toISOString(),
      submitterIp,
    });

    return { queue_id: Number(result.lastInsertRowid), duplicate: false };
  }

  /**
   * Dequeue the next pending item (FIFO within priority).
   * @returns {object|null}
   */
  dequeue() {
    const row = this.db.prepare(
      "SELECT * FROM queue WHERE status = 'pending' ORDER BY priority DESC, queue_id ASC LIMIT 1"
    ).get();

    if (!row) return null;

    this.db.prepare(
      "UPDATE queue SET status = 'processing', started_at = ? WHERE queue_id = ?"
    ).run(new Date().toISOString(), row.queue_id);

    return row;
  }

  completeQueueItem(queueId) {
    this.db.prepare(
      "UPDATE queue SET status = 'completed', completed_at = ? WHERE queue_id = ?"
    ).run(new Date().toISOString(), queueId);
  }

  failQueueItem(queueId, error) {
    this.db.prepare(
      "UPDATE queue SET status = 'failed', completed_at = ?, error = ? WHERE queue_id = ?"
    ).run(new Date().toISOString(), error, queueId);
  }

  getQueueItem(queueId) {
    return this.db.prepare('SELECT * FROM queue WHERE queue_id = ?').get(queueId) || null;
  }

  getPendingCount() {
    return this.db.prepare("SELECT COUNT(*) as count FROM queue WHERE status = 'pending'").get().count;
  }

  // ── Rate limiting ────────────────────────────────────────────

  /**
   * Check and increment rate limit for an IP.
   * @param {string} ip
   * @param {number} maxPerHour
   * @returns {{ allowed: boolean, remaining: number }}
   */
  checkRateLimit(ip, maxPerHour = 10) {
    const windowStart = this._currentHourWindow();

    // Clean old windows
    this.db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(windowStart);

    const row = this.db.prepare(
      'SELECT count FROM rate_limits WHERE ip = ? AND window_start = ?'
    ).get(ip, windowStart);

    const currentCount = row ? row.count : 0;

    if (currentCount >= maxPerHour) {
      return { allowed: false, remaining: 0 };
    }

    this.db.prepare(`
      INSERT INTO rate_limits (ip, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT(ip, window_start) DO UPDATE SET count = count + 1
    `).run(ip, windowStart);

    return { allowed: true, remaining: maxPerHour - currentCount - 1 };
  }

  _currentHourWindow() {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }

  // ── Lifecycle ────────────────────────────────────────────────

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
