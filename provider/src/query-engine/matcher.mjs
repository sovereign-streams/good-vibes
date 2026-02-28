/**
 * Matcher — Filters items from the index against consumer intent.
 *
 * Supports:
 * - Category matching (exact + fuzzy via confidence threshold)
 * - Emotional tone filtering and preference matching
 * - Energy level / cognitive load range filters
 * - Session fit preferences
 * - min_schema_version filtering
 * - Content type and language filters
 * - Exclusion of previously-served items (stateful sessions)
 */

// Emotional tone similarity groups for fuzzy matching
const TONE_AFFINITY = {
  calm: ['reflective', 'focused'],
  focused: ['calm', 'reflective'],
  energized: ['inspired', 'amused'],
  amused: ['energized', 'inspired'],
  inspired: ['energized', 'reflective'],
  reflective: ['calm', 'focused']
};

/**
 * Match items from the store against a consumer intent.
 *
 * @param {import('../../enrichment/src/store/index-store.mjs').IndexStore} store
 * @param {object} intent — intent object from consumer-intent schema
 * @param {{ excludeIds?: Set<string>, minSchemaVersion?: string }} opts
 * @returns {Promise<object[]>} filtered items
 */
export async function matchItems(store, intent, opts = {}) {
  // Build SQL-level filters for the store.query() call
  const filters = { guardrailPass: true, limit: 500 };

  // Category filter — request items matching any weighted category
  if (intent.weights && Object.keys(intent.weights).length > 0) {
    filters.categories = Object.keys(intent.weights);
  }

  // Content type filter
  if (intent.filters?.content_type) {
    filters.contentType = intent.filters.content_type;
  }

  // Language filter
  if (intent.filters?.language?.length) {
    filters.language = intent.filters.language[0];
  }

  // Query the SQLite store
  let items = await store.query(filters);

  // --- Post-query filters (operate on deserialized enrichment JSON) ---

  // Exclude previously served items (stateful sessions)
  if (opts.excludeIds && opts.excludeIds.size > 0) {
    items = items.filter(item => !opts.excludeIds.has(item.item_id));
  }

  // min_schema_version filter
  if (opts.minSchemaVersion) {
    items = items.filter(item => {
      const sv = item.enrichment?.schema_version || '0.0.0';
      return compareVersions(sv, opts.minSchemaVersion) >= 0;
    });
  }

  // Emotional tone exclusion flags
  if (intent.filters) {
    items = items.filter(item => {
      const tone = item.enrichment?.emotional_tone;
      if (!tone) return true;
      if (intent.filters.exclude_rage_bait && tone.rage_bait) return false;
      if (intent.filters.exclude_humiliation && tone.humiliation) return false;
      if (intent.filters.exclude_shock_content && tone.shock_content) return false;
      return true;
    });

    // Energy level range
    if (intent.filters.min_energy_level !== undefined) {
      items = items.filter(i =>
        (i.enrichment?.energy_level ?? 0) >= intent.filters.min_energy_level
      );
    }

    // Cognitive load ceiling
    if (intent.filters.max_cognitive_load !== undefined) {
      items = items.filter(i =>
        (i.enrichment?.cognitive_load ?? 1) <= intent.filters.max_cognitive_load
      );
    }
  }

  // Fuzzy emotional tone preference boost — mark items whose tone is
  // compatible with the session context (time_of_day heuristic).
  if (intent.context?.time_of_day) {
    const preferredTones = tonesByTimeOfDay(intent.context.time_of_day);
    items = items.map(item => {
      const primary = item.enrichment?.emotional_tone?.primary;
      if (!primary) return item;

      let toneAffinity = 0;
      if (preferredTones.includes(primary)) {
        toneAffinity = 1.0;
      } else if (TONE_AFFINITY[primary]?.some(t => preferredTones.includes(t))) {
        toneAffinity = 0.5; // fuzzy match — nearby tone
      }
      return { ...item, _toneAffinity: toneAffinity };
    });
  }

  // Session fit preference — boost items whose session_fit matches
  // the session type hint
  if (intent.session_type === 'composed') {
    items = items.map(item => {
      const fit = item.enrichment?.session_fit;
      if (!fit) return item;
      const fitCount = [fit.good_opener, fit.good_builder, fit.good_peak, fit.good_closer]
        .filter(Boolean).length;
      return { ...item, _sessionFitScore: fitCount / 4 };
    });
  }

  return items;
}

/**
 * Return preferred emotional tones for a time of day.
 */
function tonesByTimeOfDay(time) {
  switch (time) {
    case 'morning': return ['energized', 'inspired', 'focused'];
    case 'afternoon': return ['focused', 'energized', 'amused'];
    case 'evening': return ['amused', 'calm', 'reflective'];
    case 'night': return ['calm', 'reflective'];
    default: return [];
  }
}

/**
 * Semver comparison. Returns -1, 0, or 1.
 */
function compareVersions(a, b) {
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
