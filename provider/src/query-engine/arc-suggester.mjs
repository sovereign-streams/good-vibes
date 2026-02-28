/**
 * Arc Suggester — Composes session arcs with energy curve modeling.
 *
 * Arc pattern: opener → builder → peak → closer
 *
 * Energy curve model:
 *   opener  — moderate energy, engaging (warm-up)
 *   builder — rising energy, deepening focus
 *   peak    — highest energy / intensity
 *   closer  — descending energy, grounding
 *
 * Features:
 *   - Duration targeting with per-segment ratios
 *   - Transition smoothness scoring between adjacent items
 *   - Avoid repeating same creator in adjacent slots
 *   - Energy curve adherence scoring
 */

const SEGMENT_DEFS = [
  { label: 'opener',  ratio: 0.15, fitKey: 'good_opener',  targetEnergy: 0.45 },
  { label: 'builder', ratio: 0.45, fitKey: 'good_builder', targetEnergy: 0.65 },
  { label: 'peak',    ratio: 0.25, fitKey: 'good_peak',    targetEnergy: 0.85 },
  { label: 'closer',  ratio: 0.15, fitKey: 'good_closer',  targetEnergy: 0.30 }
];

/**
 * Suggest a session arc from ranked items.
 *
 * @param {object[]} items — ranked items (already sorted by _relevance)
 * @param {number} targetDurationMinutes
 * @returns {object[]} arc entries: { item_id, position, duration_seconds }
 */
export function suggestArc(items, targetDurationMinutes) {
  if (!items.length || !targetDurationMinutes) return [];

  const targetSeconds = targetDurationMinutes * 60;
  const arc = [];
  const usedIds = new Set();
  let totalDuration = 0;

  for (const segDef of SEGMENT_DEFS) {
    const segmentTarget = targetSeconds * segDef.ratio;

    // Gather candidates: prefer items with the right session_fit flag,
    // fall back to any unused item sorted by relevance.
    const preferred = items.filter(i =>
      !usedIds.has(i.item_id) && i.enrichment?.session_fit?.[segDef.fitKey]
    );
    const fallback = items.filter(i =>
      !usedIds.has(i.item_id) && !i.enrichment?.session_fit?.[segDef.fitKey]
    );

    // Score candidates: relevance + energy fit + transition smoothness
    const candidates = [...scoreCandidates(preferred, segDef, arc), ...scoreCandidates(fallback, segDef, arc)];
    candidates.sort((a, b) => b._arcScore - a._arcScore);

    let segmentDuration = 0;
    for (const candidate of candidates) {
      if (usedIds.has(candidate.item_id)) continue;

      const dur = candidate.source?.duration_seconds || 180;

      // Don't overshoot segment by more than 50%
      if (segmentDuration > 0 && segmentDuration + dur > segmentTarget * 1.5) continue;

      arc.push({
        item_id: candidate.item_id,
        position: segDef.label,
        duration_seconds: dur
      });

      usedIds.add(candidate.item_id);
      segmentDuration += dur;
      totalDuration += dur;

      if (totalDuration >= targetSeconds) break;
    }

    if (totalDuration >= targetSeconds) break;
  }

  return arc;
}

/**
 * Score candidates for a segment based on energy fit + transition smoothness.
 */
function scoreCandidates(candidates, segDef, currentArc) {
  const lastCreator = currentArc.length > 0
    ? currentArc[currentArc.length - 1]._creator
    : null;

  return candidates.map(item => {
    const enrichment = item.enrichment || {};

    // Energy fit: how close is the item's energy to the segment's target?
    const itemEnergy = enrichment.energy_level ?? 0.5;
    const energyFit = 1 - Math.abs(itemEnergy - segDef.targetEnergy);

    // Transition smoothness: penalize large energy jumps from previous item
    let transitionScore = 1;
    if (currentArc.length > 0) {
      const prevEnergy = currentArc[currentArc.length - 1]._energy ?? 0.5;
      const jump = Math.abs(itemEnergy - prevEnergy);
      transitionScore = 1 - (jump * 0.5); // moderate penalty for big jumps
    }

    // Creator diversity: avoid adjacent items from same creator
    const creatorPenalty = (item.meta?.creator && item.meta.creator === lastCreator) ? 0.3 : 0;

    // Combined score
    const arcScore =
      (item._relevance || 0) * 0.4 +
      energyFit * 0.3 +
      transitionScore * 0.2 -
      creatorPenalty +
      (enrichment.session_fit?.[segDef.fitKey] ? 0.1 : 0);

    return {
      ...item,
      _arcScore: arcScore,
      _energy: itemEnergy,
      _creator: item.meta?.creator || null
    };
  });
}
