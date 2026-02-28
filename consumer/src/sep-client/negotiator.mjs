/**
 * Negotiator — Exchange model negotiation between consumer and provider.
 *
 * Compares provider capabilities (from manifest) with consumer needs,
 * negotiates payload size, content types, enrichment version compatibility,
 * and selects the best exchange model.
 */

/**
 * Negotiate exchange parameters with a provider based on its manifest.
 *
 * @param {object} manifest - Provider manifest (SEP provider-manifest schema)
 * @param {object} consumerNeeds - Consumer's requirements
 * @param {string[]} [consumerNeeds.content_types] - Desired content types
 * @param {string} [consumerNeeds.preferred_model] - Preferred exchange model
 * @param {number} [consumerNeeds.desired_payload_size] - Desired max items
 * @param {string} [consumerNeeds.min_enrichment_version] - Minimum enrichment schema version
 * @param {boolean} [consumerNeeds.needs_stateful] - Whether stateful sessions are needed
 * @param {boolean} [consumerNeeds.needs_telemetry] - Whether telemetry exchange is needed
 * @returns {object} Negotiation result
 */
export function negotiate(manifest, consumerNeeds = {}) {
  const result = {
    compatible: true,
    exchange_model: null,
    payload_size: null,
    content_types: [],
    enrichment_compatible: true,
    warnings: [],
    capabilities: {},
  };

  // Negotiate exchange model
  const preferredModel = consumerNeeds.preferred_model || 'negotiated';
  const supportedModels = manifest.supported_models || [];

  if (supportedModels.includes(preferredModel)) {
    result.exchange_model = preferredModel;
  } else if (supportedModels.includes('negotiated')) {
    result.exchange_model = 'negotiated';
    result.warnings.push(`Preferred model "${preferredModel}" not supported, falling back to "negotiated"`);
  } else if (supportedModels.includes('curated_payload')) {
    result.exchange_model = 'curated_payload';
    result.warnings.push(`Falling back to "curated_payload" exchange model`);
  } else if (supportedModels.length > 0) {
    result.exchange_model = supportedModels[0];
    result.warnings.push(`Using provider's only supported model: "${supportedModels[0]}"`);
  } else {
    result.compatible = false;
    result.warnings.push('Provider declares no supported exchange models');
    return result;
  }

  // Negotiate payload size
  const providerMax = manifest.max_payload_size || 100;
  const desiredSize = consumerNeeds.desired_payload_size || 50;
  result.payload_size = Math.min(desiredSize, providerMax);
  if (desiredSize > providerMax) {
    result.warnings.push(`Desired payload size ${desiredSize} exceeds provider max ${providerMax}, using ${providerMax}`);
  }

  // Negotiate content types
  const providerTypes = manifest.supported_content_types || [];
  const desiredTypes = consumerNeeds.content_types || [];

  if (desiredTypes.length === 0) {
    result.content_types = providerTypes;
  } else {
    result.content_types = desiredTypes.filter(t => providerTypes.includes(t));
    const unsupported = desiredTypes.filter(t => !providerTypes.includes(t));
    if (unsupported.length > 0) {
      result.warnings.push(`Content types not supported by provider: ${unsupported.join(', ')}`);
    }
    if (result.content_types.length === 0) {
      result.compatible = false;
      result.warnings.push('No overlapping content types between consumer and provider');
      return result;
    }
  }

  // Check enrichment version compatibility
  const providerVersion = manifest.enrichment_schema_version || '0.1.0';
  const minVersion = consumerNeeds.min_enrichment_version || '0.1.0';
  if (compareVersions(providerVersion, minVersion) < 0) {
    result.enrichment_compatible = false;
    result.warnings.push(`Provider enrichment version ${providerVersion} is below required ${minVersion}`);
  }

  // Capability flags
  const caps = manifest.capabilities || {};
  result.capabilities = {
    stateful: caps.supports_stateful ?? false,
    browse: caps.supports_full_index_browse ?? false,
    telemetry: caps.supports_telemetry_exchange ?? false,
  };

  if (consumerNeeds.needs_stateful && !result.capabilities.stateful) {
    result.warnings.push('Provider does not support stateful sessions');
  }

  if (consumerNeeds.needs_telemetry && !result.capabilities.telemetry) {
    result.warnings.push('Provider does not support telemetry exchange');
  }

  // Rate limit info
  if (manifest.rate_limit) {
    result.rate_limit = {
      requests_per_minute: manifest.rate_limit.requests_per_minute,
      daily_cap: manifest.rate_limit.daily_cap,
    };
  }

  return result;
}

/**
 * Check if a provider is compatible with consumer requirements.
 * Shorthand for negotiate() that returns a boolean.
 *
 * @param {object} manifest
 * @param {object} consumerNeeds
 * @returns {boolean}
 */
export function isCompatible(manifest, consumerNeeds = {}) {
  const result = negotiate(manifest, consumerNeeds);
  return result.compatible;
}

/**
 * Select the best exchange model from a provider's supported models.
 *
 * @param {string[]} supportedModels
 * @param {string} [preferred]
 * @returns {string|null}
 */
export function selectModel(supportedModels, preferred) {
  const priority = [preferred, 'negotiated', 'curated_payload', 'full_index_browse'].filter(Boolean);
  for (const model of priority) {
    if (supportedModels.includes(model)) return model;
  }
  return supportedModels[0] || null;
}

/**
 * Compare two semver strings. Returns -1, 0, or 1.
 */
function compareVersions(a, b) {
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

export { compareVersions };
