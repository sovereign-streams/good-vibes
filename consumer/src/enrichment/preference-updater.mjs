/**
 * Preference Updater — Calculate weight adjustment suggestions from behavior signals.
 *
 * Aggregates signals from the behavior interpreter, calculates suggested
 * weight changes with a configurable learning rate, applies exponential
 * decay to old data, and generates human-readable summaries.
 *
 * NEVER auto-applies changes. Returns suggestions for user confirmation.
 */

const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_DECAY_FACTOR = 0.95;  // per-session decay on historical signals
const MIN_WEIGHT = 0.0;
const MAX_WEIGHT = 1.0;

/**
 * Aggregate signals from multiple session interpretations.
 *
 * @param {object[]} sessionInterpretations - Array of interpretSession() results
 * @param {number} [decayFactor=0.95] - Exponential decay factor (most recent = 1.0, older sessions decay)
 * @returns {{ category_scores: Record<string, number>, tone_scores: Record<string, number>, session_count: number }}
 */
export function aggregateSignals(sessionInterpretations, decayFactor = DEFAULT_DECAY_FACTOR) {
  const categoryAccum = {};  // category → weighted sum
  const categoryCounts = {};
  const toneAccum = {};
  const toneCounts = {};

  // Process sessions from oldest to newest (most recent gets highest weight)
  const sessions = [...sessionInterpretations];

  for (let i = 0; i < sessions.length; i++) {
    // Decay: oldest session gets decayFactor^(n-1), newest gets 1.0
    const age = sessions.length - 1 - i;
    const weight = Math.pow(decayFactor, age);
    const session = sessions[i];

    for (const [catId, avgSignal] of Object.entries(session.category_signals)) {
      if (!categoryAccum[catId]) { categoryAccum[catId] = 0; categoryCounts[catId] = 0; }
      categoryAccum[catId] += avgSignal * weight;
      categoryCounts[catId] += weight;
    }

    for (const [tone, avgSignal] of Object.entries(session.tone_signals)) {
      if (!toneAccum[tone]) { toneAccum[tone] = 0; toneCounts[tone] = 0; }
      toneAccum[tone] += avgSignal * weight;
      toneCounts[tone] += weight;
    }
  }

  // Normalize to weighted averages
  const category_scores = {};
  for (const [catId, sum] of Object.entries(categoryAccum)) {
    category_scores[catId] = categoryCounts[catId] > 0 ? sum / categoryCounts[catId] : 0;
  }

  const tone_scores = {};
  for (const [tone, sum] of Object.entries(toneAccum)) {
    tone_scores[tone] = toneCounts[tone] > 0 ? sum / toneCounts[tone] : 0;
  }

  return { category_scores, tone_scores, session_count: sessions.length };
}

/**
 * Calculate suggested weight changes based on aggregated signals.
 *
 * @param {object} currentWeights - Current profile category weights
 * @param {object} aggregated - Output from aggregateSignals()
 * @param {number} [learningRate=0.1] - How aggressively to adjust weights
 * @returns {{ suggestions: Array<{ category: string, current: number, suggested: number, delta: number, reason: string }>, summary: string[] }}
 */
export function calculateAdjustments(currentWeights, aggregated, learningRate = DEFAULT_LEARNING_RATE) {
  const suggestions = [];
  const summaryParts = [];
  const allCategories = new Set([
    ...Object.keys(currentWeights),
    ...Object.keys(aggregated.category_scores),
  ]);

  for (const catId of allCategories) {
    const current = currentWeights[catId] ?? 0;
    const signal = aggregated.category_scores[catId];

    if (signal == null) continue;

    const delta = signal * learningRate;
    let suggested = current + delta;
    suggested = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, suggested));
    suggested = Math.round(suggested * 1000) / 1000;

    const roundedDelta = Math.round((suggested - current) * 1000) / 1000;

    if (Math.abs(roundedDelta) < 0.005) continue;

    const direction = roundedDelta > 0 ? 'increase' : 'decrease';
    const catLabel = catId.replace(/_/g, ' ');

    let reason;
    if (roundedDelta > 0.05) {
      reason = `Strong positive engagement with ${catLabel} content`;
      summaryParts.push(`You seem to enjoy more ${catLabel} content lately`);
    } else if (roundedDelta > 0) {
      reason = `Positive engagement with ${catLabel} content`;
      summaryParts.push(`Slightly more ${catLabel} seems to work well for you`);
    } else if (roundedDelta < -0.05) {
      reason = `Low engagement with ${catLabel} content`;
      summaryParts.push(`You've been skipping ${catLabel} content — less might be better`);
    } else {
      reason = `Slightly reduced engagement with ${catLabel} content`;
      summaryParts.push(`Slightly less ${catLabel} might improve your sessions`);
    }

    suggestions.push({
      category: catId,
      current: Math.round(current * 1000) / 1000,
      suggested,
      delta: roundedDelta,
      direction,
      reason,
    });
  }

  // Sort by absolute delta descending (most significant changes first)
  suggestions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { suggestions, summary: summaryParts };
}

/**
 * Generate a complete adjustment proposal from session history.
 * This is the main entry point for the preference update flow.
 *
 * @param {object} options
 * @param {object} options.currentWeights - Current profile category weights
 * @param {object[]} options.sessionHistory - Array of interpretSession() results, ordered chronologically
 * @param {number} [options.learningRate] - How aggressively to adjust
 * @param {number} [options.decayFactor] - Exponential decay for older sessions
 * @param {number} [options.minSessions=3] - Minimum sessions before suggesting changes
 * @returns {object} Adjustment proposal (never auto-applied)
 */
export function generateProposal(options) {
  const {
    currentWeights,
    sessionHistory,
    learningRate = DEFAULT_LEARNING_RATE,
    decayFactor = DEFAULT_DECAY_FACTOR,
    minSessions = 3,
  } = options;

  if (sessionHistory.length < minSessions) {
    return {
      status: 'insufficient_data',
      sessions_analyzed: sessionHistory.length,
      sessions_needed: minSessions,
      message: `Need at least ${minSessions} sessions before suggesting changes (have ${sessionHistory.length})`,
      suggestions: [],
      summary: [],
    };
  }

  const aggregated = aggregateSignals(sessionHistory, decayFactor);
  const { suggestions, summary } = calculateAdjustments(currentWeights, aggregated, learningRate);

  return {
    status: suggestions.length > 0 ? 'ready' : 'no_changes',
    sessions_analyzed: sessionHistory.length,
    aggregated_scores: aggregated.category_scores,
    suggestions,
    summary,
    proposed_weights: buildProposedWeights(currentWeights, suggestions),
    auto_applied: false,
  };
}

/**
 * Build a new weights object by applying suggestions to current weights.
 *
 * @param {object} currentWeights
 * @param {Array<{ category: string, suggested: number }>} suggestions
 * @returns {object} New weights map
 */
function buildProposedWeights(currentWeights, suggestions) {
  const proposed = { ...currentWeights };
  for (const s of suggestions) {
    proposed[s.category] = s.suggested;
  }
  return proposed;
}
