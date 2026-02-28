# Stream Exchange Protocol (SEP) — Specification v0.2.0 (DRAFT)

**Status:** Draft
**Previous Version:** v0.1.0 (2026-02-28)
**Authors:** Paul (Good Vibes), Community Contributors

---

## Changes from v0.1.0

### New
- **Authentication block** — Optional auth in consumer intent
- **Access tiers** — Provider manifest declares tiered access
- **Stream types** — Exchanges are typed (content_meta, recommendations, etc.)
- **Sponsorship block** — Optional, transparent sponsored content tagging
- **Telemetry exchange offers** — Providers can incentivize telemetry sharing
- **Tip/micropayment field** — Consumers can tip creators through telemetry

### Changed
- Provider manifest extended with `access_tiers`, `telemetry_exchange`, `supported_stream_types`
- Consumer intent extended with optional `authentication` block
- Enrichment envelope extended with optional `sponsorship` block
- Telemetry extended with optional `tip` field per item

### Unchanged
- All v0.1.0 fields remain valid and required where previously required
- Exchange models (curated_payload, full_index_browse, negotiated) unchanged
- Privacy architecture unchanged — disclosure levels still consumer-controlled
- Schema versioning strategy unchanged

---

## 1. Consumer Intent (v0.2.0)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SEP Consumer Intent v0.2.0",
  "type": "object",
  "required": ["sep_version", "consumer_id", "intent", "disclosure_level", "telemetry_opt_in"],
  "properties": {

    "sep_version": {
      "type": "string",
      "const": "0.2.0"
    },

    "consumer_id": {
      "type": "string",
      "description": "Consumer's self-assigned or provider-assigned identifier."
    },

    "stream_type": {
      "type": "string",
      "enum": ["content_meta", "recommendations", "engagement_signals"],
      "default": "content_meta",
      "description": "What kind of stream the consumer is requesting."
    },

    "authentication": {
      "type": "object",
      "description": "Optional. Authentication credentials for tiered access.",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["api_key", "oauth2", "sep_identity"],
          "description": "Authentication method."
        },
        "credential": {
          "type": "string",
          "description": "The credential value. For api_key: the key string. For oauth2: the bearer token. For sep_identity: signed challenge response."
        }
      },
      "required": ["method", "credential"]
    },

    "intent": {
      "type": "object",
      "description": "What the consumer wants. Unchanged from v0.1.0.",
      "properties": {
        "session_type": { "type": "string", "enum": ["composed", "browse", "search"] },
        "target_duration_minutes": { "type": "integer", "minimum": 1 },
        "weights": { "type": "object", "additionalProperties": { "type": "number", "minimum": 0, "maximum": 1 } },
        "filters": { "type": "object" },
        "context": { "type": "object" },
        "state_token": { "type": "string" },
        "sponsorship_preference": {
          "type": "string",
          "enum": ["none", "allowed", "preferred"],
          "default": "none",
          "description": "Consumer's preference for sponsored content. 'none' = exclude all sponsored items. 'allowed' = include if relevant. 'preferred' = actively include for earning potential."
        }
      }
    },

    "disclosure_level": {
      "type": "string",
      "enum": ["minimal", "standard", "full"]
    },

    "telemetry_opt_in": {
      "type": "boolean"
    }
  }
}
```

### Notes on Authentication

- The `authentication` block is entirely optional. Omitting it = anonymous/free tier access.
- Providers declare accepted auth methods in their manifest. Consumers choose which to use.
- API keys are the simplest path. OAuth2 supports third-party integrations. `sep_identity` (v0.4.0) enables decentralized auth.
- A consumer can authenticate with Provider A (paid) and query Provider B (free) in the same session. Auth is per-provider, not per-session.

---

## 2. Provider Manifest (v0.2.0)

```json
{
  "sep_version": "0.2.0",
  "provider_id": "good-vibes-main",
  "provider_name": "Good Vibes",
  "description": "Cognitive environment designer. Curated, enriched content index focused on human flourishing.",
  "endpoint": "https://api.goodvibes.app/sep",

  "supported_models": ["negotiated", "curated_payload", "full_index_browse"],
  "supported_content_types": ["video", "podcast", "music", "article"],
  "supported_stream_types": ["content_meta", "recommendations"],

  "enrichment_schema_version": "0.1.0",
  "max_payload_size": 100,

  "guardrails": {
    "published": true,
    "url": "https://goodvibes.app/guardrails",
    "version": "0.1.0"
  },

  "access_tiers": [
    {
      "tier_id": "community",
      "description": "Free access. Rate limited. Curated payloads only.",
      "requires_auth": false,
      "rate_limit": { "requests_per_minute": 10, "daily_cap": 200 },
      "features": ["curated_payload"],
      "max_payload_size": 25
    },
    {
      "tier_id": "pro",
      "description": "Full access. Higher limits. All exchange models.",
      "requires_auth": true,
      "auth_methods": ["api_key"],
      "rate_limit": { "requests_per_minute": 60, "daily_cap": 5000 },
      "features": ["curated_payload", "full_index_browse", "negotiated", "priority_enrichment"],
      "max_payload_size": 100,
      "pricing": {
        "amount": 9.00,
        "currency": "USD",
        "interval": "month",
        "url": "https://goodvibes.app/pricing"
      }
    },
    {
      "tier_id": "partner",
      "description": "Unlimited. Webhooks. White-label. Custom terms.",
      "requires_auth": true,
      "auth_methods": ["api_key", "oauth2"],
      "rate_limit": null,
      "features": ["*"],
      "max_payload_size": 500,
      "pricing": {
        "amount": null,
        "currency": "USD",
        "interval": "custom",
        "url": "https://goodvibes.app/partners"
      }
    }
  ],

  "telemetry_exchange": {
    "enabled": true,
    "description": "Share engagement data for tier benefits.",
    "offers": [
      {
        "telemetry_level": "full_session",
        "reward_type": "tier_upgrade",
        "reward_detail": { "upgrade_to": "pro", "duration_days": 30 },
        "description": "Share full session telemetry → 30 days Pro access free"
      },
      {
        "telemetry_level": "aggregated_weekly",
        "reward_type": "discount",
        "reward_detail": { "discount_percent": 30, "applies_to": "pro" },
        "description": "Share weekly aggregate data → 30% off Pro"
      }
    ]
  }
}
```

---

## 3. Enrichment Envelope (v0.2.0)

Adds optional `sponsorship` block. All v0.1.0 fields unchanged.

```json
{
  "item_id": "...",
  "sep_version": "0.2.0",
  "source": { "..." },
  "meta": { "..." },
  "enrichment": { "..." },
  "provider": { "..." },

  "sponsorship": {
    "type": "object",
    "description": "Optional. Present only for sponsored content. Transparency is mandatory.",
    "properties": {
      "is_sponsored": { "type": "boolean", "const": true },
      "sponsor": { "type": "string", "description": "Sponsor entity name." },
      "sponsor_category": { "type": "string", "description": "What category of sponsor (fitness_equipment, app, etc.)" },
      "disclosure": { "type": "string", "description": "Human-readable sponsorship disclosure." },
      "consumer_reward": {
        "type": "object",
        "description": "What the consumer earns for viewing this sponsored item.",
        "properties": {
          "type": { "type": "string", "enum": ["credit", "tier_time", "points"] },
          "amount": { "type": "number" },
          "currency": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "required": ["is_sponsored", "sponsor", "disclosure"]
  }
}
```

### Sponsorship Rules

1. **Sponsored items MUST have `is_sponsored: true`.** No dark patterns. No hidden ads.
2. **Sponsored items MUST pass the same enrichment pipeline.** They get the same categories, tones, energy scores as organic content. No special treatment in scoring.
3. **Consumers opt in.** The `sponsorship_preference` field in the intent controls whether sponsored items are included. Default is `"none"`.
4. **Consumer rewards are transparent.** If the consumer earns something for viewing, it's declared in the payload.
5. **Providers set their own sponsorship policies.** Good Vibes might only allow sponsors that pass guardrails. Another provider might accept any sponsor. That's their choice.

---

## 4. Telemetry (v0.2.0)

Adds optional `tip` field per item.

```json
{
  "sep_version": "0.2.0",
  "telemetry": {
    "session_id": "...",
    "session_summary": {
      "completed": true,
      "duration_seconds": 900,
      "satisfaction_score": 4
    },
    "items": [
      {
        "item_id": "...",
        "signals": {
          "viewed": true,
          "view_duration_seconds": 620,
          "completed": true,
          "liked": true,
          "skipped": false,
          "rewatched": false
        },
        "tip": {
          "amount": 0.50,
          "currency": "USD",
          "method": "provider_balance",
          "message": "This was great"
        }
      }
    ],
    "telemetry_exchange_claim": {
      "offer_id": "full_session_pro_upgrade",
      "description": "Claiming Pro tier upgrade for full session telemetry"
    }
  }
}
```

### Tip Processing

- Tips flow through the provider. The provider handles the payment rail.
- The provider takes a transparent processing fee (e.g., 10%).
- The creator receives the remainder.
- The provider manifest should declare `tips_enabled: true` and `tip_processing_fee_percent` if tipping is supported.
- Tips are completely optional for all parties.

---

## 5. Provider Response (v0.2.0)

Extended with `tier_info` so the consumer knows what tier they're operating under:

```json
{
  "sep_version": "0.2.0",
  "provider_id": "good-vibes-main",
  "response_type": "payload",

  "tier_info": {
    "current_tier": "pro",
    "requests_remaining": 4823,
    "daily_reset_at": "2026-03-01T00:00:00Z",
    "telemetry_exchange_active": true,
    "telemetry_exchange_expires": "2026-04-01T00:00:00Z"
  },

  "payload": { "..." },
  "capabilities": { "..." }
}
```

---

## 6. Backward Compatibility

- All v0.1.0 payloads are valid v0.2.0 payloads (new fields are optional).
- A v0.1.0 consumer talking to a v0.2.0 provider works — the provider ignores missing auth and serves the free tier.
- A v0.2.0 consumer talking to a v0.1.0 provider works — the consumer ignores missing tier info.
- The `sep_version` field enables both sides to know what the other supports.

---

## 7. Security Considerations

### API Key Security
- Keys should be transmitted over HTTPS only.
- Providers should support key rotation and revocation.
- Secret keys (`_sk_`) should never be exposed in client-side code. Use publishable keys (`_pk_`) for client-side auth with restricted permissions.
- Providers should log key usage and alert on anomalous patterns.

### Sponsorship Integrity
- Sponsored content must pass the same enrichment pipeline as organic content.
- Providers must not inflate relevance scores for sponsored items.
- Consumer PAE should independently verify that sponsored items match their weights (defense against provider manipulation).

### Telemetry Privacy
- Telemetry exchange offers must clearly state what data is shared and what reward is given.
- Consumers should be able to preview exactly what telemetry data will be sent before confirming.
- Providers must not correlate telemetry data with external identity without explicit consent.

---

## 8. Open Questions (for community input)

1. **Payment rails:** Should SEP define a payment schema, or just declare that tips/payments exist and leave the rail to implementations? (Lightning? Stripe? Provider-specific?)

2. **Peer discovery:** How do peers find each other? DNS-based? Provider-mediated? Out-of-band (share a link)?

3. **Stream type schemas:** Should each stream type have its own JSON Schema, or should there be a generic envelope with a typed `data` field?

4. **Multi-provider auth:** If a consumer has keys for multiple providers, should the PAE manage a keychain? Should keys be scoped per-provider or is there a universal credential?

5. **Offline-first:** Should SEP define a caching/offline protocol, or is that purely a consumer implementation detail?

6. **Rate limit headers:** Should providers use standard HTTP headers (X-RateLimit-*) or include limits in the JSON response body (or both)?
