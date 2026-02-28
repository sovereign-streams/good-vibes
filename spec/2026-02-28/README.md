# Stream Exchange Protocol (SEP) — Specification v0.1.0

**Snapshot Date:** 2026-02-28
**Protocol Version:** 0.1.0
**Status:** Draft

---

## Overview

The Stream Exchange Protocol (SEP) defines how stream providers and stream consumers communicate in a decentralized content ecosystem. SEP is content-agnostic — it specifies the exchange format, not the content type. A stream can carry video metadata, podcast metadata, article summaries, music tracks, or any structured content.

SEP is founded on the **meta-first principle**: streams exchange enriched metadata, not full media. Content is lazy-loaded by the consumer only when needed. This keeps the protocol lightweight and cost-effective.

The protocol enables **algorithmic sovereignty** — giving individuals control over the algorithms that shape their content consumption.

---

## Schemas

This specification snapshot contains five JSON Schema files (Draft 2020-12):

### 1. Enrichment Envelope (`enrichment-envelope.schema.json`)

The core data structure of SEP. Every content item in a stream carries an enrichment envelope containing:

- **Source** — Origin platform, URL, content type, and duration
- **Meta** — Title, creator, publication date, tags, language, thumbnail
- **Enrichment** — LLM-generated semantic scores including categories with confidence, emotional tone analysis, energy level, cognitive load, motivation score, humor score, skill transfer score, production quality, and session-fit indicators
- **Provider** — Provider identity, guardrail pass/fail status, and guardrail version

The enrichment layer is what transforms raw platform metadata into semantically rich records that enable consumer-side algorithmic control.

**Emotional Tone Flags:** The envelope includes boolean flags for harmful content patterns: `rage_bait`, `humiliation`, `shock_content`, `inflammatory`, `sexually_explicit`, and `violence`. These enable consumers to set hard exclusion filters.

**Session Fit:** Each item is tagged with session-fit indicators (`good_opener`, `good_builder`, `good_peak`, `good_closer`) that enable composed session arcs with intentional pacing.

### 2. Consumer Intent (`consumer-intent.schema.json`)

Describes what a consumer is requesting from a provider. Includes:

- **Session type** — `composed` (structured arc), `browse` (open exploration), or `search` (targeted query)
- **Target duration** — Desired session length in minutes
- **Weights** — Category weight distribution (e.g., 25% fitness, 20% humor)
- **Filters** — Hard exclusion filters for harmful content, energy bounds, cognitive load caps, and language preferences
- **Context** — Time of day, session count, and state tokens for multi-round exchanges
- **Disclosure level** — How much the consumer reveals to the provider
- **Telemetry opt-in** — Whether the consumer will share engagement data

**Disclosure Levels:**

| Level | What the provider sees |
|---|---|
| `minimal` | Weights and filters only. No behavioral history. |
| `standard` | Weights, filters, plus recent anonymized session summaries. |
| `full` | Weights, filters, and full behavioral profile. Provider can hyper-personalize. |

The consumer always chooses. The provider works with what it receives.

### 3. Provider Response (`provider-response.schema.json`)

The provider's response to a consumer intent. Supports three response types:

- **`payload`** — A successful response containing enrichment envelopes, match confidence, a suggested session arc, and an optional state token for follow-up requests
- **`error`** — An error with a machine-readable code, human-readable message, and optional retry guidance
- **`redirect`** — Instructs the consumer to re-issue the request to a different endpoint

Responses also include **capability declarations** so the consumer knows what the provider supports (stateful exchanges, full index browse, telemetry acceptance, max payload size).

### 4. Provider Manifest (`provider-manifest.schema.json`)

A provider's self-declaration document, published at a well-known endpoint. Used for discovery and negotiation. Declares:

- Provider identity and description
- API endpoint URL
- Supported exchange models
- Supported content types
- Guardrail policy (published standards, URL, version)
- Enrichment schema version
- Maximum payload size
- Rate limits

### 5. Telemetry (`telemetry.schema.json`)

