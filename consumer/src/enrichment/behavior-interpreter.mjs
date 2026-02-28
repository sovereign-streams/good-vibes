/**
 * Behavior Interpreter — Interpret user engagement signals into
 * actionable weight adjustment suggestions.
 *
 * Maps raw telemetry signals (watched, skipped, replayed, paused, abandoned)
 * to weight adjustment suggestions per category and tone.
 */

/**
 * Signal strength values for different engagement patterns.
 * Positive = user liked it, negative = user didn't.
 */
const SIGNAL_WEIGHTS = {
  completed: 0.6,            // Watched to completion → strong positive
  skipped_early: -0.5,       // Skipped within first 20% → negative
  skipped_mid: -0.2,         // Skipped between 20-60% → mild negative
  replayed: 1.0,             // Replayed → very strong positive
  paused_and_returned: 0.3,  // Paused then continued → moderate positive
  liked: 0.8,                // Explicit like → strong positive
  viewed_not_completed: 0.1, // Viewed but didn't finish (past 60%) → slight positive
};

/**
 * Interpret a single telemetry item against its enrichment envelope.
 *
 * @param {object} telemetryItem - From telemetry schema (item_id, viewed, completed, etc.)
 * @param {object} enrichmentEnvelope - The corresponding enrichment envelope
 * @returns {{ signals: Array<{ type: string, strength: number }>, categories: string[], primary_tone: string }}
 */
export function interpretItem(telemetryItem, enrichmentEnvelope) {
  const signals = [];
  const e = enrichmentEnvelope.enrichment;
  const duration = enrichmentEnvelope.source?.duration_seconds ?? 0;

  if (!telemetryItem.viewed) {
    // Item was in session but never viewed — neutral, no signal
    return {
      signals: [],
      categories: e.categories.map(c => c.id),
      primary_tone: e.emotional_tone.primary,
    };
  }

  // Replayed — very strong positive
  if (telemetryItem.rewatched) {
    signals.push({ type: 'replayed', strength: SIGNAL_WEIGHTS.replayed });
  }

  // Liked explicitly
  if (telemetryItem.liked) {
    signals.push({ type: 'liked', strength: SIGNAL_WEIGHTS.liked });
  }

  // Completed
  if (telemetryItem.completed) {
    signals.push({ type: 'completed', strength: SIGNAL_WEIGHTS.completed });
  } else if (duration > 0 && telemetryItem.skipped_at_seconds != null) {
    const watchRatio = telemetryItem.skipped_at_seconds / duration;
    if (watchRatio < 0.2) {
      signals.push({ type: 'skipped_early', strength: SIGNAL_WEIGHTS.skipped_early });
    } else if (watchRatio < 0.6) {
      signals.push({ type: 'skipped_mid', strength: SIGNAL_WEIGHTS.skipped_mid });
    } else {
      signals.push({ type: 'viewed_not_completed', strength: SIGNAL_WEIGHTS.viewed_not_completed });
    }
  } else if (telemetryItem.view_duration_seconds != null && duration > 0) {
    const watchRatio = telemetryItem.view_duration_seconds / duration;
    if (watchRatio >= 0.6) {
      signals.push({ type: 'viewed_not_completed', strength: SIGNAL_WEIGHTS.viewed_not_completed });
    } else if (watchRatio < 0.2) {
      signals.push({ type: 'skipped_early', strength: SIGNAL_WEIGHTS.skipped_early });
    } else {
      signals.push({ type: 'skipped_mid', strength: SIGNAL_WEIGHTS.skipped_mid });
    }
  }

  // Paused and returned
  if (telemetryItem.paused && telemetryItem.completed) {
    signals.push({ type: 'paused_and_returned', strength: SIGNAL_WEIGHTS.paused_and_returned });
  }

  return {
    signals,
    categories: e.categories.map(c => c.id),
    primary_tone: e.emotional_tone.primary,
  };
}

