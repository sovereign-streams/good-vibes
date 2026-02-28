/**
 * Ranker — Multi-dimensional scoring of matched items.
 *
 * Dimensions:
 *   1. Category weight × confidence  (primary signal)
 *   2. Emotional tone alignment       (from matcher _toneAffinity)
 *   3. Energy level targeting          (how close to ideal range)
 *   4. Diversity bonus                 (avoid repeating same channel / creator)
 *   5. Session fit bonus               (from matcher _sessionFitScore)
 *
 * All weights are configurable via the `scoringWeights` parameter.
 */

const DEFAULT_SCORING_WEIGHTS = {
  categoryMatch: 0.45,
  toneAlignment: 0.15,
  energyTarget: 0.15,
  diversity: 0.15,
  sessionFit: 0.10
};

/**
 * Rank items by multi-dimensional relevance to consumer weights.
 *
 * @param {object[]} items — items with enrichment + optional _toneAffinity / _sessionFitScore
 * @param {object} weights — category weights from consumer intent  e.g. { fitness: 0.3, humor: 0.2 }
 * @param {{ scoringWeights?: object, targetEnergy?: number }} opts
 * @returns {object[]} items sorted by _relevance (descending), with _relevance attached
 */
export function rankItems(items, weights, opts = {}) {
  const sw = { ...DEFAULT_SCORING_WEIGHTS, ...(opts.scoringWeights || {}) };
  const weightEntries = Object.entries(weights);

  if (items.length === 0) return items;

  // Pre-compute creator frequency for diversity scoring
  const creatorCounts = new Map();
  for (const item of items) {
    const creator = item.meta?.creator || 'unknown';
    creatorCounts.set(creator, (creatorCounts.get(creator) || 0) + 1);
  }
  const maxCreatorCount = Math.max(...creatorCounts.values(), 1);

  // Determine target energy level
  const targetEnergy = opts.targetEnergy ?? 0.5;

  const scored = items.map(item => {
    const enrichment = item.enrichment || {};
    const categories = enrichment.categories || [];

    // --- Dimension 1: Category weight × confidence ---
    let categoryScore = 0;
    let totalWeight = 0;
    for (const [categoryId, weight] of weightEntries) {
      const match = categories.find(c => c.id === categoryId);
      if (match) {
        categoryScore += match.confidence * weight;
      }
      totalWeight += weight;
    }
    if (totalWeight > 0) categoryScore /= totalWeight;

    // --- Dimension 2: Emotional tone alignment ---
    const toneScore = item._toneAffinity ?? 0;

    // --- Dimension 3: Energy level targeting ---
    const itemEnergy = enrichment.energy_level ?? 0.5;
    // Score = 1 - distance from target (closer is better)
    const energyScore = 1 - Math.abs(itemEnergy - targetEnergy);

    // --- Dimension 4: Diversity bonus ---
    const creator = item.meta?.creator || 'unknown';
    const creatorFreq = creatorCounts.get(creator) || 1;
    // Rarer creators get higher diversity score
    const diversityScore = 1 - (creatorFreq - 1) / maxCreatorCount;

    // --- Dimension 5: Session fit ---
    const sessionFitScore = item._sessionFitScore ?? 0;

    // --- Combined score ---
    const relevance =
      sw.categoryMatch * categoryScore +
      sw.toneAlignment * toneScore +
      sw.energyTarget * energyScore +
      sw.diversity * diversityScore +
      sw.sessionFit * sessionFitScore;

    return {
      ...item,
      _relevance: Math.round(relevance * 1000) / 1000
    };
  });

  return scored.sort((a, b) => b._relevance - a._relevance);
}
