/**
 * PAE — Personal Algorithm Engine
 *
 * Main orchestrator. Coordinates profiles, SEP client, session composition,
 * history tracking, and preference learning.
 *
 * Local-first: all user data stays on the user's machine.
 */

import { randomUUID } from 'node:crypto';
import { Storage } from './lib/storage.mjs';
import { Config } from './lib/config.mjs';
import {
  normalizeProfile, mergeOverrides, buildIntent,
  applyTimeOfDayEnergy, loadDefaultProfiles,
} from './profile/preferences.mjs';
import { History } from './profile/history.mjs';
import { Learning } from './profile/learning.mjs';
import { MultiSource } from './sep-client/multi-source.mjs';
import { buildSession, mergePayloads } from './composer/session-builder.mjs';

export class PAE {
  /**
   * @param {object} [options]
   * @param {string} [options.dbPath] - SQLite database path
   * @param {string} [options.profilesDir] - Default profiles directory
   */
  constructor(options = {}) {
    this.storage = new Storage(options.dbPath || Config.dbPath);
    this.history = null;
    this.learning = null;
    this.multiSource = new MultiSource({
      timeoutMs: Config.requestTimeoutMs,
      maxRetries: Config.maxRetries,
    });
    this._initialized = false;
    this._profilesDir = options.profilesDir;
  }

  /**
   * Initialize the PAE: open storage, load default profiles if needed.
   */
  async initialize() {
    this.storage.initialize();
    this.history = new History(this.storage);
    this.learning = new Learning(this.storage, this.history);

    // Load default profiles if no profiles exist
    const existing = this.storage.listProfiles();
    if (existing.length === 0) {
      try {
        const defaults = loadDefaultProfiles(this._profilesDir);
        for (const profile of defaults) {
          this.storage.saveProfile(profile);
        }
        // Set the Good Vibes default as active
        const defaultId = Config.defaultProfileId;
        const hasDefault = defaults.some(p => p.id === defaultId);
        if (hasDefault) {
          this.storage.setActiveProfile(defaultId);
        } else if (defaults.length > 0) {
          this.storage.setActiveProfile(defaults[0].id);
        }
      } catch {
        // Default profiles may not be available in test environments
      }
    }

    this._initialized = true;
  }

  /**
   * Create a new session from the active profile (or a specified profile).
   *
   * @param {object} [options]
   * @param {string} [options.profileId] - Use a specific profile instead of active
   * @param {object} [options.overrides] - Profile overrides for this session
   * @param {string} [options.timeOfDay] - Override time of day
   * @returns {object} Session object with id, profile, and intent
   */
  createSession(options = {}) {
    this._ensureInitialized();

    let profile;
    if (options.profileId) {
      profile = this.storage.getProfile(options.profileId);
      if (!profile) throw new Error(`Profile not found: ${options.profileId}`);
    } else {
      profile = this.storage.getActiveProfile();
      if (!profile) throw new Error('No active profile set');
    }

    profile = normalizeProfile(profile);

    // Apply overrides
    if (options.overrides) {
      profile = mergeOverrides(profile, options.overrides);
    }

    // Apply time-of-day energy adjustments
    profile = applyTimeOfDayEnergy(profile, options.timeOfDay);

    const sessionId = randomUUID();
    const intent = buildIntent(profile, {
      time_of_day: options.timeOfDay,
      session_number_today: options.sessionNumber || 1,
      session_type: options.sessionType || 'composed',
      disclosure_level: Config.disclosureLevel,
      telemetry_opt_in: Config.telemetryOptIn,
    });

    // Track recent items to avoid re-serving
    const recentItemIds = this.history.getRecentItemIds(Config.recencyWindowHours);

    const session = {
      session_id: sessionId,
      profile,
      intent,
      recent_item_ids: recentItemIds,
      state_tokens: {},
      created_at: new Date().toISOString(),
    };

    // Save session record
    this.history.saveSession({
      session_id: sessionId,
      profile_id: profile.id,
      template_id: profile.preferred_arc_template,
      started_at: session.created_at,
      item_count: 0,
    });

    return session;
  }

