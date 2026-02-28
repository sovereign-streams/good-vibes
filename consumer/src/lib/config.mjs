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

  static get consumerId() { return Config.get('PAE_CONSUMER_ID', 'pae-local'); }
  static get sepVersion() { return Config.get('SEP_VERSION', '0.1.0'); }
  static get dbPath() { return Config.get('PAE_DB_PATH', './data/pae.db'); }
  static get profilesDir() { return Config.get('PAE_PROFILES_DIR', './default-profiles'); }
  static get disclosureLevel() { return Config.get('PAE_DISCLOSURE_LEVEL', 'minimal'); }
  static get telemetryOptIn() { return Config.getBool('PAE_TELEMETRY_OPT_IN', 'false'); }
  static get defaultProfileId() { return Config.get('PAE_DEFAULT_PROFILE', 'good-vibes-default'); }
  static get requestTimeoutMs() { return Config.getInt('PAE_REQUEST_TIMEOUT_MS', '10000'); }
  static get maxRetries() { return Config.getInt('PAE_MAX_RETRIES', '3'); }
  static get learningRate() { return parseFloat(Config.get('PAE_LEARNING_RATE', '0.1')); }
  static get decayFactor() { return parseFloat(Config.get('PAE_DECAY_FACTOR', '0.95')); }
  static get minSessionsForLearning() { return Config.getInt('PAE_MIN_SESSIONS_LEARNING', '3'); }
  static get recencyWindowHours() { return Config.getInt('PAE_RECENCY_WINDOW_HOURS', '24'); }
}
