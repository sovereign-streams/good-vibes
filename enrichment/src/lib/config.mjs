export class Config {
  static get(key, defaultValue = undefined) {
    const value = process.env[key];
    if (value === undefined && defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value ?? defaultValue;
  }

  static getInt(key, defaultValue) {
    return parseInt(Config.get(key, String(defaultValue)), 10);
  }

  static getBool(key, defaultValue) {
    const v = Config.get(key, String(defaultValue));
    return v === 'true' || v === '1';
  }

  static get anthropicApiKey() { return Config.get('ANTHROPIC_API_KEY', ''); }
  static get youtubeApiKey() { return Config.get('YOUTUBE_API_KEY', ''); }
  static get storage() { return Config.get('STORAGE', 'local'); }
  static get port() { return Config.getInt('PORT', 3700); }
  static get dbPath() { return Config.get('DB_PATH', './data/good-vibes.db'); }
}
