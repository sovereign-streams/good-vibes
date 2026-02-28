/**
 * PAE Bridge — Connects the HTTP API layer to the PAE engine.
 *
 * Manages PAE lifecycle, active sessions (in-memory),
 * provider registration, and engagement forwarding.
 */

import { PAE } from '../../consumer/src/pae.mjs';
import { ShellConfig } from './lib/config.mjs';

export class PAEBridge {
  constructor() {
    this.pae = new PAE({
      dbPath: ShellConfig.dbPath,
      profilesDir: ShellConfig.profilesDir,
    });

    /** @type {Map<string, object>} Active sessions keyed by session_id */
    this._sessions = new Map();

    /** @type {Map<string, object>} Cached composed results keyed by session_id */
    this._composed = new Map();

    /** @type {Map<string, object>} Cached provider manifests keyed by endpoint */
    this._manifests = new Map();

    this._ready = false;
  }

  async initialize() {
    await this.pae.initialize();

    // Register the default provider if none exist
    const providers = this.pae.storage.listProviders();
    if (providers.length === 0) {
      try {
        this.pae.addProvider(ShellConfig.providerUrl);
      } catch {
        // Provider may not be running yet — that's fine
      }
    } else {
      // Re-register existing providers with the MultiSource client
      for (const p of providers) {
        if (p.enabled) {
          try {
            this.pae.multiSource.addProvider(p.endpoint);
          } catch {
            // skip unreachable providers
          }
        }
      }
    }

    // Ensure an active profile is set
    const active = this.pae.storage.getActiveProfile();
    if (!active) {
      const profiles = this.pae.storage.listProfiles();
      const defaultProfile = profiles.find(p => p.id === 'good-vibes-default') || profiles[0];
      if (defaultProfile) {
        this.pae.storage.setActiveProfile(defaultProfile.id);
      }
    }

    this._ready = true;
  }

  // ── Profiles ──────────────────────────────────────────────

  listProfiles() {
    return this.pae.listProfiles();
  }

  getProfile(id) {
    return this.pae.getProfile(id);
  }

  saveProfile(profile) {
    // Check if this profile is currently the active one
    const activeProfile = this.pae.storage.getActiveProfile();
    const wasActive = activeProfile?.id === profile.id;

    this.pae.saveProfile(profile);

    // Restore active flag (saveProfile resets is_active via INSERT OR REPLACE)
    if (wasActive) {
      this.pae.setActiveProfile(profile.id);
    }

    return this.pae.getProfile(profile.id);
  }

  createProfile(profile) {
    if (!profile.id) {
      profile.id = profile.name
        ? profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : `profile-${Date.now()}`;
    }
    this.pae.saveProfile(profile);
    return this.pae.getProfile(profile.id);
  }

  // ── Sessions ──────────────────────────────────────────────

  createSession(options = {}) {
    // Accept 'profile' as alias for 'profileId'
    if (options.profile && !options.profileId) {
      options.profileId = options.profile;
    }
    const session = this.pae.createSession(options);
    this._sessions.set(session.session_id, session);
    return {
      session_id: session.session_id,
      profile_id: session.profile.id,
      created_at: session.created_at,
    };
  }

  getSession(sessionId) {
    const details = this.pae.history.getSessionDetails(sessionId);
    if (!details) return null;

    const composed = this._composed.get(sessionId) || null;
    return { ...details, composed };
  }

