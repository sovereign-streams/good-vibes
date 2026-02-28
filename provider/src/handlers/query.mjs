import { matchItems } from '../query-engine/matcher.mjs';
import { rankItems } from '../query-engine/ranker.mjs';
import { suggestArc } from '../query-engine/arc-suggester.mjs';
import { ProviderConfig } from '../lib/config.mjs';
import { StateManager } from '../query-engine/state-manager.mjs';

const stateManager = new StateManager({ ttlMs: ProviderConfig.stateTokenTtlMs });

export async function handleQuery(body) {
  // --- Validation ---
  if (!body || !body.intent) {
    const err = new Error('Missing intent payload');
    err.statusCode = 400;
    err.code = 'INVALID_INTENT';
    throw err;
  }

  const { intent } = body;

  if (!intent.session_type) {
    const err = new Error('Missing intent.session_type');
    err.statusCode = 400;
    err.code = 'INVALID_INTENT';
    throw err;
  }

  if (!intent.weights || typeof intent.weights !== 'object') {
    const err = new Error('Missing or invalid intent.weights');
    err.statusCode = 400;
    err.code = 'INVALID_INTENT';
    throw err;
  }

  // Validate weight values are 0-1
  for (const [key, val] of Object.entries(intent.weights)) {
    if (typeof val !== 'number' || val < 0 || val > 1) {
      const err = new Error(`Invalid weight for "${key}": must be a number between 0 and 1`);
      err.statusCode = 400;
      err.code = 'INVALID_INTENT';
      throw err;
    }
  }

  // --- Stateful session handling ---
  const stateToken = intent.context?.state_token || null;
  const excludeIds = stateManager.getServedIds(stateToken);

  // --- Get store ---
  const store = await getStore();

  // --- Match ---
  const matched = await matchItems(store, intent, { excludeIds });

  // --- Rank ---
  const targetEnergy = energyForTimeOfDay(intent.context?.time_of_day);
  const ranked = rankItems(matched, intent.weights, { targetEnergy });

  // --- Limit payload ---
  const maxPayload = Math.min(ranked.length, ProviderConfig.maxPayloadSize);
  const items = ranked.slice(0, maxPayload);

  // --- Arc suggestion ---
  let suggestedArc = null;
  if (intent.session_type === 'composed' && intent.target_duration_minutes) {
    suggestedArc = suggestArc(items, intent.target_duration_minutes);
  }

  // --- Advance state ---
  const servedIds = items.map(i => i.item_id);
  const arcPositions = suggestedArc ? suggestedArc.map(a => a.position) : [];
  const nextToken = stateManager.advance(stateToken, {
    servedItemIds: servedIds,
    arcPositions,
    weights: intent.weights
  });

  // --- Confidence ---
  const confidence = items.length > 0
    ? Math.round(items.reduce((sum, i) => sum + (i._relevance || 0.5), 0) / items.length * 100) / 100
    : 0;

  // --- Strip internal scoring fields from items before returning ---
  const cleanItems = items.map(stripInternalFields);

  return {
    sep_version: ProviderConfig.sepVersion,
    provider_id: ProviderConfig.providerId,
    response_type: 'payload',
    payload: {
      items: cleanItems,
      total_available: matched.length,
      returned: cleanItems.length,
      confidence,
      suggested_arc: suggestedArc,
      state_token: nextToken
    },
    capabilities: {
      supports_stateful: true,
      supports_full_index_browse: true,
      supports_telemetry_exchange: true,
      max_payload_size: ProviderConfig.maxPayloadSize
    }
  };
}

/** Remove internal scoring properties from an item before sending. */
function stripInternalFields(item) {
  const clean = { ...item };
  delete clean._relevance;
  delete clean._toneAffinity;
  delete clean._sessionFitScore;
  return clean;
}

/** Heuristic: ideal energy level by time of day. */
function energyForTimeOfDay(time) {
  switch (time) {
    case 'morning': return 0.65;
    case 'afternoon': return 0.55;
    case 'evening': return 0.4;
    case 'night': return 0.25;
    default: return 0.5;
  }
}

// --- Store singleton (lazy) ---
let _store = null;
async function getStore() {
  if (_store) return _store;
  try {
    const { IndexStore } = await import('../../../enrichment/src/store/index-store.mjs');
    const { SQLiteAdapter } = await import('../../../enrichment/src/store/adapters/sqlite.mjs');
    const adapter = new SQLiteAdapter(ProviderConfig.dbPath);
    _store = new IndexStore(adapter);
    await _store.initialize();
    return _store;
  } catch (err) {
    console.error('Failed to initialize store:', err.message);
    return {
      query: async () => [],
      stats: async () => ({ totalItems: 0 }),
      getAll: async () => []
    };
  }
}

// Expose for testing
export { stateManager, getStore };
