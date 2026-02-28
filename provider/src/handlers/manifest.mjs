export function handleManifest() {
  return {
    sep_version: '0.1.0',
    provider_id: 'good-vibes-main',
    provider_name: 'Good Vibes',
    description: 'Cognitive environment designer for positive content consumption. An opinionated Stream Provider focused on human flourishing.',
    endpoint: `http://localhost:${parseInt(process.env.PORT || '3700', 10)}/sep`,
    supported_models: ['negotiated', 'curated_payload'],
    supported_content_types: ['video', 'podcast', 'music', 'article'],
    guardrails: {
      published: true,
      url: 'https://goodvibes.app/guardrails',
      version: '0.1.0'
    },
    enrichment_schema_version: '0.1.0',
    max_payload_size: 100,
    rate_limit: {
      requests_per_minute: 30,
      daily_cap: 1000
    }
  };
}
