/**
 * Provider configuration — centralizes environment variables and defaults.
 */
export const ProviderConfig = {
  port: parseInt(process.env.PORT || '3700', 10),
  dbPath: process.env.DB_PATH || './data/good-vibes.db',

  // Rate limits
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_RPM || '30', 10),
  rateLimitDailyCap: parseInt(process.env.RATE_LIMIT_DAILY || '1000', 10),

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Guardrails
  guardrailVersion: process.env.GUARDRAIL_VERSION || '0.1.0',
  guardrailUrl: process.env.GUARDRAIL_URL || 'https://goodvibes.app/guardrails',

  // Provider identity
  providerId: 'good-vibes-main',
  providerName: 'Good Vibes',
  sepVersion: '0.1.0',
  enrichmentSchemaVersion: '0.1.0',

  // Payload limits
  maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE || '100', 10),
  maxBrowseLimit: 100,
  defaultBrowseLimit: 20,

  // Telemetry
  telemetryLog: process.env.TELEMETRY_LOG || './data/telemetry.jsonl',

  // Session state
  stateTokenTtlMs: parseInt(process.env.STATE_TOKEN_TTL_MS || String(30 * 60 * 1000), 10), // 30 minutes

  // Endpoint
  get endpoint() {
    return process.env.PROVIDER_ENDPOINT || `http://localhost:${this.port}/sep`;
  }
};
