export class IndexStore {
  constructor(adapter) {
    this.adapter = adapter;
  }

  async initialize() {
    return this.adapter.initialize();
  }

  async put(item) {
    return this.adapter.put(item);
  }

  async get(itemId) {
    return this.adapter.get(itemId);
  }

  async getByOriginId(platform, originId) {
    return this.adapter.getByOriginId(platform, originId);
  }

  async query(filters) {
    return this.adapter.query(filters);
  }

  async update(itemId, updates) {
    return this.adapter.update(itemId, updates);
  }

  async delete(itemId) {
    return this.adapter.delete(itemId);
  }

  async stats() {
    return this.adapter.stats();
  }

  async getAll({ limit, offset, minSchemaVersion }) {
    return this.adapter.getAll({ limit, offset, minSchemaVersion });
  }

  async close() {
    return this.adapter.close();
  }
}
