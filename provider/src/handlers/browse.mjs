import { ProviderConfig } from '../lib/config.mjs';

export async function handleBrowse(params) {
  const limit = Math.min(
    Math.max(parseInt(params.limit || String(ProviderConfig.defaultBrowseLimit), 10) || ProviderConfig.defaultBrowseLimit, 1),
    ProviderConfig.maxBrowseLimit
  );
  const offset = Math.max(parseInt(params.offset || '0', 10) || 0, 0);
  const category = params.category || null;
  const contentType = params.content_type || null;
  const language = params.language || null;
  const minSchemaVersion = params.min_schema_version || null;

  const store = await getStore();

  const filters = { limit, offset, guardrailPass: true };
  if (category) filters.categories = [category];
  if (contentType) filters.contentType = contentType;
  if (language) filters.language = language;

  let items;
  if (minSchemaVersion) {
    // Use getAll with version filtering, then apply other filters manually
    items = await store.getAll({ limit, offset, minSchemaVersion });
    if (category) {
      items = items.filter(item => {
        const cats = (item.enrichment?.categories || []).map(c => c.id);
        return cats.includes(category);
      });
    }
    if (contentType) {
      items = items.filter(item => item.source?.content_type === contentType);
    }
    if (language) {
      items = items.filter(item => item.meta?.language === language);
    }
    // Ensure guardrail_pass
    items = items.filter(item => item.provider?.guardrail_pass === true);
  } else {
    items = await store.query(filters);
  }

  const stats = await store.stats();

  return {
    sep_version: ProviderConfig.sepVersion,
    provider_id: ProviderConfig.providerId,
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
