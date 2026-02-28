export class BaseSource {
  constructor(config) {
    this.config = config;
  }

  async search(query, maxResults) {
    throw new Error('Not implemented');
  }

  async getDetails(ids) {
    throw new Error('Not implemented');
  }

  get name() {
    throw new Error('Not implemented');
  }
}
