import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Config } from '../../lib/config.mjs';

export class SQLiteAdapter {
  constructor(dbPath) {
    this.dbPath = dbPath || Config.dbPath;
    this.db = null;
  }

  async initialize() {
    try {
      // Ensure the data directory exists
      mkdirSync(dirname(this.dbPath), { recursive: true });

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS items (
          item_id TEXT PRIMARY KEY,
          sep_version TEXT,
          platform TEXT,
          origin_url TEXT,
          origin_id TEXT,
          content_type TEXT,
          duration_seconds INTEGER,
          title TEXT,
          creator TEXT,
          published TEXT,
          original_tags TEXT,
          language TEXT,
          thumbnail_url TEXT,
          enrichment TEXT,
          provider_id TEXT,
          guardrail_pass INTEGER,
          guardrail_version TEXT,
          created_at TEXT,
          updated_at TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_origin
          ON items (platform, origin_id);

        CREATE INDEX IF NOT EXISTS idx_content_type
          ON items (content_type);

        CREATE INDEX IF NOT EXISTS idx_guardrail_pass
          ON items (guardrail_pass);

        CREATE INDEX IF NOT EXISTS idx_created_at
          ON items (created_at);
      `);

      // FTS5 virtual table for full-text search on title
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS items_fts
          USING fts5(title, content=items, content_rowid=rowid);
      `);

      // Triggers to keep FTS index in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
          INSERT INTO items_fts(rowid, title) VALUES (new.rowid, new.title);
        END;

        CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
          INSERT INTO items_fts(items_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
        END;

        CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
          INSERT INTO items_fts(items_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
          INSERT INTO items_fts(rowid, title) VALUES (new.rowid, new.title);
        END;
      `);
    } catch (err) {
      throw new Error(`Failed to initialize SQLite database: ${err.message}`);
    }
  }

  async put(item) {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO items (
          item_id, sep_version, platform, origin_url, origin_id,
          content_type, duration_seconds, title, creator, published,
          original_tags, language, thumbnail_url, enrichment,
          provider_id, guardrail_pass, guardrail_version,
          created_at, updated_at
        ) VALUES (
          @item_id, @sep_version, @platform, @origin_url, @origin_id,
          @content_type, @duration_seconds, @title, @creator, @published,
          @original_tags, @language, @thumbnail_url, @enrichment,
          @provider_id, @guardrail_pass, @guardrail_version,
          @created_at, @updated_at
        )
      `);

      stmt.run({
        item_id: item.item_id,
        sep_version: item.sep_version,
        platform: item.source.platform,
        origin_url: item.source.origin_url,
        origin_id: item.source.origin_id,
        content_type: item.source.content_type,
        duration_seconds: item.source.duration_seconds,
        title: item.meta.title,
        creator: item.meta.creator,
        published: item.meta.published,
        original_tags: JSON.stringify(item.meta.original_tags),
        language: item.meta.language,
        thumbnail_url: item.meta.thumbnail_url,
        enrichment: JSON.stringify(item.enrichment),
        provider_id: item.provider.id,
        guardrail_pass: item.provider.guardrail_pass ? 1 : 0,
        guardrail_version: item.provider.guardrail_version,
        created_at: now,
        updated_at: now
      });

      return item.item_id;
    } catch (err) {
      throw new Error(`Failed to put item ${item.item_id}: ${err.message}`);
    }
  }

  async get(itemId) {
    try {
      const row = this.db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      return row ? this._deserializeRow(row) : null;
    } catch (err) {
      throw new Error(`Failed to get item ${itemId}: ${err.message}`);
    }
  }

  async getByOriginId(platform, originId) {
    try {
      const row = this.db.prepare(
        'SELECT * FROM items WHERE platform = ? AND origin_id = ?'
      ).get(platform, originId);
      return row ? this._deserializeRow(row) : null;
    } catch (err) {
      throw new Error(`Failed to get item by origin ${platform}/${originId}: ${err.message}`);
    }
  }

  async query(filters = {}) {
    try {
      const {
        categories,
        minScore,
        guardrailPass,
        contentType,
        language,
        sessionFit,
        limit = 50,
        offset = 0
      } = filters;

      const conditions = [];
      const params = {};

      if (guardrailPass !== undefined) {
        conditions.push('guardrail_pass = @guardrailPass');
        params.guardrailPass = guardrailPass ? 1 : 0;
      }

      if (contentType) {
        conditions.push('content_type = @contentType');
        params.contentType = contentType;
      }

      if (language) {
        conditions.push('language = @language');
        params.language = language;
      }

      const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      const rows = this.db.prepare(`
        SELECT * FROM items ${whereClause}
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
      `).all({ ...params, limit, offset });

      let results = rows.map(row => this._deserializeRow(row));

      // Post-query filtering for fields stored in JSON
      if (categories && categories.length > 0) {
        results = results.filter(item => {
          const itemCats = (item.enrichment.categories || []).map(c => c.id);
          return categories.some(cat => itemCats.includes(cat));
        });
      }

      if (minScore && typeof minScore === 'object') {
        results = results.filter(item => {
          return Object.entries(minScore).every(([dimension, threshold]) => {
            return (item.enrichment[dimension] || 0) >= threshold;
          });
        });
      }

      if (sessionFit) {
        results = results.filter(item => {
          const fit = item.enrichment.session_fit;
          return fit && fit[sessionFit] === true;
        });
      }

      return results;
    } catch (err) {
      throw new Error(`Failed to query items: ${err.message}`);
    }
  }

  async update(itemId, updates) {
    try {
      const existing = this.db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      if (!existing) {
        throw new Error(`Item not found: ${itemId}`);
      }

      const setClauses = [];
      const params = { item_id: itemId };

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'enrichment') {
          setClauses.push('enrichment = @enrichment');
          params.enrichment = JSON.stringify(value);
        } else if (key === 'original_tags') {
          setClauses.push('original_tags = @original_tags');
          params.original_tags = JSON.stringify(value);
        } else if (key === 'guardrail_pass') {
          setClauses.push('guardrail_pass = @guardrail_pass');
          params.guardrail_pass = value ? 1 : 0;
        } else {
          setClauses.push(`${key} = @${key}`);
          params[key] = value;
        }
      }

      setClauses.push('updated_at = @updated_at');
      params.updated_at = new Date().toISOString();

      this.db.prepare(`
        UPDATE items SET ${setClauses.join(', ')} WHERE item_id = @item_id
      `).run(params);

      return itemId;
    } catch (err) {
      throw new Error(`Failed to update item ${itemId}: ${err.message}`);
    }
  }

  async delete(itemId) {
    try {
      const result = this.db.prepare('DELETE FROM items WHERE item_id = ?').run(itemId);
      return result.changes > 0;
    } catch (err) {
      throw new Error(`Failed to delete item ${itemId}: ${err.message}`);
    }
  }

  async stats() {
    try {
      const totalItems = this.db.prepare('SELECT COUNT(*) as count FROM items').get().count;

      // Count by content type
      const byContentTypeRows = this.db.prepare(
        'SELECT content_type, COUNT(*) as count FROM items GROUP BY content_type'
      ).all();
      const byContentType = {};
      for (const row of byContentTypeRows) {
        byContentType[row.content_type] = row.count;
      }

      // Guardrail pass rate
      const passCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM items WHERE guardrail_pass = 1'
      ).get().count;
      const guardrailPassRate = totalItems > 0 ? passCount / totalItems : 0;

      // Schema versions
      const allItems = this.db.prepare('SELECT enrichment FROM items').all();
      const versionCounts = {};
      const categoryCounter = {};
      const scoreSums = {
        energy_level: 0,
        cognitive_load: 0,
        motivation_score: 0,
        humor_score: 0,
        skill_transfer_score: 0,
        production_quality: 0
      };
      let scoredCount = 0;

      for (const row of allItems) {
        try {
          const enrichment = JSON.parse(row.enrichment);

          // Schema versions
          const sv = enrichment.schema_version || 'unknown';
          versionCounts[sv] = (versionCounts[sv] || 0) + 1;

          // Categories
          if (enrichment.categories) {
            for (const cat of enrichment.categories) {
              categoryCounter[cat.id] = (categoryCounter[cat.id] || 0) + 1;
            }
          }

          // Scores
          for (const dim of Object.keys(scoreSums)) {
            if (typeof enrichment[dim] === 'number') {
              scoreSums[dim] += enrichment[dim];
            }
          }
          scoredCount++;
        } catch {
          // Skip unparseable enrichment
        }
      }

      const avgScores = {};
      if (scoredCount > 0) {
        for (const [dim, sum] of Object.entries(scoreSums)) {
          avgScores[dim] = Math.round((sum / scoredCount) * 1000) / 1000;
        }
      }

      return {
        totalItems,
        byCategory: categoryCounter,
        byContentType,
        avgScores,
        guardrailPassRate: Math.round(guardrailPassRate * 1000) / 1000,
        schemaVersions: versionCounts
      };
    } catch (err) {
      throw new Error(`Failed to compute stats: ${err.message}`);
    }
  }

  async getAll({ limit = 100, offset = 0, minSchemaVersion } = {}) {
    try {
      const rows = this.db.prepare(
        'SELECT * FROM items ORDER BY created_at DESC LIMIT @limit OFFSET @offset'
      ).all({ limit, offset });

      let results = rows.map(row => this._deserializeRow(row));

      if (minSchemaVersion) {
        results = results.filter(item => {
          const sv = item.enrichment.schema_version || '0.0.0';
          return this._compareVersions(sv, minSchemaVersion) >= 0;
        });
      }

      return results;
    } catch (err) {
      throw new Error(`Failed to getAll items: ${err.message}`);
    }
  }

  async search(text, limit = 20) {
    try {
      const rows = this.db.prepare(`
        SELECT items.* FROM items_fts
        JOIN items ON items.rowid = items_fts.rowid
        WHERE items_fts MATCH @text
        LIMIT @limit
      `).all({ text, limit });

      return rows.map(row => this._deserializeRow(row));
    } catch (err) {
      throw new Error(`Failed to search items: ${err.message}`);
    }
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Deserialize a database row back into a full SEP envelope.
   */
  _deserializeRow(row) {
    let enrichment;
    try {
      enrichment = JSON.parse(row.enrichment);
    } catch {
      enrichment = {};
    }

    let originalTags;
    try {
      originalTags = JSON.parse(row.original_tags);
    } catch {
      originalTags = [];
    }

    return {
      sep_version: row.sep_version,
      item_id: row.item_id,
      source: {
        platform: row.platform,
        origin_url: row.origin_url,
        origin_id: row.origin_id,
        content_type: row.content_type,
        duration_seconds: row.duration_seconds
      },
      meta: {
        title: row.title,
        creator: row.creator,
        published: row.published,
        original_tags: originalTags,
        language: row.language,
        thumbnail_url: row.thumbnail_url
      },
      enrichment,
      provider: {
        id: row.provider_id,
        guardrail_pass: row.guardrail_pass === 1,
        guardrail_version: row.guardrail_version
      }
    };
  }

  /**
   * Compare two semver strings. Returns -1, 0, or 1.
   */
  _compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
}
