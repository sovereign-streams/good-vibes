import { randomUUID } from 'node:crypto';

/**
 * StateManager — Manages stateful SEP sessions.
 *
 * State tokens are opaque strings the consumer can pass back on subsequent
 * requests to enable multi-round exchanges without the provider building
 * user profiles. The state captures what was already served so the provider
 * can avoid repeating items and can continue arc composition.
 */
export class StateManager {
  constructor({ ttlMs = 30 * 60 * 1000 } = {}) {
    /** @type {Map<string, { data: SessionState, expiresAt: number }>} */
    this._sessions = new Map();
    this._ttlMs = ttlMs;
  }

  /**
   * Create a new session and return its token.
   * @param {{ servedItemIds: string[], arcPositions: string[], weights: object }} seed
   * @returns {string} opaque state token
   */
  create(seed = {}) {
    this._evictExpired();
    const token = randomUUID();
    this._sessions.set(token, {
      data: {
        servedItemIds: new Set(seed.servedItemIds || []),
        arcHistory: seed.arcPositions || [],
        weights: seed.weights || {},
        roundNumber: 1,
        createdAt: Date.now()
      },
      expiresAt: Date.now() + this._ttlMs
    });
    return token;
  }

  /**
   * Retrieve session state for a token. Returns null if expired / unknown.
   * @param {string} token
   * @returns {SessionState | null}
   */
  get(token) {
    if (!token) return null;
    this._evictExpired();
    const entry = this._sessions.get(token);
    if (!entry) return null;
    // Touch — extend TTL on access
    entry.expiresAt = Date.now() + this._ttlMs;
    return entry.data;
  }

  /**
   * Record items that were just served in this round, advance round counter,
   * and return a (possibly new) token for the next round.
   * @param {string} token  current token (may be null for first round)
   * @param {{ servedItemIds: string[], arcPositions: string[], weights: object }} round
   * @returns {string} token for next round
   */
  advance(token, round) {
    let state = this.get(token);

    if (!state) {
      // First round — create fresh session
      return this.create(round);
    }

    // Merge served items
    for (const id of (round.servedItemIds || [])) {
      state.servedItemIds.add(id);
    }
    state.arcHistory.push(...(round.arcPositions || []));
    state.roundNumber += 1;

    // Refresh entry TTL
    const entry = this._sessions.get(token);
    if (entry) entry.expiresAt = Date.now() + this._ttlMs;

    return token;
  }

  /**
   * Get set of item IDs already served in this session.
   * @param {string} token
   * @returns {Set<string>}
   */
  getServedIds(token) {
    const state = this.get(token);
    return state ? state.servedItemIds : new Set();
  }

  /**
   * Remove expired sessions.
   */
  _evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this._sessions) {
      if (entry.expiresAt <= now) {
        this._sessions.delete(key);
      }
    }
  }

  /**
   * Number of active sessions (for monitoring).
   */
  get size() {
    this._evictExpired();
    return this._sessions.size;
  }
}