Optional, opt-in engagement telemetry shared by a consumer after a session. Contains:

- **Session-level data** — Session ID, completion status, satisfaction score
- **Item-level data** — Per-item signals including viewed, view duration, completed, liked, skipped (with timestamp), rewatched, paused (with timestamp)

Telemetry is never required. It creates a voluntary value exchange: the provider gets signal quality data, the consumer gets better future payloads.

---

## Exchange Models

SEP supports three exchange patterns. Both sides declare what they support during the initial handshake via the provider manifest.

### Model A: Curated Payload (`curated_payload`)

The simplest model. The consumer sends an intent. The provider filters its index heavily and returns a curated set of enrichment envelopes.

**Characteristics:**
- Single request-response cycle
- Provider has more influence over results
- Lower consumer-side processing cost
- Suitable for consumers who trust the provider's curation

**Flow:**
```
Consumer --[intent]--> Provider
Consumer <--[curated payload]-- Provider
```

### Model B: Full Meta-Index Browse (`full_index_browse`)

The provider exposes its entire metadata index. The consumer queries directly against it, like a search engine.

**Characteristics:**
- Maximum consumer sovereignty
- Most expensive for the provider (bandwidth, compute)
- Provider can observe query patterns
- Suitable for consumers who want full control and have strong local PAE capabilities

**Flow:**
```
Consumer --[query]--> Provider Index
Consumer <--[raw index results]-- Provider Index
Consumer applies local PAE filtering and arc composition
```

### Model C: Negotiated Exchange (`negotiated`) — Recommended Default

A multi-round exchange with progressive refinement. The consumer sends an intent with its chosen disclosure level. The provider returns a ranked payload with confidence scores. The consumer refines locally using its PAE. Multiple round-trips are expected.

**Characteristics:**
- Balances provider intelligence with consumer sovereignty
- State tokens enable continuity without the provider storing user profiles
- Progressive disclosure — the consumer can reveal more over successive rounds
- Supports the widest range of consumer capabilities

**Flow:**
```
Round 1:
  Consumer --[intent + disclosure_level]--> Provider
  Consumer <--[payload + state_token]--> Provider

Round 2 (refinement):
  Consumer --[intent + state_token]--> Provider
  Consumer <--[refined payload + state_token]--> Provider

... (additional rounds as needed)
```

---

## Privacy Architecture

State lives primarily on the consumer side. The provider sees only what the consumer chooses to share.

Key principles:

- **Disclosure levels** control what the provider sees
- **State tokens** are opaque — the provider stores session continuity, not behavioral profiles
- **Telemetry** is aggregated before sending (if opted in) and is always voluntary
- **No behavioral fingerprinting** from intent vectors — consumers can rotate or generalize their weight vectors
- The consumer **can query multiple providers** with different disclosure levels

---

## Versioning

SEP uses dual versioning:

- **Semantic versioning** for the protocol: `0.1.0`, `0.2.0`, `1.0.0`
- **Date-based snapshots** for schema releases: `spec/2026-02-28/`

Enrichment schemas are versioned independently from the protocol. A consumer can request items enriched at a minimum schema version. Old enrichments remain valid at their declared version.

---

## Schema Validation

All schemas conform to JSON Schema Draft 2020-12. Schema `$id` values follow the pattern:

```
https://goodvibes.app/schemas/2026-02-28/{schema-name}.schema.json
```

The provider response schema uses `$ref` to reference the enrichment envelope schema for items within the payload, ensuring type safety across the protocol boundary.

---

## File Listing

| File | Description |
|---|---|
| `enrichment-envelope.schema.json` | Core enrichment envelope for every content item |
| `consumer-intent.schema.json` | Consumer's request to a provider |
| `provider-response.schema.json` | Provider's response to a consumer intent |
| `provider-manifest.schema.json` | Provider's self-declaration and capability document |
| `telemetry.schema.json` | Optional opt-in engagement telemetry |
| `README.md` | This document |
