/**
 * Learning — Preference refinement over time.
 *
 * Analyzes engagement patterns, suggests weight adjustments,
 * decays old preferences, and generates proposals.
 * NEVER auto-applies — all changes require user confirmation.
 */

import { interpretSession } from '../enrichment/behavior-interpreter.mjs';
import { generateProposal } from '../enrichment/preference-updater.mjs';
import { Config } from '../lib/config.mjs';

export class Learning {
  /**
   * @param {import('../lib/storage.mjs').Storage} storage
   * @param {import('./history.mjs').History} history
   */
  constructor(storage, history) {
    this.storage = storage;
    this.history = history;
  }

  /**
   * Analyze recent engagement and generate a weight adjustment proposal.
   * The proposal is saved as a snapshot but NOT applied.
   *
   * @param {object} profile - Current normalized profile
   * @param {Map<string, object>} enrichmentMap - Map of item_id to enrichment envelope
   * @param {object} [options]
   * @param {number} [options.learningRate]
   * @param {number} [options.decayFactor]
   * @param {number} [options.minSessions]
   * @param {number} [options.maxSessions=20]
   * @returns {object} Proposal object
   */
  generateAdjustmentProposal(profile, enrichmentMap, options = {}) {
    const {
      learningRate = Config.learningRate,
      decayFactor = Config.decayFactor,
      minSessions = Config.minSessionsForLearning,
      maxSessions = 20,
    } = options;

    // Get recent session summaries
    const summaries = this.history.getEngagementSummaries(maxSessions);
    if (summaries.length < minSessions) {
      return {
        status: 'insufficient_data',
        sessions_analyzed: summaries.length,
        sessions_needed: minSessions,
        message: `Need at least ${minSessions} sessions before suggesting changes (have ${summaries.length})`,
        suggestions: [],
        summary: [],
        auto_applied: false,
      };
    }

    // Build session interpretations from history + enrichment data
    const interpretations = summaries.map(summary => {
      const telemetryItems = summary.items.map(item => ({
        item_id: item.item_id,
        viewed: item.viewed === 1,
        completed: item.completion_rate != null && item.completion_rate >= 0.9,
        skipped_at_seconds: item.skipped === 1 ? (item.duration_seconds || 0) * 0.1 : undefined,
        liked: item.liked === 1,
        view_duration_seconds: item.completion_rate != null && item.duration_seconds != null
          ? item.completion_rate * item.duration_seconds
          : undefined,
      }));

      const sessionTelemetry = {
        session_id: summary.session_id,
        items: telemetryItems,
        session_completed: summary.session_completed,
        session_satisfaction: summary.satisfaction ?? 0.5,
      };

      return interpretSession(sessionTelemetry, enrichmentMap);
    });

    const proposal = generateProposal({
      currentWeights: profile.weights,
      sessionHistory: interpretations,
      learningRate,
      decayFactor,
      minSessions,
    });

    // Save snapshot
    this.storage.saveLearningSnapshot({
      profile_id: profile.id,
      sessions_analyzed: summaries.length,
      proposal,
      accepted: false,
    });

    return proposal;
  }

  /**
   * Accept a proposal and apply suggested weights to a profile.
   * Returns the updated profile — the caller is responsible for saving it.
   *
   * @param {object} profile - Current profile
   * @param {object} proposal - Proposal from generateAdjustmentProposal
   * @returns {object} Updated profile with new weights
   */
  applyProposal(profile, proposal) {
    if (proposal.status !== 'ready' || !proposal.proposed_weights) {
      return profile;
    }

    return {
      ...profile,
      weights: { ...proposal.proposed_weights },
    };
  }

  /**
   * Get past learning snapshots for a profile.
   *
   * @param {string} profileId
   * @param {number} [limit=10]
   * @returns {object[]}
   */
  getSnapshots(profileId, limit = 10) {
    return this.storage.getLearningSnapshots(profileId, limit);
  }

  /**
   * Analyze engagement trend for a specific category.
   *
   * @param {string} categoryId
   * @param {Map<string, object>} enrichmentMap
   * @param {number} [windowSessions=10]
   * @returns {{ trend: 'improving'|'declining'|'stable', avg_completion: number, sample_size: number }}
   */
  analyzeCategoryTrend(categoryId, enrichmentMap, windowSessions = 10) {
    const summaries = this.history.getEngagementSummaries(windowSessions);
    const completionRates = [];

    for (const summary of summaries) {
      for (const item of summary.items) {
        const envelope = enrichmentMap.get(item.item_id);
        if (!envelope) continue;
        const cats = envelope.enrichment.categories.map(c => c.id);
        if (!cats.includes(categoryId)) continue;
        if (item.completion_rate != null) {
          completionRates.push(item.completion_rate);
        }
      }
    }

    if (completionRates.length < 3) {
      return { trend: 'stable', avg_completion: 0, sample_size: completionRates.length };
    }

    const avg = completionRates.reduce((a, b) => a + b, 0) / completionRates.length;
    const half = Math.floor(completionRates.length / 2);
    const recentAvg = completionRates.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const olderAvg = completionRates.slice(half).reduce((a, b) => a + b, 0) / (completionRates.length - half);

    let trend = 'stable';
    if (recentAvg - olderAvg > 0.1) trend = 'improving';
    else if (olderAvg - recentAvg > 0.1) trend = 'declining';

    return {
      trend,
      avg_completion: Math.round(avg * 1000) / 1000,
      sample_size: completionRates.length,
    };
  }
}
