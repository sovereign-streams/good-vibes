import { Pipeline } from './pipeline.mjs';
import { YouTubeSource } from './sources/youtube.mjs';
import { LLMTagger } from './enrichers/llm-tagger.mjs';
import { TranscriptFetcher } from './enrichers/transcript.mjs';
import { EthicalFilter } from './guardrails/ethical-filter.mjs';
import { IndexStore } from './store/index-store.mjs';
import { SQLiteAdapter } from './store/adapters/sqlite.mjs';
import { LLMClient } from './lib/llm-client.mjs';
import { Validator } from './lib/validator.mjs';
import { Config } from './lib/config.mjs';
import { SchedulerState } from './scheduler-state.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Default search queries aligned with Good Vibes taxonomy categories. */
const DAILY_QUERIES = [
  'men fitness motivation workout',
  'healthy nutrition meal prep',
  'skill building tutorial how to',
  'stand up comedy funny',
  'motivational speech mindset',
  'woodworking craft DIY',
  'stoicism philosophy marcus aurelius',
  'fatherhood dad tips',
  'entrepreneur business startup',
  'music performance live',
  'nature documentary relaxing',
  'relaxation meditation calm',
];

/**
 * Continuous enrichment scheduler.
 *
 * - **Daily:** Cycles through category queries, fetches trending/new YouTube
 *   videos, and runs them through the enrichment pipeline.
 * - **Weekly:** Re-enriches a random sample of existing records against the
 *   latest taxonomy version.
 * - **Queue:** Processes on-demand submissions and lazy re-enrichment items.
 */
