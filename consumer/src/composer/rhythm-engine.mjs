/**
 * Rhythm Engine — Pacing, transitions, and flow scoring for session arcs.
 *
 * Scores transitions between adjacent items, optimizes ordering to smooth
 * transitions, applies energy curves from arc templates, calculates overall
 * flow scores, and suggests break points for long sessions.
 */

/**
 * Score the transition between two adjacent enrichment items.
 * Lower score = smoother transition. Range [0, 1].
 *
 * @param {object} itemA - Enrichment envelope
 * @param {object} itemB - Enrichment envelope
 * @returns {{ score: number, energy_delta: number, tone_shift: boolean, category_change: boolean }}
 */
export function scoreTransition(itemA, itemB) {
  const eA = itemA.enrichment;
  const eB = itemB.enrichment;

  // Energy delta (absolute difference)
  const energy_delta = Math.abs(eA.energy_level - eB.energy_level);

  // Tone shift: primary tones differ
  const tone_shift = eA.emotional_tone.primary !== eB.emotional_tone.primary;

  // Category change: no overlap in top categories
  const catsA = new Set(eA.categories.map(c => c.id));
  const catsB = new Set(eB.categories.map(c => c.id));
  let category_overlap = 0;
  for (const cat of catsA) {
    if (catsB.has(cat)) category_overlap++;
  }
  const category_change = category_overlap === 0;

  // Composite score: weighted blend
  const score = Math.min(1, (
    energy_delta * 0.4 +
    (tone_shift ? 0.3 : 0) +
    (category_change ? 0.3 : 0)
  ));

  return { score, energy_delta, tone_shift, category_change };
}

/**
 * Calculate a flow score for an ordered list of items.
 * Higher = better flow. Range [0, 1].
 *
 * @param {object[]} items - Ordered enrichment envelopes
 * @returns {{ flow_score: number, transitions: Array<{ from: number, to: number, score: number }> }}
 */
export function calculateFlowScore(items) {
  if (items.length <= 1) {
    return { flow_score: 1.0, transitions: [] };
  }

  const transitions = [];
  let totalPenalty = 0;

  for (let i = 0; i < items.length - 1; i++) {
    const t = scoreTransition(items[i], items[i + 1]);
    transitions.push({ from: i, to: i + 1, score: t.score });
    totalPenalty += t.score;
  }

  const avgPenalty = totalPenalty / transitions.length;
  const flow_score = Math.round((1 - avgPenalty) * 1000) / 1000;

  return { flow_score: Math.max(0, flow_score), transitions };
}

/**
 * Optimize item ordering within a phase to minimize transition roughness.
 * Uses a greedy nearest-neighbor approach: start from the item closest to
 * the target energy, then pick the smoothest next transition each step.
 *
 * @param {object[]} items - Enrichment envelopes to reorder
 * @param {number} targetEnergy - The target energy level for this phase
 * @returns {object[]} Reordered items
 */
export function optimizeOrdering(items, targetEnergy) {
  if (items.length <= 2) return [...items];

  const remaining = [...items];

  // Start with the item closest to target energy
  remaining.sort((a, b) =>
    Math.abs(a.enrichment.energy_level - targetEnergy) -
    Math.abs(b.enrichment.energy_level - targetEnergy)
  );

  const ordered = [remaining.shift()];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const t = scoreTransition(last, remaining[i]);
      if (t.score < bestScore) {
        bestScore = t.score;
        bestIdx = i;
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered;
}

/**
 * Apply an energy curve to items within a phase by sorting them to match
 * the target energy direction (ascending toward peak, descending toward close).
 *
 * @param {object[]} items - Enrichment envelopes
 * @param {number} startEnergy - Target energy at phase start
 * @param {number} endEnergy - Target energy at phase end
 * @returns {object[]} Items sorted to follow the energy direction
 */
export function applyEnergyCurve(items, startEnergy, endEnergy) {
  if (items.length <= 1) return [...items];

  const sorted = [...items];
  if (endEnergy >= startEnergy) {
    // Energy ascending — sort low to high
    sorted.sort((a, b) => a.enrichment.energy_level - b.enrichment.energy_level);
  } else {
    // Energy descending — sort high to low
    sorted.sort((a, b) => b.enrichment.energy_level - a.enrichment.energy_level);
  }

  return sorted;
}

/**
 * Suggest break points for long sessions. A break is suggested after any
 * transition with a score above the threshold, or at regular intervals.
 *
 * @param {object[]} items - Ordered enrichment envelopes
 * @param {object} options
 * @param {number} [options.interval_minutes=20] - Suggest a break every N minutes
 * @param {number} [options.transition_threshold=0.6] - Suggest break at transitions rougher than this
 * @returns {Array<{ after_index: number, reason: string }>}
 */
export function suggestBreakPoints(items, options = {}) {
  const {
    interval_minutes = 20,
    transition_threshold = 0.6,
  } = options;

  const breaks = [];
  let elapsed = 0;
  let lastBreakAt = 0;

  for (let i = 0; i < items.length; i++) {
    elapsed += (items[i].source?.duration_seconds ?? 0) / 60;

    if (i < items.length - 1) {
      const t = scoreTransition(items[i], items[i + 1]);

      // Break at rough transitions
      if (t.score >= transition_threshold) {
        breaks.push({ after_index: i, reason: 'rough_transition' });
        lastBreakAt = elapsed;
      }
    }

    // Break at time intervals
    if (elapsed - lastBreakAt >= interval_minutes && i < items.length - 1) {
      // Avoid duplicate break at same index
      if (!breaks.length || breaks[breaks.length - 1].after_index !== i) {
        breaks.push({ after_index: i, reason: 'time_interval' });
        lastBreakAt = elapsed;
      }
    }
  }

  return breaks;
}
