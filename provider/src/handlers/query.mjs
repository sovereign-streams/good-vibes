import { matchItems } from '../query-engine/matcher.mjs';
import { rankItems } from '../query-engine/ranker.mjs';
import { suggestArc } from '../query-engine/arc-suggester.mjs';

export async function handleQuery(intent) {
  if (!intent || !intent.intent) {
    const err = new Error('Missing intent payload');
    err.statusCode = 400;
    err.code = 'INVALID_INTENT';
    throw err;
  }

  // Get store reference (lazy loaded)
  const store = await getStore();

  // Match items against intent weights and filters
  const matched = await matchItems(store, intent.intent);

  // Rank by combined relevance
  const ranked = rankItems(matched, intent.intent.weights || {});

  // Determine payload size
  const maxPayload = Math.min(ranked.length, 100);
  const items = ranked.slice(0, maxPayload);

  // Suggest session arc if session is composed
  let suggestedArc = null;
  if (intent.intent.session_type === 'composed' && intent.intent.target_duration_minutes) {
    suggestedArc = suggestArc(items, intent.intent.target_duration_minutes);
  }

  return {
    sep_version: '0.1.0',
    provider_id: 'good-vibes-main',
    response_type: 'payload',
    payload: {
      items,
      total_available: matched.length,
      returned: items.length,
      confidence: items.length > 0 ? Math.round(items.reduce((sum, i) => sum + (i._relevance || 0.5), 0) / items.length * 100) / 100 : 0,
      suggested_arc: suggestedArc,
      state_token: null
    },
    capabilities: {
      supports_stateful: false,
      supports_full_index_browse: true,
      supports_telemetry_exchange: true,
      max_payload_size: 100
    }
  };
}

let _store = null;
async function getStore() {
  if (_store) return _store;
  try {
    const { IndexStore } = await import('../../enrichment/src/store/index-store.mjs');
    const { SQLiteAdapter } = await import('../../enrichment/src/store/adapters/sqlite.mjs');
    const dbPath = process.env.DB_PATH || './data/good-vibes.db';
    const adapter = new SQLiteAdapter(dbPath);
    _store = new IndexStore(adapter);
    await _store.initialize();
    return _store;
  } catch (err) {
    console.error('Failed to initialize store:', err.message);
    // Return a stub store that returns empty results
    return { query: async () => [], stats: async () => ({ totalItems: 0 }) };
  }
}
