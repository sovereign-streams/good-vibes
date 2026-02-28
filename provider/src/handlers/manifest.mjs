import { ProviderConfig } from '../lib/config.mjs';

export function handleManifest() {
  return {
    sep_version: ProviderConfig.sepVersion,
    provider_id: ProviderConfig.providerId,
    provider_name: ProviderConfig.providerName,
    description: 'Cognitive environment designer for positive content consumption. An opinionated Stream Provider focused on human flourishing.',
    endpoint: ProviderConfig.endpoint,
    supported_models: ['negotiated', 'curated_payload'],
    supported_content_types: ['video', 'podcast', 'music', 'article'],
    guardrails: {
      published: true,
      url: ProviderConfig.guardrailUrl,
      version: ProviderConfig.guardrailVersion
    },
    enrichment_schema_version: ProviderConfig.enrichmentSchemaVersion,
    max_payload_size: ProviderConfig.maxPayloadSize,
    rate_limit: {
      requests_per_minute: ProviderConfig.rateLimitPerMinute,
      daily_cap: ProviderConfig.rateLimitDailyCap
    }
  };
}