  /**
   * Request content from providers and compose a session arc.
   *
   * @param {object} session - Session from createSession()
   * @param {object} [overrides] - Override intent parameters
   * @returns {object} Composed session with items
   */
  async requestContent(session, overrides = {}) {
    this._ensureInitialized();

    const intent = { ...session.intent };

    // Apply any intent overrides
    if (overrides.target_duration_minutes) {
      intent.intent.target_duration_minutes = overrides.target_duration_minutes;
    }
    if (overrides.weights) {
      intent.intent.weights = { ...intent.intent.weights, ...overrides.weights };
    }
    if (overrides.session_type) {
      intent.intent.session_type = overrides.session_type;
    }

    // Inject state tokens from prior rounds
    if (session.state_tokens) {
      const tokens = Object.values(session.state_tokens).filter(Boolean);
      if (tokens.length > 0) {
        intent.intent.context.state_token = tokens[0];
      }
    }

    // Query providers
    const result = await this.multiSource.queryAll(intent);

    if (result.all_failed || (result.providers.length === 0 && result.items.length === 0)) {
      return {
        session_id: session.session_id,
        status: 'no_providers',
        errors: result.errors,
        items: [],
        composed: null,
      };
    }

    // Filter out recently served items
    let items = result.items;
    if (session.recent_item_ids?.length > 0) {
      const recentSet = new Set(session.recent_item_ids);
      items = items.filter(i => !recentSet.has(i.item_id));
    }

    // Compose session arc
    const composed = buildSession({
      items,
      profile: session.profile,
      template_override: overrides.template,
    });

    // Record served items in history
    if (composed.items.length > 0) {
      this.history.recordServed(
        session.session_id,
        composed.items.map(item => ({
          item_id: item.item_id,
          provider_id: result.providers?.[0]?.endpoint,
          position: item.position,
          duration_seconds: item.source?.duration_seconds,
        }))
      );
    }

    // Update session record
    this.history.saveSession({
      session_id: session.session_id,
      profile_id: session.profile.id,
      template_id: composed.template_id,
      started_at: session.created_at,
      item_count: composed.item_count,
      data: {
        flow_score: composed.flow_score,
        partial_fill: composed.partial_fill,
        provider_count: result.providers.length,
        errors: result.errors,
      },
    });

    // Save state tokens for next round
    for (const pr of result.providers) {
      if (pr.state_token) {
        session.state_tokens[pr.endpoint] = pr.state_token;
      }
    }

    return {
      session_id: session.session_id,
      status: result.partial ? 'partial' : 'ok',
      errors: result.errors,
      items,
      composed,
      providers: result.providers,
    };
  }

  /**
   * Report engagement signals for a session.
   *
   * @param {object} session - Session from createSession()
   * @param {object} signals - Engagement signals
   * @param {Array<{ item_id: string, viewed?: boolean, completion_rate?: number, skipped?: boolean, liked?: boolean }>} signals.items
   * @param {boolean} [signals.session_completed]
   * @param {number} [signals.satisfaction] - 0-1
   * @returns {object} Updated preference snapshot
   */
  reportEngagement(session, signals) {
    this._ensureInitialized();

    // Record per-item engagement
    if (signals.items) {
      for (const item of signals.items) {
        this.history.recordEngagement(session.session_id, item.item_id, {
          viewed: item.viewed,
          completion_rate: item.completion_rate,
          skipped: item.skipped,
          liked: item.liked,
        });
      }
    }

    // Complete the session
    this.history.completeSession(session.session_id, {
      completed: signals.session_completed ?? false,
      satisfaction: signals.satisfaction,
    });

    return {
      session_id: session.session_id,
      recorded: true,
      items_updated: signals.items?.length || 0,
    };
  }

  /**
   * Add a provider endpoint.
   *
   * @param {string} endpoint - Provider base URL
   * @param {object} [options] - Client options
   */
  addProvider(endpoint, options = {}) {
    this._ensureInitialized();
    this.multiSource.addProvider(endpoint, options);
    this.storage.saveProvider({
      provider_id: endpoint,
      endpoint,
      enabled: true,
    });
  }

  /**
   * Remove a provider endpoint.
   *
   * @param {string} endpoint
   */
  removeProvider(endpoint) {
    this.multiSource.removeProvider(endpoint);
  }

  /**
   * Get or create a profile.
   *
   * @param {string} profileId
   * @returns {object|null}
   */
  getProfile(profileId) {
    this._ensureInitialized();
    return this.storage.getProfile(profileId);
  }

  /**
   * Save a profile.
   *
   * @param {object} profile
   */
  saveProfile(profile) {
    this._ensureInitialized();
    const normalized = normalizeProfile(profile);
    this.storage.saveProfile(normalized);
  }

  /**
   * Set the active profile.
   *
   * @param {string} profileId
   */
  setActiveProfile(profileId) {
    this._ensureInitialized();
    this.storage.setActiveProfile(profileId);
  }

  /**
   * List all profiles.
   *
   * @returns {object[]}
   */
  listProfiles() {
    this._ensureInitialized();
    return this.storage.listProfiles();
  }

  /**
   * Generate a learning proposal for the active profile.
   *
   * @param {Map<string, object>} enrichmentMap - Map of item_id to enrichment envelope
   * @param {object} [options]
   * @returns {object} Proposal (never auto-applied)
   */
  suggestAdjustments(enrichmentMap, options = {}) {
    this._ensureInitialized();
    const profile = this.storage.getActiveProfile();
    if (!profile) throw new Error('No active profile');
    return this.learning.generateAdjustmentProposal(
      normalizeProfile(profile),
      enrichmentMap,
      options,
    );
  }

  /**
   * Accept and apply a learning proposal.
   *
   * @param {object} proposal - Proposal from suggestAdjustments()
   * @returns {object} Updated profile
   */
  acceptAdjustments(proposal) {
    this._ensureInitialized();
    const profile = this.storage.getActiveProfile();
    if (!profile) throw new Error('No active profile');

    const updated = this.learning.applyProposal(normalizeProfile(profile), proposal);
    this.storage.saveProfile(updated);
    return updated;
  }

  /**
   * Shutdown: close storage.
   */
  close() {
    if (this.storage) {
      this.storage.close();
    }
    this._initialized = false;
  }

  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('PAE not initialized. Call initialize() first.');
    }
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const pae = new PAE();
  await pae.initialize();
  console.log('PAE initialized');
  console.log('Profiles:', pae.listProfiles());
  pae.close();
}