export class Scheduler {
  /**
   * @param {object} opts
   * @param {string} [opts.dbPath]
   * @param {string} [opts.stateDbPath]
   * @param {number} [opts.dailyIntervalMs]
   * @param {number} [opts.weeklyIntervalMs]
   * @param {number} [opts.queuePollIntervalMs]
   * @param {number} [opts.dailyMaxResults]
   * @param {number} [opts.weeklySampleSize]
   * @param {string} [opts.currentSchemaVersion]
   */
  constructor({
    dbPath,
    stateDbPath,
    dailyIntervalMs = MS_PER_DAY,
    weeklyIntervalMs = MS_PER_WEEK,
    queuePollIntervalMs = 30_000,
    dailyMaxResults = 20,
    weeklySampleSize = 50,
    currentSchemaVersion = '0.1.0',
  } = {}) {
    this.dbPath = dbPath || Config.dbPath;
    this.stateDbPath = stateDbPath || this.dbPath.replace('.db', '-scheduler.db');
    this.dailyIntervalMs = dailyIntervalMs;
    this.weeklyIntervalMs = weeklyIntervalMs;
    this.queuePollIntervalMs = queuePollIntervalMs;
    this.dailyMaxResults = dailyMaxResults;
    this.weeklySampleSize = weeklySampleSize;
    this.currentSchemaVersion = currentSchemaVersion;

    this._timers = [];
    this._running = false;
    this._pipeline = null;
    this._store = null;
    this._state = null;
    this._queryIndex = 0;
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async start() {
    if (this._running) return;
    this._running = true;

    console.log('[scheduler] Initializing...');

    // Initialize state tracker
    this._state = new SchedulerState(this.stateDbPath);
    await this._state.initialize();

    // Initialize enrichment pipeline
    await this._initPipeline();

    console.log('[scheduler] Starting jobs...');

    // Daily job
    this._scheduleDailyJob();

    // Weekly job
    this._scheduleWeeklyJob();

    // Queue processor
    this._scheduleQueueProcessor();

    console.log('[scheduler] Running. Daily=%dh, Weekly=%dd, Queue poll=%ds',
      this.dailyIntervalMs / MS_PER_HOUR,
      this.weeklyIntervalMs / MS_PER_DAY,
      this.queuePollIntervalMs / 1000
    );
  }

  async stop() {
    if (!this._running) return;
    this._running = false;

    console.log('[scheduler] Stopping...');
    for (const timer of this._timers) clearInterval(timer);
    this._timers = [];

    if (this._store) await this._store.close();
    if (this._state) this._state.close();

    console.log('[scheduler] Stopped.');
  }

  get state() { return this._state; }
  get store() { return this._store; }

  // ── Pipeline initialization ──────────────────────────────────

  async _initPipeline() {
    const adapter = new SQLiteAdapter(this.dbPath);
    this._store = new IndexStore(adapter);
    await this._store.initialize();

    const taxonomyPath = join(__dirname, 'taxonomy', 'categories.json');
    const taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf-8'));

    const llmClient = Config.anthropicApiKey
      ? new LLMClient({ apiKey: Config.anthropicApiKey })
      : null;

    const tagger = new LLMTagger({ llmClient, taxonomy });
    const transcriptFetcher = new TranscriptFetcher();
    const filter = new EthicalFilter();
    const specPath = join(__dirname, '..', '..', 'spec', '2026-02-28');
    const validator = new Validator(specPath);

    let source;
    try {
      source = new YouTubeSource(Config.youtubeApiKey);
    } catch {
      console.warn('[scheduler] No YouTube API key — daily fetch will be skipped');
      source = null;
    }

    this._pipeline = new Pipeline({
      source,
      tagger,
      transcriptFetcher,
      filter,
      store: this._store,
      validator,
    });
  }

  // ── Daily job ────────────────────────────────────────────────

  _scheduleDailyJob() {
    // Run immediately, then at interval
    this._runDailyJob();
    const timer = setInterval(() => this._runDailyJob(), this.dailyIntervalMs);
    this._timers.push(timer);
  }

  async _runDailyJob() {
    if (!this._pipeline.source) {
      console.log('[scheduler:daily] Skipped — no YouTube source configured');
      return;
    }

    const jobId = 'daily-enrich';
    const start = Date.now();

    try {
      this._state.recordJobStart(jobId);

      // Rotate through queries
      const query = DAILY_QUERIES[this._queryIndex % DAILY_QUERIES.length];
      this._queryIndex++;

      console.log(`[scheduler:daily] Fetching "${query}" (max ${this.dailyMaxResults})...`);

      const result = await this._pipeline.run({
        query,
        maxResults: this.dailyMaxResults,
        batchSize: 5,
      });

      const durationMs = Date.now() - start;
      const nextRun = new Date(Date.now() + this.dailyIntervalMs).toISOString();
      this._state.recordJobComplete(jobId, durationMs, nextRun);

      console.log(`[scheduler:daily] Done in ${durationMs}ms. Stats: ${JSON.stringify(result.stats)}`);
    } catch (err) {
      const durationMs = Date.now() - start;
      this._state.recordJobFailed(jobId, durationMs, err.message);
      console.error(`[scheduler:daily] Failed: ${err.message}`);
    }
  }

  // ── Weekly re-enrichment job ─────────────────────────────────

  _scheduleWeeklyJob() {
    const timer = setInterval(() => this._runWeeklyJob(), this.weeklyIntervalMs);
    this._timers.push(timer);

    // Check if we should run immediately based on last run
    const job = this._state.getJob('weekly-re-enrich');
    if (!job || !job.last_run) {
      // Never ran — run after a small delay to let daily job go first
      setTimeout(() => this._runWeeklyJob(), 5000);
    }
  }

  async _runWeeklyJob() {
    const jobId = 'weekly-re-enrich';
    const start = Date.now();

    try {
      this._state.recordJobStart(jobId);

      // Get all items, then randomly sample
      const allItems = await this._store.getAll({ limit: 10000 });
      if (allItems.length === 0) {
        console.log('[scheduler:weekly] No items to re-enrich');
        this._state.recordJobComplete(jobId, Date.now() - start);
        return;
      }

      const sample = this._randomSample(allItems, this.weeklySampleSize);
      console.log(`[scheduler:weekly] Re-enriching ${sample.length} of ${allItems.length} items...`);

      const tagger = this._pipeline.tagger;
      const filter = this._pipeline.filter;
      let succeeded = 0;
      let failed = 0;

      for (const item of sample) {
        try {
          const rawMeta = {
            title: item.meta.title,
            description: '',
            creator: item.meta.creator,
            tags: item.meta.original_tags || [],
            duration_seconds: item.source.duration_seconds,
          };

          const enrichment = await tagger.tag(rawMeta);
          const guardrailResult = filter.check(enrichment, rawMeta);

          await this._store.update(item.item_id, {
            enrichment,
            guardrail_pass: guardrailResult.pass,
            guardrail_version: guardrailResult.version,
          });

          succeeded++;
        } catch (err) {
          failed++;
          console.error(`[scheduler:weekly] Failed item ${item.item_id}: ${err.message}`);
        }
      }

      const durationMs = Date.now() - start;
      const nextRun = new Date(Date.now() + this.weeklyIntervalMs).toISOString();
      this._state.recordJobComplete(jobId, durationMs, nextRun);

      console.log(`[scheduler:weekly] Done in ${durationMs}ms. succeeded=${succeeded} failed=${failed}`);
    } catch (err) {
      this._state.recordJobFailed(jobId, Date.now() - start, err.message);
      console.error(`[scheduler:weekly] Failed: ${err.message}`);
    }
  }

  // ── Queue processor ──────────────────────────────────────────

  _scheduleQueueProcessor() {
    const timer = setInterval(() => this._processQueue(), this.queuePollIntervalMs);
    this._timers.push(timer);
  }

  async _processQueue() {
    if (!this._running) return;

    const item = this._state.dequeue();
    if (!item) return;

    console.log(`[scheduler:queue] Processing queue item ${item.queue_id}: ${item.item_url}`);

    try {
      // Check if already in the index
      if (item.item_origin_id) {
        const existing = await this._store.getByOriginId('youtube', item.item_origin_id);
        if (existing) {
          // If the source is 'lazy-re-enrich', re-enrich it
          if (item.source === 'lazy-re-enrich') {
            await this._reEnrichSingleItem(existing);
          }
          this._state.completeQueueItem(item.queue_id);
          return;
        }
      }

      // Fetch and enrich
      if (this._pipeline.source && item.item_origin_id) {
        const details = await this._pipeline.source.getVideoDetails([item.item_origin_id]);
        if (details.length > 0) {
          const envelopes = await this._pipeline.enrichBatch(details, { batchSize: 1 });
          if (envelopes.length > 0) {
            this._state.completeQueueItem(item.queue_id);
            console.log(`[scheduler:queue] Enriched item ${item.queue_id}`);
            return;
          }
        }
      }

      this._state.completeQueueItem(item.queue_id);
    } catch (err) {
      this._state.failQueueItem(item.queue_id, err.message);
      console.error(`[scheduler:queue] Failed item ${item.queue_id}: ${err.message}`);
    }
  }

  // ── Lazy re-enrichment ───────────────────────────────────────

  /**
   * Queue an item for lazy re-enrichment if its schema version is outdated.
   * Call this when a record is accessed.
   * @param {object} item - A SEP envelope from the store.
   * @returns {boolean} Whether the item was queued.
   */
  queueLazyReEnrich(item) {
    if (!item?.enrichment?.schema_version) return false;

    const itemVersion = item.enrichment.schema_version;
    if (this._compareVersions(itemVersion, this.currentSchemaVersion) >= 0) {
      return false;
    }

    const originId = item.source?.origin_id;
    const url = item.source?.origin_url || '';

    this._state.enqueue(url, {
      originId,
      source: 'lazy-re-enrich',
      priority: 1,
    });

    return true;
  }

  // ── Helpers ──────────────────────────────────────────────────

  async _reEnrichSingleItem(item) {
    const rawMeta = {
      title: item.meta.title,
      description: '',
      creator: item.meta.creator,
      tags: item.meta.original_tags || [],
      duration_seconds: item.source.duration_seconds,
    };

    const enrichment = await this._pipeline.tagger.tag(rawMeta);
    const guardrailResult = this._pipeline.filter.check(enrichment, rawMeta);

    await this._store.update(item.item_id, {
      enrichment,
      guardrail_pass: guardrailResult.pass,
      guardrail_version: guardrailResult.version,
    });
  }

  _randomSample(array, size) {
    if (array.length <= size) return [...array];
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, size);
  }

  _compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
}

// ── CLI entry point ──────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const scheduler = new Scheduler();

  process.on('SIGINT', async () => {
    await scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await scheduler.stop();
    process.exit(0);
  });

  scheduler.start().catch(err => {
    console.error('[scheduler] Fatal:', err);
    process.exit(1);
  });
}