/**
 * Interpret a full session's telemetry against enrichment data.
 *
 * @param {object} sessionTelemetry - { session_id, items: [...], session_completed, session_satisfaction }
 * @param {Map<string, object>} enrichmentMap - Map of item_id → enrichment envelope
 * @returns {object} Aggregated interpretation
 */
export function interpretSession(sessionTelemetry, enrichmentMap) {
  const itemResults = [];
  const categorySignals = {};   // category_id → [strengths]
  const toneSignals = {};       // tone → [strengths]
  let abandonmentAnalysis = null;

  for (const telItem of sessionTelemetry.items) {
    const envelope = enrichmentMap.get(telItem.item_id);
    if (!envelope) continue;

    const result = interpretItem(telItem, envelope);
    itemResults.push({ item_id: telItem.item_id, ...result });

    // Aggregate by category
    for (const catId of result.categories) {
      if (!categorySignals[catId]) categorySignals[catId] = [];
      for (const sig of result.signals) {
        categorySignals[catId].push(sig.strength);
      }
    }

    // Aggregate by tone
    if (result.primary_tone) {
      if (!toneSignals[result.primary_tone]) toneSignals[result.primary_tone] = [];
      for (const sig of result.signals) {
        toneSignals[result.primary_tone].push(sig.strength);
      }
    }
  }

  // Session abandonment analysis
  if (!sessionTelemetry.session_completed) {
    abandonmentAnalysis = analyzeAbandonment(sessionTelemetry.items, enrichmentMap);
  }

  // Compute average signal per category
  const categoryAverages = {};
  for (const [catId, strengths] of Object.entries(categorySignals)) {
    categoryAverages[catId] = strengths.length > 0
      ? strengths.reduce((a, b) => a + b, 0) / strengths.length
      : 0;
  }

  const toneAverages = {};
  for (const [tone, strengths] of Object.entries(toneSignals)) {
    toneAverages[tone] = strengths.length > 0
      ? strengths.reduce((a, b) => a + b, 0) / strengths.length
      : 0;
  }

  return {
    session_id: sessionTelemetry.session_id,
    session_completed: sessionTelemetry.session_completed,
    session_satisfaction: sessionTelemetry.session_satisfaction,
    item_count: itemResults.length,
    category_signals: categoryAverages,
    tone_signals: toneAverages,
    abandonment: abandonmentAnalysis,
    item_details: itemResults,
  };
}

/**
 * Analyze where in the session the user dropped off.
 *
 * @param {object[]} telemetryItems
 * @param {Map<string, object>} enrichmentMap
 * @returns {object}
 */
function analyzeAbandonment(telemetryItems, enrichmentMap) {
  let lastViewedIndex = -1;

  for (let i = 0; i < telemetryItems.length; i++) {
    if (telemetryItems[i].viewed) {
      lastViewedIndex = i;
    }
  }

  if (lastViewedIndex < 0) {
    return { drop_point: 'beginning', position_ratio: 0, context: null };
  }

  const positionRatio = (lastViewedIndex + 1) / telemetryItems.length;
  const lastItem = telemetryItems[lastViewedIndex];
  const envelope = enrichmentMap.get(lastItem.item_id);

  let phase;
  if (positionRatio <= 0.15) phase = 'opener';
  else if (positionRatio <= 0.60) phase = 'builder';
  else if (positionRatio <= 0.85) phase = 'peak';
  else phase = 'closer';

  return {
    drop_point: phase,
    position_ratio: Math.round(positionRatio * 100) / 100,
    last_viewed_index: lastViewedIndex,
    total_items: telemetryItems.length,
    context: envelope ? {
      categories: envelope.enrichment.categories.map(c => c.id),
      energy_level: envelope.enrichment.energy_level,
      primary_tone: envelope.enrichment.emotional_tone.primary,
    } : null,
  };
}

export { SIGNAL_WEIGHTS };
