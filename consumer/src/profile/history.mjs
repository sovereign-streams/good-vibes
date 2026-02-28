/**
 * History — Local-only session history tracking.
 *
 * Tracks what content was served, when, completion rates,
 * and recency. All data stays local — never sent to providers.
 */

export class History {
  /**
   * @param {import('../lib/storage.mjs').Storage} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Record items served in a session.
   *
   * @param {string} sessionId
   * @param {object[]} items - Array of { item_id, provider_id, position, duration_seconds }
   */
  recordServed(sessionId, items) {
    const now = new Date().toISOString();
    const entries = items.map((item, i) => ({
      session_id: sessionId,
      item_id: item.item_id,
      provider_id: item.provider_id || null,
      served_at: now,
      position: item.position ?? i,
      duration_seconds: item.duration_seconds ?? item.source?.duration_seconds ?? null,
    }));
    this.storage.recordServed(entries);
  }

  /**
   * Record engagement signals for a served item.
   *
   * @param {string} sessionId
   * @param {string} itemId
   * @param {object} engagement - { completion_rate, viewed, skipped, liked }
   */
  recordEngagement(sessionId, itemId, engagement) {
    this.storage.updateEngagement(sessionId, itemId, engagement);
  }

  /**
   * Save a session record.
   *
   * @param {object} session
   */
  saveSession(session) {
    this.storage.saveSession(session);
  }

  /**
   * Complete a session with final stats.
   *
   * @param {string} sessionId
   * @param {object} stats - { completed, satisfaction }
   */
  completeSession(sessionId, stats) {
    const existing = this.storage.getSession(sessionId);
    if (!existing) return;
    this.storage.saveSession({
      ...existing,
      ended_at: new Date().toISOString(),
      completed: stats.completed ?? false,
      satisfaction: stats.satisfaction ?? null,
    });
  }

  /**
   * Get item IDs served within the recency window to avoid re-serving.
   *
   * @param {number} [windowHours=24]
   * @returns {string[]} Array of item_id strings
   */
  getRecentItemIds(windowHours = 24) {
    return this.storage.getRecentItemIds(windowHours);
  }

  /**
   * Get how many times an item has been served.
   *
   * @param {string} itemId
   * @returns {number}
   */
  getServedCount(itemId) {
    return this.storage.getItemHistory(itemId).length;
  }

  /**
   * Get average completion rate for an item across all servings.
   *
   * @param {string} itemId
   * @returns {number|null}
   */
  getAverageCompletion(itemId) {
    const rows = this.storage.getItemHistory(itemId);
    const withCompletion = rows.filter(r => r.completion_rate != null);
    if (withCompletion.length === 0) return null;
    return withCompletion.reduce((sum, r) => sum + r.completion_rate, 0) / withCompletion.length;
  }

  /**
   * Get recent sessions.
   *
   * @param {number} [limit=20]
   * @returns {object[]}
   */
  getRecentSessions(limit = 20) {
    return this.storage.getRecentSessions(limit);
  }

  /**
   * Get session details including item history.
   *
   * @param {string} sessionId
   * @returns {object|null}
   */
  getSessionDetails(sessionId) {
    const session = this.storage.getSession(sessionId);
    if (!session) return null;
    const items = this.storage.getSessionHistory(sessionId);
    return { ...session, items };
  }

  /**
   * Build engagement stats for learning analysis.
   * Returns per-session summaries with category-level completion rates.
   *
   * @param {number} [limit=20] - Number of recent sessions to analyze
   * @returns {object[]}
   */
  getEngagementSummaries(limit = 20) {
    const sessions = this.storage.getRecentSessions(limit);
    return sessions.map(session => {
      const items = this.storage.getSessionHistory(session.session_id);
      const viewed = items.filter(i => i.viewed === 1);
      const completed = items.filter(i => i.completion_rate != null && i.completion_rate >= 0.9);
      const skipped = items.filter(i => i.skipped === 1);
      return {
        session_id: session.session_id,
        started_at: session.started_at,
        session_completed: session.completed,
        satisfaction: session.satisfaction,
        total_items: items.length,
        viewed_count: viewed.length,
        completed_count: completed.length,
        skipped_count: skipped.length,
        items,
      };
    });
  }
}
