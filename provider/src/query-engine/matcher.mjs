export async function matchItems(store, intent) {
  const filters = { guardrailPass: true, limit: 500 };

  // Apply category filter from weights
  if (intent.weights && Object.keys(intent.weights).length > 0) {
    filters.categories = Object.keys(intent.weights);
  }

  // Apply content type filter
  if (intent.filters?.content_type) {
    filters.contentType = intent.filters.content_type;
  }

  // Apply language filter
  if (intent.filters?.language) {
    filters.language = intent.filters.language[0];
  }

  // Get candidate items
  let items = await store.query(filters);

  // Apply emotional filters
  if (intent.filters) {
    items = items.filter(item => {
      const tone = item.enrichment?.emotional_tone;
      if (!tone) return true;
      if (intent.filters.exclude_rage_bait && tone.rage_bait) return false;
      if (intent.filters.exclude_humiliation && tone.humiliation) return false;
      if (intent.filters.exclude_shock_content && tone.shock_content) return false;
      return true;
    });

    // Apply score filters
    if (intent.filters.min_energy_level !== undefined) {
      items = items.filter(i => (i.enrichment?.energy_level ?? 0) >= intent.filters.min_energy_level);
    }
    if (intent.filters.max_cognitive_load !== undefined) {
      items = items.filter(i => (i.enrichment?.cognitive_load ?? 1) <= intent.filters.max_cognitive_load);
    }
  }

  return items;
}
