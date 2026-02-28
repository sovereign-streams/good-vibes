export async function handleBrowse(params) {
  const limit = Math.min(parseInt(params.limit || '20', 10), 100);
  const offset = parseInt(params.offset || '0', 10);
  const category = params.category || null;
  const contentType = params.content_type || null;

  const store = await getStore();

  const filters = { limit, offset };
  if (category) filters.categories = [category];
  if (contentType) filters.contentType = contentType;
  filters.guardrailPass = true;

  const items = await store.query(filters);
  const stats = await store.stats();

  return {
    sep_version: '0.1.0',
    provider_id: 'good-vibes-main',
    response_type: 'payload',
    payload: {
      items,
      total_available: stats.totalItems || 0,
      returned: items.length,
      offset,
      limit
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
    return { query: async () => [], stats: async () => ({ totalItems: 0 }) };
  }
}
