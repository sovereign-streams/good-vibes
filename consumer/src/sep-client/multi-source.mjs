/**
 * Multi-Source — Query multiple providers in parallel, merge payloads,
 * deduplicate items, and handle partial failures gracefully.
 */

import { SEPClient } from './client.mjs';
import { negotiate } from './negotiator.mjs';

export class MultiSource {
  /**
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Per-provider timeout
   * @param {number} [options.maxRetries] - Per-provider retry count
   */
  constructor(options = {}) {
    this.options = options;
    this.clients = new Map(); // endpoint → SEPClient
  }

  /**
   * Register a provider by endpoint URL.
   *
   * @param {string} endpoint - Provider base URL
   * @param {object} [clientOptions] - Override options for this provider
   * @returns {SEPClient}
   */
  addProvider(endpoint, clientOptions = {}) {
    const client = new SEPClient(endpoint, { ...this.options, ...clientOptions });
    this.clients.set(endpoint, client);
    return client;
  }

  /**
   * Remove a provider.
   *
   * @param {string} endpoint
   */
  removeProvider(endpoint) {
    this.clients.delete(endpoint);
  }

  /**
   * Query all registered providers in parallel with the given intent.
   * Merges results, deduplicates, and handles failures gracefully.
   *
   * @param {object} intent - Consumer intent (SEP consumer-intent schema)
   * @param {object} [options]
   * @param {object} [options.consumerNeeds] - For negotiation per provider
   * @returns {object} Merged result
   */
  async queryAll(intent, options = {}) {
    const endpoints = Array.from(this.clients.keys());

    if (endpoints.length === 0) {
      return emptyResult();
    }

    // Query all providers in parallel
    const results = await Promise.allSettled(
      endpoints.map(endpoint => this._queryProvider(endpoint, intent, options))
    );

    // Collect successes and failures
    const payloads = [];
    const errors = [];
    const providerResults = [];

    for (let i = 0; i < results.length; i++) {
      const endpoint = endpoints[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        payloads.push(result.value);
        providerResults.push({
          endpoint,
          status: 'success',
          item_count: result.value.items.length,
          confidence: result.value.confidence,
          state_token: result.value.state_token,
        });
      } else {
        errors.push({ endpoint, error: result.reason.message || String(result.reason) });
        providerResults.push({
          endpoint,
          status: 'error',
          error: result.reason.message || String(result.reason),
        });
      }
    }

    // Merge and deduplicate
    const mergedItems = deduplicateItems(payloads.flatMap(p => p.items));

    // Unified scoring: normalize across providers
    const scoredItems = unifiedScore(mergedItems, intent);

    // Merge suggested arcs
    const suggestedArcs = payloads
      .filter(p => p.suggested_arc)
      .map(p => p.suggested_arc);

    // Overall confidence: weighted average by item count
    let totalItems = 0;
    let weightedConfidence = 0;
    for (const p of payloads) {
      totalItems += p.items.length;
      weightedConfidence += (p.confidence || 0) * p.items.length;
    }
    const confidence = totalItems > 0 ? weightedConfidence / totalItems : 0;

    return {
      items: scoredItems,
      total_available: payloads.reduce((sum, p) => sum + (p.total_available || 0), 0),
      returned: scoredItems.length,
      confidence: Math.round(confidence * 1000) / 1000,
      suggested_arcs: suggestedArcs,
      providers: providerResults,
      errors,
      partial: errors.length > 0 && payloads.length > 0,
      all_failed: payloads.length === 0 && errors.length > 0,
    };
  }

  /**
   * Fetch manifests from all providers in parallel.
   *
   * @returns {Array<{ endpoint: string, manifest: object|null, error: string|null }>}
   */
  async fetchAllManifests() {
    const endpoints = Array.from(this.clients.keys());
    const results = await Promise.allSettled(
      endpoints.map(endpoint => this.clients.get(endpoint).getManifest())
    );

    return endpoints.map((endpoint, i) => {
      const result = results[i];
      return {
        endpoint,
        manifest: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? (result.reason.message || String(result.reason)) : null,
      };
    });
  }

  /**
   * Query a single provider with optional negotiation.
   *
   * @private
   */
  async _queryProvider(endpoint, intent, options) {
    const client = this.clients.get(endpoint);

    // Optionally negotiate first
    if (options.consumerNeeds) {
      const manifest = await client.manifest();
      const negotiation = negotiate(manifest, options.consumerNeeds);
      if (!negotiation.compatible) {
        throw new Error(`Provider ${endpoint} is not compatible: ${negotiation.warnings.join('; ')}`);
      }
    }

    const response = await client.query(intent);

    return {
      items: response.payload?.items || [],
      total_available: response.payload?.total_available || 0,
      confidence: response.payload?.confidence || 0,
      suggested_arc: response.payload?.suggested_arc || null,
      state_token: response.payload?.state_token || null,
      capabilities: response.capabilities || {},
    };
  }
}

/**
 * Deduplicate items across providers by item_id.
 * First occurrence wins.
 *
 * @param {object[]} items
 * @returns {object[]}
 */
export function deduplicateItems(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (!seen.has(item.item_id)) {
      seen.add(item.item_id);
      deduped.push(item);
    }
  }
  return deduped;
}

/**
 * Apply unified scoring across merged items from multiple providers.
 * Scores by category weight match and sorts descending.
 *
 * @param {object[]} items
 * @param {object} intent
 * @returns {object[]}
 */
function unifiedScore(items, intent) {
  const weights = intent.intent?.weights || {};
  const scored = items.map(item => {
    let score = 0;
    for (const cat of (item.enrichment?.categories || [])) {
      score += (weights[cat.id] || 0) * (cat.confidence || 0);
    }
    return { ...item, _unified_score: score };
  });

  scored.sort((a, b) => b._unified_score - a._unified_score);
  return scored;
}

function emptyResult() {
  return {
    items: [],
    total_available: 0,
    returned: 0,
    confidence: 0,
    suggested_arcs: [],
    providers: [],
    errors: [],
    partial: false,
    all_failed: false,
  };
}