  async requestContent(sessionId, overrides = {}) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`No active session: ${sessionId}`);

    const result = await this.pae.requestContent(session, overrides);
    if (result.composed) {
      this._composed.set(sessionId, result.composed);
    }
    return result;
  }

  reportEngagement(sessionId, signals) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`No active session: ${sessionId}`);
    return this.pae.reportEngagement(session, signals);
  }

  /**
   * Get the next suggested item from the composed session.
   * Walks the composed arc in order, skipping already-viewed items.
   */
  getNextItem(sessionId) {
    const composed = this._composed.get(sessionId);
    if (!composed) return { item: null, remaining: 0 };

    const sessionDetails = this.pae.history.getSessionDetails(sessionId);
    const viewedIds = new Set(
      (sessionDetails?.items || [])
        .filter(i => i.viewed === 1 || (i.completion_rate != null && i.completion_rate > 0))
        .map(i => i.item_id)
    );

    const remaining = composed.items.filter(i => !viewedIds.has(i.item_id));
    return {
      item: remaining[0] || null,
      remaining: remaining.length,
      total: composed.items.length,
    };
  }

  skipItem(sessionId, itemId) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`No active session: ${sessionId}`);

    // Find item to skip: either specified or next in line
    const target = itemId || this.getNextItem(sessionId).item?.item_id;
    if (!target) return { skipped: false, reason: 'no_items' };

    this.pae.reportEngagement(session, {
      items: [{ item_id: target, skipped: true, completion_rate: 0 }],
    });

    return { skipped: true, item_id: target, next: this.getNextItem(sessionId) };
  }

  completeSession(sessionId, satisfaction) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`No active session: ${sessionId}`);

    this.pae.reportEngagement(session, {
      session_completed: true,
      satisfaction: satisfaction ?? undefined,
      items: [],
    });

    // Clean up in-memory session data
    this._sessions.delete(sessionId);
    this._composed.delete(sessionId);

    return { completed: true, session_id: sessionId };
  }

  // ── History ───────────────────────────────────────────────

  getHistory(limit = 20) {
    return this.pae.history.getRecentSessions(limit);
  }

  // ── Learning ──────────────────────────────────────────────

  getSuggestions() {
    // suggestAdjustments needs an enrichment map; without enrichment data
    // we return a minimal proposal based on engagement signals alone
    return this.pae.suggestAdjustments(new Map());
  }

  applySuggestion(proposal) {
    return this.pae.acceptAdjustments(proposal);
  }

  // ── Providers ─────────────────────────────────────────────

  listProviders() {
    return this.pae.storage.listProviders();
  }

  addProvider(endpoint) {
    this.pae.addProvider(endpoint);
    return this.pae.storage.getProvider(endpoint);
  }

  removeProvider(endpoint) {
    this.pae.removeProvider(endpoint);
    // Also remove from storage
    this.pae.storage.db.prepare('DELETE FROM providers WHERE provider_id = ?').run(endpoint);
    return { removed: true };
  }

  // ── Stats ─────────────────────────────────────────────────

  getStats() {
    const sessions = this.pae.history.getRecentSessions(100);
    const summaries = this.pae.history.getEngagementSummaries(100);

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.completed).length;
    const avgSatisfaction = sessions
      .filter(s => s.satisfaction != null)
      .reduce((acc, s, _, arr) => acc + s.satisfaction / arr.length, 0);

    let totalItems = 0;
    let viewedItems = 0;
    let skippedItems = 0;
    let totalCompletion = 0;
    let completionCount = 0;

    for (const s of summaries) {
      totalItems += s.total_items;
      viewedItems += s.viewed_count;
      skippedItems += s.skipped_count;
      for (const item of s.items) {
        if (item.completion_rate != null) {
          totalCompletion += item.completion_rate;
          completionCount++;
        }
      }
    }

    return {
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      completion_rate: totalSessions > 0 ? completedSessions / totalSessions : 0,
      avg_satisfaction: Math.round(avgSatisfaction * 1000) / 1000,
      total_items_served: totalItems,
      items_viewed: viewedItems,
      items_skipped: skippedItems,
      avg_item_completion: completionCount > 0
        ? Math.round((totalCompletion / completionCount) * 1000) / 1000
        : 0,
      active_sessions: this._sessions.size,
      providers: this.pae.storage.listProviders().length,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────

  close() {
    this._sessions.clear();
    this._composed.clear();
    this._manifests.clear();
    this.pae.close();
    this._ready = false;
  }
}
