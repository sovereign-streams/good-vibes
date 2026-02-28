import crypto from 'node:crypto';

export class Pipeline {
  /**
   * @param {object} opts
   * @param {import('./sources/base.mjs').BaseSource} opts.source
   * @param {import('./enrichers/llm-tagger.mjs').LLMTagger} opts.tagger
   * @param {import('./enrichers/transcript.mjs').TranscriptFetcher} opts.transcriptFetcher
   * @param {import('./guardrails/ethical-filter.mjs').EthicalFilter} opts.filter
   * @param {import('./store/index-store.mjs').IndexStore} opts.store
   * @param {import('./lib/validator.mjs').Validator} opts.validator
   * @param {import('./lib/config.mjs').Config} opts.config
   */
  constructor({ source, tagger, transcriptFetcher, filter, store, validator, config }) {
    this.source = source;
    this.tagger = tagger;
    this.transcriptFetcher = transcriptFetcher;
    this.filter = filter;
    this.store = store;
    this.validator = validator;
    this.config = config;
    this.stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  /**
   * Enrich a single raw metadata item into a full SEP envelope.
   * @param {object} rawMeta - Raw metadata from a source adapter.
   * @returns {Promise<object>} The enriched SEP envelope.
   */
  async enrichItem(rawMeta) {
    // Fetch transcript for additional LLM context
    let transcript = null;
    try {
      transcript = await this.transcriptFetcher.fetch(rawMeta.videoId, this.source);
    } catch (err) {
      // Transcript is optional; log and continue
      console.warn(`[pipeline] Transcript unavailable for ${rawMeta.videoId}: ${err.message}`);
    }

    // Run LLM tagging to produce enrichment scores
    const enrichment = await this.tagger.tag(rawMeta, transcript);

    // Run ethical guardrail filter
    const guardrailResult = this.filter.check(enrichment, rawMeta);

    // Build the SEP envelope
    const envelope = this._buildEnvelope(rawMeta, enrichment, guardrailResult);

    // Validate against schema
    if (this.validator) {
      const validation = this.validator.validate(envelope, 'enrichment-envelope');
      if (!validation.valid) {
        const errorDetail = validation.errors.join('; ');
        throw new Error(`Envelope validation failed: ${errorDetail}`);
      }
    }

    return envelope;
  }

  /**
   * Process an array of raw items in batches with error recovery.
   * @param {object[]} rawItems - Array of raw metadata objects.
   * @param {object} opts
   * @param {number} [opts.batchSize=10] - Number of items per batch.
   * @param {function} [opts.onProgress] - Callback invoked after each item: (stats, item, envelope|null).
   * @returns {Promise<object[]>} Array of successfully enriched envelopes.
   */
  async enrichBatch(rawItems, { batchSize = 10, onProgress } = {}) {
    const envelopes = [];

    for (let i = 0; i < rawItems.length; i += batchSize) {
      const batch = rawItems.slice(i, i + batchSize);

      for (const item of batch) {
        this.stats.processed++;

        try {
          // Check if already stored to avoid duplicate work
          if (this.store && item.videoId) {
            const existing = await this.store.getByOriginId('youtube', item.videoId);
            if (existing) {
              this.stats.skipped++;
              if (onProgress) onProgress(this.stats, item, null);
              continue;
            }
          }

          const envelope = await this.enrichItem(item);
          envelopes.push(envelope);

          // Persist to store
          if (this.store) {
            await this.store.put(envelope);
          }

          this.stats.succeeded++;
          if (onProgress) onProgress(this.stats, item, envelope);
        } catch (err) {
          this.stats.failed++;
          console.error(`[pipeline] Failed to enrich item ${item.videoId || item.title}: ${err.message}`);
          if (onProgress) onProgress(this.stats, item, null);
        }
      }
    }

    return envelopes;
  }

  /**
   * Full pipeline run: fetch from source, enrich, validate, and store.
   * @param {object} opts
   * @param {string} opts.query - Search query for the source.
   * @param {number} [opts.maxResults=50] - Maximum results to fetch.
   * @param {string} [opts.category] - Optional category filter hint.
   * @param {number} [opts.batchSize=10] - Batch size for enrichment.
   * @param {function} [opts.onProgress] - Progress callback.
   * @returns {Promise<{envelopes: object[], stats: object}>}
   */
  async run({ query, maxResults = 50, category, batchSize = 10, onProgress }) {
    // Reset stats for this run
    this.stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

    console.log(`[pipeline] Searching for "${query}" (max ${maxResults})...`);

    // Step 1: Fetch raw items from source
    const searchResults = await this.source.search(query, maxResults);
    console.log(`[pipeline] Found ${searchResults.length} results from ${this.source.name}`);

    if (searchResults.length === 0) {
      return { envelopes: [], stats: this.stats };
    }

    // Step 2: Get detailed metadata for all results
    const videoIds = searchResults.map(r => r.videoId);
    const detailedItems = await this.source.getVideoDetails(videoIds);
    console.log(`[pipeline] Got details for ${detailedItems.length} items`);

    // Step 3: Enrich in batches
    const envelopes = await this.enrichBatch(detailedItems, { batchSize, onProgress });

    console.log(`[pipeline] Complete. ${JSON.stringify(this.stats)}`);
    return { envelopes, stats: { ...this.stats } };
  }

  /**
   * Build a SEP envelope from raw metadata, enrichment, and guardrail result.
   * @private
   */
  _buildEnvelope(rawMeta, enrichment, guardrailResult) {
    const durationSeconds = typeof rawMeta.duration_seconds === 'number'
      ? rawMeta.duration_seconds
      : (typeof rawMeta.duration === 'number' ? rawMeta.duration : 0);

    const thumbnailUrl = rawMeta.thumbnails?.high?.url
      || rawMeta.thumbnails?.medium?.url
      || rawMeta.thumbnails?.default?.url
      || '';

    return {
      sep_version: '0.1.0',
      item_id: crypto.randomUUID(),
      source: {
        platform: 'youtube',
        origin_url: `https://www.youtube.com/watch?v=${rawMeta.videoId}`,
        origin_id: rawMeta.videoId,
        content_type: 'video',
        duration_seconds: durationSeconds,
      },
      meta: {
        title: rawMeta.title || '',
        creator: rawMeta.channelTitle || '',
        published: rawMeta.publishedAt || new Date().toISOString(),
        original_tags: rawMeta.tags || [],
        language: rawMeta.defaultLanguage || rawMeta.defaultAudioLanguage || 'en',
        thumbnail_url: thumbnailUrl,
      },
      enrichment: {
        schema_version: enrichment.schema_version,
        enriched_at: enrichment.enriched_at,
        categories: enrichment.categories,
        emotional_tone: enrichment.emotional_tone,
        energy_level: enrichment.energy_level,
        cognitive_load: enrichment.cognitive_load,
        motivation_score: enrichment.motivation_score,
        humor_score: enrichment.humor_score,
        skill_transfer_score: enrichment.skill_transfer_score,
        production_quality: enrichment.production_quality,
        session_fit: enrichment.session_fit,
      },
      provider: {
        id: 'good-vibes-main',
        guardrail_pass: guardrailResult.pass,
        guardrail_version: guardrailResult.version || '0.1.0',
      },
    };
  }
}
