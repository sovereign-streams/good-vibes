import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Config } from './config.mjs';

export class Storage {
  constructor(dbPath) {
    this.dbPath = dbPath || Config.dbPath;
    this.db = null;
  }

  initialize() {
    mkdirSync(dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        profile_id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        data TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        provider_id TEXT,
        served_at TEXT NOT NULL,
        position INTEGER,
        duration_seconds INTEGER,
        completion_rate REAL,
        viewed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        liked INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_history_item_id ON history (item_id);
      CREATE INDEX IF NOT EXISTS idx_history_session_id ON history (session_id);
      CREATE INDEX IF NOT EXISTS idx_history_served_at ON history (served_at);

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        profile_id TEXT,
        template_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        item_count INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        satisfaction REAL,
        data TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at);

      CREATE TABLE IF NOT EXISTS learning_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sessions_analyzed INTEGER,
        proposal TEXT NOT NULL,
        accepted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_learning_profile ON learning_snapshots (profile_id);

      CREATE TABLE IF NOT EXISTS providers (
        provider_id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        manifest TEXT,
        last_fetched_at TEXT,
        enabled INTEGER DEFAULT 1
      );
    `);
  }

  // -- Profiles --

  saveProfile(profile) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO profiles (profile_id, name, description, data, is_active, created_at, updated_at)
      VALUES (@profile_id, @name, @description, @data, @is_active, @created_at, @updated_at)
    `).run({
      profile_id: profile.id,
      name: profile.name || profile.id,
      description: profile.description || '',
      data: JSON.stringify(profile),
      is_active: profile._active ? 1 : 0,
      created_at: now,
      updated_at: now,
    });
  }

  getProfile(profileId) {
    const row = this.db.prepare('SELECT data FROM profiles WHERE profile_id = ?').get(profileId);
    return row ? JSON.parse(row.data) : null;
  }

  getActiveProfile() {
    const row = this.db.prepare('SELECT data FROM profiles WHERE is_active = 1 LIMIT 1').get();
    return row ? JSON.parse(row.data) : null;
  }

  setActiveProfile(profileId) {
    this.db.prepare('UPDATE profiles SET is_active = 0').run();
    this.db.prepare('UPDATE profiles SET is_active = 1 WHERE profile_id = ?').run(profileId);
  }

  listProfiles() {
    return this.db.prepare('SELECT profile_id, name, description, is_active FROM profiles ORDER BY name').all()
      .map(row => ({
        id: row.profile_id,
        name: row.name,
        description: row.description,
        active: row.is_active === 1,
      }));
  }

  deleteProfile(profileId) {
    return this.db.prepare('DELETE FROM profiles WHERE profile_id = ?').run(profileId).changes > 0;
  }

  // -- History --

  recordServed(entries) {
    const stmt = this.db.prepare(`
      INSERT INTO history (session_id, item_id, provider_id, served_at, position, duration_seconds)
      VALUES (@session_id, @item_id, @provider_id, @served_at, @position, @duration_seconds)
    `);
    const insert = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run({
          session_id: item.session_id,
          item_id: item.item_id,
          provider_id: item.provider_id || null,
          served_at: item.served_at || new Date().toISOString(),
          position: item.position ?? null,
          duration_seconds: item.duration_seconds ?? null,
        });
      }
    });
    insert(entries);
  }

  updateEngagement(sessionId, itemId, engagement) {
    const sets = [];
    const params = { session_id: sessionId, item_id: itemId };

    if (engagement.completion_rate != null) {
      sets.push('completion_rate = @completion_rate');
      params.completion_rate = engagement.completion_rate;
    }
    if (engagement.viewed != null) {
      sets.push('viewed = @viewed');
      params.viewed = engagement.viewed ? 1 : 0;
    }
    if (engagement.skipped != null) {
      sets.push('skipped = @skipped');
      params.skipped = engagement.skipped ? 1 : 0;
    }
    if (engagement.liked != null) {
      sets.push('liked = @liked');
      params.liked = engagement.liked ? 1 : 0;
    }

    if (sets.length === 0) return;

    this.db.prepare(`
      UPDATE history SET ${sets.join(', ')}
      WHERE session_id = @session_id AND item_id = @item_id
    `).run(params);
  }

  getRecentItemIds(windowHours = 24) {
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const rows = this.db.prepare(
      'SELECT DISTINCT item_id FROM history WHERE served_at > ? ORDER BY served_at DESC'
    ).all(cutoff);
    return rows.map(r => r.item_id);
  }

  getItemHistory(itemId) {
    return this.db.prepare(
      'SELECT * FROM history WHERE item_id = ? ORDER BY served_at DESC'
    ).all(itemId);
  }

  getSessionHistory(sessionId) {
    return this.db.prepare(
      'SELECT * FROM history WHERE session_id = ? ORDER BY position ASC'
    ).all(sessionId);
  }

  // -- Sessions --

  saveSession(session) {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (session_id, profile_id, template_id, started_at, ended_at, item_count, completed, satisfaction, data)
      VALUES (@session_id, @profile_id, @template_id, @started_at, @ended_at, @item_count, @completed, @satisfaction, @data)
    `).run({
      session_id: session.session_id,
      profile_id: session.profile_id || null,
      template_id: session.template_id || null,
      started_at: session.started_at || new Date().toISOString(),
      ended_at: session.ended_at || null,
      item_count: session.item_count || 0,
      completed: session.completed ? 1 : 0,
      satisfaction: session.satisfaction ?? null,
      data: session.data ? JSON.stringify(session.data) : null,
    });
  }

  getSession(sessionId) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
    if (!row) return null;
    return {
      ...row,
      completed: row.completed === 1,
      data: row.data ? JSON.parse(row.data) : null,
    };
  }

  getRecentSessions(limit = 20) {
    return this.db.prepare(
      'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?'
    ).all(limit).map(row => ({
      ...row,
      completed: row.completed === 1,
      data: row.data ? JSON.parse(row.data) : null,
    }));
  }

  // -- Learning --

  saveLearningSnapshot(snapshot) {
    this.db.prepare(`
      INSERT INTO learning_snapshots (profile_id, created_at, sessions_analyzed, proposal, accepted)
      VALUES (@profile_id, @created_at, @sessions_analyzed, @proposal, @accepted)
    `).run({
      profile_id: snapshot.profile_id,
      created_at: new Date().toISOString(),
      sessions_analyzed: snapshot.sessions_analyzed || 0,
      proposal: JSON.stringify(snapshot.proposal),
      accepted: snapshot.accepted ? 1 : 0,
    });
  }

  getLearningSnapshots(profileId, limit = 10) {
    return this.db.prepare(
      'SELECT * FROM learning_snapshots WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(profileId, limit).map(row => ({
      ...row,
      proposal: JSON.parse(row.proposal),
      accepted: row.accepted === 1,
    }));
  }

  // -- Providers --

  saveProvider(provider) {
    this.db.prepare(`
      INSERT OR REPLACE INTO providers (provider_id, endpoint, manifest, last_fetched_at, enabled)
      VALUES (@provider_id, @endpoint, @manifest, @last_fetched_at, @enabled)
    `).run({
      provider_id: provider.provider_id,
      endpoint: provider.endpoint,
      manifest: provider.manifest ? JSON.stringify(provider.manifest) : null,
      last_fetched_at: provider.last_fetched_at || null,
      enabled: provider.enabled !== false ? 1 : 0,
    });
  }

  getProvider(providerId) {
    const row = this.db.prepare('SELECT * FROM providers WHERE provider_id = ?').get(providerId);
    if (!row) return null;
    return {
      ...row,
      manifest: row.manifest ? JSON.parse(row.manifest) : null,
      enabled: row.enabled === 1,
    };
  }

  listProviders(enabledOnly = false) {
    const sql = enabledOnly
      ? 'SELECT * FROM providers WHERE enabled = 1 ORDER BY provider_id'
      : 'SELECT * FROM providers ORDER BY provider_id';
    return this.db.prepare(sql).all().map(row => ({
      ...row,
      manifest: row.manifest ? JSON.parse(row.manifest) : null,
      enabled: row.enabled === 1,
    }));
  }

  // -- Cleanup --

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
