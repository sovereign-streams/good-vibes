# Good Vibes — Personal Algorithm Engine
## Comprehensive Requirements Document

**Authors:** Paul (Milliprime / 1KH) & Claude (Anthropic)
**Date:** February 28, 2026
**Version:** 0.1.0-draft
**Status:** Requirements Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Vision: Internet 4.0](#3-vision-internet-40)
4. [Core Concepts](#4-core-concepts)
5. [Protocol Design: Stream Exchange Protocol (SEP)](#5-protocol-design-sep)
6. [Architecture](#6-architecture)
7. [Project Structure — Four Phases](#7-project-structure)
8. [Phase 1: SEP Spec + Enrichment Service](#8-phase-1)
9. [Phase 2: Good Vibes Provider](#9-phase-2)
10. [Phase 3: Consumer PAE](#10-phase-3)
11. [Phase 4: The Shell](#11-phase-4)
12. [Implementation Details](#12-implementation-details)
13. [Domain & Branding](#13-domain-branding)
14. [Testing Strategy](#14-testing-strategy)
15. [Project Management](#15-project-management)
16. [Open Decisions](#16-open-decisions)
17. [Future Backlog](#17-future-backlog)

---

## 1. Executive Summary

**Good Vibes** is a Personal Algorithm Engine (PAE) — a system that gives individuals control over the algorithms that shape their content consumption and, by extension, their cognitive environment.

Today's content platforms (TikTok, YouTube, Instagram) optimize feeds for engagement metrics: time-on-site, emotional activation, ad yield. Users have zero control over the algorithms that determine what they see. The result is involuntary neurological shaping — doomscrolling, rage-bait loops, comparison anxiety, identity erosion.

Good Vibes inverts this. Users define their own content weights, emotional filters, session boundaries, and rhythm design. The system pulls content metadata from existing platforms, enriches it with LLM-powered semantic tagging, and composes personalized session arcs optimized for the user's goals — not an advertiser's.

The project introduces:

- **Stream Exchange Protocol (SEP)** — An open protocol defining how Stream Providers and Stream Consumers exchange metadata-driven content through structured negotiation.
- **LLM Enrichment Service** — A pipeline that transforms raw content metadata into semantically tagged, schema-compliant records.
- **Good Vibes Provider** — An opinionated Stream Provider that applies ethical guardrails and curates content for human flourishing.
- **Personal Algorithm Engine (PAE)** — A consumer-side engine that applies user-defined weights, filters, and session logic.
- **Consumer Shell** — A local-first interface that renders composed sessions and manages multi-source streams.

The first use case targets men's mental health — helping men design their own scroll experience to support motivation, skill acquisition, humor, calm, and identity strengthening. The architecture is universal.

This is not a social network. This is not a blockchain project. This is not anti-platform.

This is **algorithmic sovereignty** — the user's right to control the signals that shape their mind.

---

## 2. Problem Statement

### The Attention Extraction Economy

Current content platforms operate on a single optimization function: maximize engagement. This is measured by:

- Time on site
- Scroll depth
- Emotional activation (outrage, envy, anxiety drive interaction)
- Ad impressions and click-through
- Return frequency

The user is not the customer. The user is the product. The algorithm is designed to keep them scrolling, not to make them better.

### The Neurological Reality

Feed ordering influences mood, identity, attention patterns, political views, and self-perception. Research consistently shows that algorithmic feeds correlate with increased anxiety, depression, social comparison, and reduced attention span — particularly in young men.

The core question: **How much of your thinking is yours, and how much is shaped by an algorithm you didn't choose?**

### What Exists Today

| Approach | What It Does | Why It Fails |
|----------|-------------|--------------|
| Screen time limits | Caps total usage | User just switches to another app |
| Content blockers | Blocks categories | Blunt instrument, no nuance |
| "Take a break" reminders | Nudges after N minutes | Easily dismissed, no alternative offered |
| Algorithm transparency laws | Forces disclosure | Knowing the algorithm exists doesn't give you control |
| Web3 / decentralized social | Alternative platforms | Tiny content libraries, friction, ideology over UX |

None of these give the user control over the algorithm itself.

### The Missing Layer

There is no system that lets a user say: "I want 30% fitness, 20% humor, 15% skill-building, 10% motivation, and I want zero rage-bait. Cap my session at 15 minutes and end with a pump-up track."

Good Vibes is that system.

### Who This Is For (First Wedge)

Men aged 25-55 who:

- Recognize they doomscroll and want to redirect that energy
- Want to use short-form content as a tool for self-improvement
- Are interested in fitness, entrepreneurship, skill acquisition, stoicism, fatherhood
- Want to feel in control of their inputs, not controlled by them
- Are tired of sponsored content and engagement-bait polluting their feed

The architecture serves anyone. The first product serves men who want to take their brain back.

---

## 3. Vision: Internet 4.0

### The Evolution of the Web

**Internet 1.0 — Read-Only Web (1990s)**
Static pages. One-way publishing. You visited websites.

**Internet 2.0 — Platform Web (2004–present)**
User-generated content. Algorithmic feeds. Platforms own your audience, your data, and the algorithm. You rent attention.

**Internet 3.0 — Decentralized Infrastructure (2015–present)**
Blockchain. Wallet-based identity. Tokenized assets. Decentralized the ledger but not the experience — users still live on centralized interfaces (OpenSea, MetaMask, Coinbase).

**Internet 4.0 — Seamless Sovereignty (emerging)**
Protocol-mediated streams between sovereign consumers and sovereign providers, coordinated by intelligent agents. Users own the interface layer itself.

### Internet 4.0 Defined

Internet 4.0 is not about decentralizing hardware or data storage. It is about **decentralizing influence** — giving individuals control over the algorithms that shape their cognitive environment.

Key principles:

- **Meta-first indexing** — Content is referenced by semantic metadata, not hosted centrally
- **Consumer-side algorithm ownership** — The user defines how content is filtered, weighted, and sequenced
- **Transparent provider ethos** — Providers publish their curation standards openly
- **Lightweight, self-hostable containers** — No dependency on any platform's infrastructure
- **Seamless sovereignty** — Invisible decentralization; the user experience is simple, beautiful, and rewarding

The winner is not "fully decentralized everything." The winner is **seamless sovereignty** — the convenience of a platform with the freedom of ownership.

### What We Don't Say

We don't say "down with platforms." We need platforms. We need great content. We need creators.

We say: **"Algorithms should serve you."**

We say: **"You deserve to design your own feed."**

We say: **"Own your scroll. Own your mind."**

---

## 4. Core Concepts

### 4.1 Stream Providers

Entities that make content available via the Stream Exchange Protocol. Examples:

- An individual sharing content to their personal stream
- A business with a channel of curated videos
- An aggregator that indexes content across sources
- A major platform with ready-to-stream content libraries
- **Good Vibes** — an opinionated provider focused on human flourishing

Providers don't need to host the content. They provide **enriched metadata** that points to origin sources. This is the meta-first principle.

### 4.2 Stream Consumers

Entities that receive content via SEP. Examples:

- An individual running a personal feed on their local machine
- A business aggregating content for employees
- A platform composing multi-source feeds
- An AI agent assembling content on behalf of a user

Consumers run a **Personal Algorithm Engine (PAE)** that applies their preferences to incoming streams.

### 4.3 The Protocol (SEP)

The Stream Exchange Protocol defines how providers and consumers communicate. It specifies metadata schemas, query formats, negotiation handshakes, and payload structures. The protocol is the contract between the two sides. It has no opinion about content — only about format.

### 4.4 The Enrichment Layer

Raw content metadata (YouTube titles, descriptions, tags, view counts) is insufficient for algorithmic sovereignty. The enrichment layer is an LLM-powered pipeline that takes raw metadata and produces semantically tagged records conforming to the SEP schema.

Enrichment serves both sides:

- **Provider-side:** Enrichment builds the index. Raw metadata becomes searchable, matchable, composable.
- **Consumer-side:** Enrichment interprets user behavior. Viewing patterns become preference signals. Session history becomes refinement data.

### 4.5 The Personal Algorithm Engine (PAE)

The PAE lives on the consumer side. It is the user's algorithm. It defines:

- **Content weights** — Category distribution (e.g., 30% fitness, 20% humor, 15% skill-building)
- **Emotional filters** — What to exclude (rage-bait, humiliation, shock content)
- **Session rules** — Duration caps, escalating reminders, hard cutoffs
- **Rhythm design** — Session arc composition (open with humor → build to skill → close with motivation)
- **Reinforcement rules** — How engagement signals adjust weights over time

### 4.6 Session Arcs

This is a key differentiator. Good Vibes doesn't serve a feed. It composes a **session** — a designed sequence with emotional pacing, like a playlist with narrative structure.

A session arc might be:

1. Open: 2-3 humor clips (warm up, release tension)
2. Build: 3-4 skill/learning videos (engaged focus)
3. Peak: 1-2 motivation/intensity pieces (energy spike)
4. Close: 1 calm/craft video + pump-up music track (grounded exit)

This turns passive scrolling into active cognitive training.

### 4.7 BYOA — Bring Your Own Algorithm

The philosophical principle: every user should be able to define their own content algorithm. Not just "pick categories" — define weighting, emotional constraints, session structure, reinforcement behavior, and privacy boundaries.

BYOA is not a feature. It is the foundational design principle.

---

## 5. Protocol Design: Stream Exchange Protocol (SEP)

### 5.1 Design Philosophy

SEP is content-agnostic. It defines the exchange format, not the content type. A stream could be video metadata, podcast metadata, article summaries, music tracks, dashboard data, or any structured content. The protocol doesn't care what flows through it — only how it's described and negotiated.

### 5.2 Meta-First Principle

Streams exchange **metadata**, not full media. A SEP payload contains:

- Semantic tags
- Source pointers (URLs to origin content)
- Enrichment scores
- Provider confidence ratings

Full media is lazy-loaded by the consumer only when needed. This keeps the protocol lightweight and cost-effective. You're indexing meaning, not storing video blobs.

### 5.3 Enrichment Tag Schema (Core)

Every content item in a SEP stream carries an enrichment envelope:

```json
{
  "sep_version": "0.1.0",
  "item_id": "uuid-v4",
  "source": {
    "platform": "youtube",
    "origin_url": "https://youtube.com/watch?v=...",
    "origin_id": "dQw4w9WgXcQ",
    "content_type": "video",
    "duration_seconds": 342
  },
  "meta": {
    "title": "How to Build a Surfboard from Scratch",
    "creator": "Shaping Bay",
    "published": "2026-01-15T00:00:00Z",
    "original_tags": ["surfboard", "woodworking", "craft"],
    "language": "en",
    "thumbnail_url": "https://..."
  },
  "enrichment": {
    "schema_version": "0.1.0",
    "enriched_at": "2026-02-28T12:00:00Z",
    "categories": [
      { "id": "craft", "confidence": 0.92 },
      { "id": "skill_building", "confidence": 0.85 },
      { "id": "relaxation", "confidence": 0.71 }
    ],
    "emotional_tone": {
      "primary": "calm",
      "secondary": "focused",
      "rage_bait": false,
      "humiliation": false,
      "shock_content": false,
      "inflammatory": false
    },
    "energy_level": 0.35,
    "cognitive_load": 0.45,
    "motivation_score": 0.40,
    "humor_score": 0.10,
    "skill_transfer_score": 0.80,
    "session_fit": {
      "good_opener": false,
      "good_builder": true,
      "good_peak": false,
      "good_closer": true
    }
  },
  "provider": {
    "id": "good-vibes-main",
    "guardrail_pass": true,
    "guardrail_version": "0.1.0"
  }
}
```

### 5.4 Consumer Intent Schema

When a consumer queries a provider, it sends an intent payload describing what it's looking for. The consumer controls how much it reveals.

```json
{
  "sep_version": "0.1.0",
  "consumer_id": "anonymous-or-identified",
  "intent": {
    "session_type": "composed",
    "target_duration_minutes": 15,
    "weights": {
      "fitness": 0.25,
      "humor": 0.20,
      "skill_building": 0.20,
      "motivation": 0.15,
      "craft": 0.10,
      "music": 0.10
    },
    "filters": {
      "exclude_rage_bait": true,
      "exclude_humiliation": true,
      "exclude_shock_content": true,
      "min_energy_level": 0.2,
      "max_cognitive_load": 0.7,
      "language": ["en"]
    },
    "context": {
      "time_of_day": "morning",
      "session_number_today": 1,
      "state_token": null
    }
  },
  "disclosure_level": "minimal",
  "telemetry_opt_in": false
}
```

**Disclosure levels:**

- `minimal` — Only weights and filters. No behavioral history.
- `standard` — Weights, filters, plus recent session summaries (anonymized).
- `full` — Weights, filters, full behavioral profile. Provider can hyper-personalize.

The consumer always chooses. The provider works with what it gets.

### 5.5 Provider Response Schema

```json
{
  "sep_version": "0.1.0",
  "provider_id": "good-vibes-main",
  "response_type": "payload",
  "payload": {
    "items": [
      { "item_id": "uuid-1", "source": { "platform": "youtube", "origin_id": "abc123" }, "meta": { "title": "Example 1" }, "enrichment": {} },
      { "item_id": "uuid-2", "source": { "platform": "youtube", "origin_id": "def456" }, "meta": { "title": "Example 2" }, "enrichment": {} }
    ],
    "total_available": 847,
    "returned": 50,
    "confidence": 0.78,
    "suggested_arc": ["humor", "humor", "skill", "skill", "skill", "motivation", "craft", "music"],
    "state_token": "opaque-token-for-stateful-followup"
  },
  "capabilities": {
    "supports_stateful": true,
    "supports_full_index_browse": false,
    "supports_telemetry_exchange": true,
    "max_payload_size": 100
  }
}
```

### 5.6 Exchange Models

The protocol supports multiple exchange patterns. Both sides declare what they support during the initial handshake.

**Model A: Provider-Curated Payload**
Consumer sends intent. Provider filters heavily and returns a curated set. Simplest model. Provider has more influence over results.

**Model B: Full Meta-Index Browse**
Provider exposes its entire metadata index. Consumer queries directly against it, like a search engine. Most consumer sovereignty. Most expensive for the provider. Provider can observe query patterns.

**Model C: Negotiated Exchange (Recommended Default)**
Consumer sends intent with chosen disclosure level. Provider returns a ranked payload with confidence scores and alternative clusters. Consumer refines locally using its PAE. Multiple round-trips are expected. State tokens enable continuity without the provider storing user profiles.

The protocol defines the handshake where both sides declare supported models:

```json
{
  "sep_version": "0.1.0",
  "provider_id": "good-vibes-main",
  "provider_name": "Good Vibes",
  "description": "Cognitive environment designer for positive content consumption",
  "endpoint": "https://api.goodvibes.app/sep/v1",
  "supported_models": ["negotiated", "curated_payload"],
  "supported_content_types": ["video", "podcast", "music", "article"],
  "guardrails": {
    "published": true,
    "url": "https://goodvibes.app/guardrails",
    "version": "0.1.0"
  },
  "enrichment_schema_version": "0.1.0",
  "max_payload_size": 100,
  "rate_limit": {
    "requests_per_minute": 30,
    "daily_cap": 1000
  }
}
```

### 5.7 Telemetry Exchange (Optional, Opt-In)

If the consumer opts in, it can share engagement metrics back to the provider:

```json
{
  "sep_version": "0.1.0",
  "telemetry": {
    "session_id": "uuid",
    "items": [
      {
        "item_id": "uuid",
        "viewed": true,
        "view_duration_seconds": 45,
        "completed": false,
        "liked": false,
        "skipped_at_seconds": 45,
        "rewatched": false,
        "paused": true,
        "paused_at_seconds": 22
      }
    ],
    "session_completed": true,
    "session_satisfaction": 0.8
  }
}
```

This creates a value exchange: the provider gets signal quality data, the consumer gets better future payloads. But it's never required.

### 5.8 Privacy Architecture

Core rule: **State lives primarily on the consumer side.**

The provider sees only what the consumer chooses to share. The consumer's PAE does the heavy personalization work locally. The provider's job is to return a good-enough payload — not to build a user profile.

Privacy-preserving measures:

- Disclosure levels control what the provider sees
- State tokens are opaque — the provider stores session continuity, not behavioral profiles
- Telemetry is aggregated before sending (if opted in)
- No behavioral fingerprinting from intent vectors — consumers can rotate or generalize their weight vectors
- The consumer can query multiple providers with different disclosure levels

### 5.9 Versioning

Dual versioning (matching AIP pattern):

- Semantic versioning for the protocol: `0.1.0`, `0.2.0`, `1.0.0`
- Date-based snapshots for schema releases: `spec/2026-02-28/`

Enrichment schemas are versioned independently from the protocol. A consumer can request items enriched at a minimum schema version. Old enrichments remain valid at their declared version.

---

## 6. Architecture

### 6.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONSUMER SIDE                             │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ Consumer     │    │ Personal     │    │ Consumer-Side    │    │
│  │ Shell (UI)   │◄──►│ Algorithm    │◄──►│ Enrichment       │    │
│  │              │    │ Engine (PAE) │    │ (behavior tags)  │    │
│  └─────────────┘    └──────┬───────┘    └──────────────────┘    │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ SEP (Stream Exchange Protocol)
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                        PROVIDER SIDE                             │
│                            │                                     │
│  ┌──────────────┐    ┌─────┴────────┐    ┌──────────────────┐   │
│  │ Content      │    │ Provider     │    │ Provider-Side    │   │
│  │ Source APIs  │───►│ Index        │◄───│ Enrichment       │   │
│  │ (YT, RSS,   │    │ (Meta DB)    │    │ (LLM tagging)   │   │
│  │  Podcasts)   │    └──────────────┘    └──────────────────┘   │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Guardrails Layer (Good Vibes specific)                    │   │
│  │ - Ethical filter: no violence, porn, extreme degradation  │   │
│  │ - Published standards, transparent exclusion logic         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Enrichment Service Architecture

The enrichment service is the core intelligence layer. It is a standalone service used by both providers and consumers.

```
Provider-Side Enrichment:
  Raw metadata (YouTube API, RSS, etc.)
      │
      ▼
  ┌──────────────────────────┐
  │  Enrichment Pipeline      │
  │                           │
  │  1. Ingest raw meta       │
  │  2. Fetch transcript      │
  │     (if available)        │
  │  3. Analyze thumbnail     │
  │     (if available)        │
  │  4. Sample comments       │
  │     (if available)        │
  │  5. LLM tagging pass      │
  │     → categories          │
  │     → emotional tone      │
  │     → energy level        │
  │     → skill scores        │
  │     → session fit         │
  │  6. Guardrail check       │
  │  7. Output SEP envelope   │
  └──────────────────────────┘
      │
      ▼
  SEP-compliant enrichment record

Consumer-Side Enrichment:
  User behavior signals (views, skips, pauses, likes)
      │
      ▼
  ┌──────────────────────────┐
  │  Behavior Interpreter     │
  │                           │
  │  1. Aggregate signals     │
  │  2. Detect patterns       │
  │  3. Update weight model   │
  │  4. Suggest PAE tweaks    │
  │  5. Compose session arc   │
  └──────────────────────────┘
      │
      ▼
  Updated PAE configuration + session composition
```

### 6.3 Data Flow — End to End

```
1. YouTube API returns 1000 video metadata records
2. Enrichment pipeline processes each → SEP envelopes
3. Good Vibes guardrails filter out 150 (violence, shock, etc.)
4. 850 enriched records stored in provider index
5. Consumer sends intent: "morning session, 15 min, heavy fitness + humor"
6. Provider queries index, returns 50 best-match envelopes
7. Consumer PAE receives payload, applies local preferences
8. PAE composes session arc: [humor, humor, fitness, fitness, skill, motivation, music]
9. Shell renders session, lazy-loads actual video content
10. User watches, skips, likes → signals feed back into consumer enrichment
11. PAE adjusts weights for next session
```

---

## 7. Project Structure — Four Phases

This is ONE project with phased deliverables. Not four separate repos from day one.

### Phase 1: SEP Spec + Enrichment Service
The protocol specification and the LLM enrichment pipeline. This is the foundation — without enrichment, nothing else works. Produces a working pipeline that can tag 10,000 YouTube videos against the SEP schema.

### Phase 2: Good Vibes Provider
An opinionated Stream Provider built on top of the enrichment service. Applies ethical guardrails. Serves enriched meta-streams via SEP. This is the first "product" — a content index with a point of view.

### Phase 3: Consumer PAE
The consumer-side engine. Receives SEP streams, applies user-defined weights and filters, composes session arcs. This is where algorithmic sovereignty becomes real.

### Phase 4: The Shell
The local-first interface. Renders sessions, manages sources, handles user preferences. This is the product the user touches.

**Critical:** Phase 3 extracts SEP as a formal standalone spec from what Phases 1-2 built. The protocol is documented from working code, not designed in a vacuum.

---

## 8. Phase 1: SEP Spec + Enrichment Service

### 8.1 Deliverables

1. **SEP Specification** — JSON schemas for all message types (enrichment envelope, consumer intent, provider response, telemetry, provider manifest)
2. **Enrichment Pipeline** — Node.js service that consumes YouTube API metadata and produces SEP-compliant tagged records
3. **Enrichment Tag Taxonomy** — The initial category, emotion, and scoring dimensions
4. **Seed Index** — 10,000+ enriched video records across target categories
5. **Documentation** — Protocol spec, enrichment API docs, taxonomy reference

### 8.2 Repository Structure

```
good-vibes/
├── README.md
├── LICENSE                            # MIT
├── REQUIREMENTS.md                    # This document
├── CHANGELOG.md
├── spec/
│   └── 2026-02-28/
│       ├── enrichment-envelope.schema.json
│       ├── consumer-intent.schema.json
│       ├── provider-response.schema.json
│       ├── provider-manifest.schema.json
│       ├── telemetry.schema.json
│       └── README.md
├── enrichment/
│   ├── package.json
│   ├── src/
│   │   ├── index.mjs                  # Main entry
│   │   ├── pipeline.mjs               # Enrichment pipeline orchestrator
│   │   ├── sources/
│   │   │   ├── youtube.mjs            # YouTube API adapter
│   │   │   ├── rss.mjs                # RSS/podcast feed adapter
│   │   │   └── base.mjs               # Base source adapter interface
│   │   ├── enrichers/
│   │   │   ├── llm-tagger.mjs         # LLM-based semantic tagging
│   │   │   ├── transcript.mjs         # Transcript fetcher/analyzer
│   │   │   ├── thumbnail.mjs          # Thumbnail analysis (optional)
│   │   │   └── comment-sampler.mjs    # Comment sentiment sampling
│   │   ├── guardrails/
│   │   │   ├── ethical-filter.mjs     # Content exclusion logic
│   │   │   └── rules.json             # Published guardrail rules
│   │   ├── store/
│   │   │   ├── index-store.mjs        # Enriched metadata storage
│   │   │   └── adapters/
│   │   │       ├── sqlite.mjs         # Local SQLite adapter
│   │   │       └── dynamodb.mjs       # Cloud DynamoDB adapter
│   │   ├── taxonomy/
│   │   │   ├── categories.json        # Category definitions
│   │   │   ├── emotions.json          # Emotional tone definitions
│   │   │   └── scoring.json           # Score dimension definitions
│   │   └── lib/
│   │       ├── llm-client.mjs         # Anthropic API wrapper
│   │       ├── validator.mjs          # SEP schema validator
│   │       └── config.mjs             # Configuration management
│   ├── scripts/
│   │   ├── seed-youtube.mjs           # Seed index from YouTube
│   │   ├── re-enrich.mjs             # Re-tag existing records at new schema version
│   │   └── stats.mjs                  # Index statistics
│   └── tests/
│       ├── pipeline.test.mjs
│       ├── llm-tagger.test.mjs
│       ├── guardrails.test.mjs
│       └── fixtures/
│           ├── raw-youtube-meta.json
│           └── expected-enrichment.json
├── docs/
│   ├── index.html                     # GitHub Pages landing
│   ├── spec.html                      # Protocol specification
│   ├── taxonomy.html                  # Tag taxonomy reference
│   └── assets/
│       ├── css/
│       └── img/
└── provider/                          # Phase 2 (see section 9)
    └── ...
```

### 8.3 Enrichment Pipeline — Technical Design

**Input:** Raw content metadata from source APIs.

**Processing:**

1. **Ingest** — Fetch metadata from YouTube Data API v3 (search, videos.list, captions.list). Extract: title, description, tags, duration, view count, like count, channel info, publish date, thumbnail URLs.

2. **Transcript Fetch** — Where available, fetch auto-generated or uploaded captions via YouTube captions API or third-party transcript services. This is the richest signal for semantic tagging.

3. **LLM Tagging** — Send a structured prompt to Claude Haiku (cheapest capable model) with the raw metadata + transcript excerpt. The LLM returns structured JSON matching the enrichment schema. Prompt includes the full taxonomy definitions so tagging is consistent.

4. **Guardrail Check** — Apply Good Vibes ethical filter. Binary pass/fail against published exclusion rules. Items that fail are tagged as `guardrail_pass: false` but still stored (other providers with different guardrails may want them).

5. **Validation** — Validate output against SEP enrichment envelope JSON schema.

6. **Storage** — Write to index store (SQLite for local dev, DynamoDB for cloud).

**Output:** SEP-compliant enrichment envelope.

**Cost Estimate (Haiku at scale):**

- ~500 input tokens per item (metadata + transcript excerpt)
- ~200 output tokens per item (structured JSON)
- At Claude Haiku pricing: roughly $0.001-0.002 per item
- 10,000 items = ~$10-20 for initial seed
- Ongoing enrichment: budget-friendly for continuous operation

### 8.4 Initial Taxonomy

**Categories (v0.1.0):**

| Category ID | Description | Example Content |
|-------------|-------------|-----------------|
| `fitness` | Exercise, training, body health | Workout tutorials, form guides |
| `nutrition` | Diet, cooking, food science | Meal prep, nutrition breakdowns |
| `skill_building` | Learning new abilities | Language learning, coding tutorials |
| `humor` | Comedy, funny fails, light entertainment | Comedy sketches, fail compilations |
| `motivation` | Inspirational, discipline, mindset | Motivational speeches, success stories |
| `craft` | Making things, woodworking, building | Surfboard shaping, shelter building |
| `stoicism` | Philosophy, mental frameworks, resilience | Stoic philosophy, mental models |
| `fatherhood` | Parenting, family, role modeling | Dad advice, family activities |
| `entrepreneurship` | Business, hustle, career growth | Startup advice, business strategy |
| `music` | Music tracks, playlists, performance | Pump-up tracks, chill beats |
| `nature` | Outdoors, exploration, bushcraft | Camping, hiking, survival |
| `relaxation` | Calm content, ASMR, slow crafting | Woodworking, pottery, slow cooking |

**Emotional Tone Dimensions:**

- `primary_tone`: calm, focused, energized, amused, inspired, reflective
- `secondary_tone`: (same options, nullable)
- Boolean flags: `rage_bait`, `humiliation`, `shock_content`, `inflammatory`, `sexually_explicit`, `violence`

**Scoring Dimensions (0.0-1.0):**

- `energy_level` — How much activation/arousal the content produces
- `cognitive_load` — How much attention/thinking required
- `motivation_score` — How much it drives action
- `humor_score` — How funny/entertaining
- `skill_transfer_score` — How much practical knowledge transferred
- `production_quality` — Production value (audio, video, editing)

**Session Fit (boolean):**

- `good_opener` — Suitable to start a session (light, engaging)
- `good_builder` — Suitable for mid-session (focused, deepening)
- `good_peak` — Suitable for energy peak (intense, motivating)
- `good_closer` — Suitable to end a session (grounding, satisfying)

### 8.5 Schema Versioning Strategy

The enrichment schema will evolve. New dimensions will be added. Existing dimensions will be refined. This is expected.

Rules:

- Every enriched record carries `enrichment.schema_version`
- Old records remain valid at their declared version
- New queries can specify `min_schema_version`
- Re-enrichment is done on-access (lazy) or via batch script
- The `re-enrich.mjs` script processes existing records against the latest taxonomy
- Schema versions follow semver: breaking changes = major, new dimensions = minor, fixes = patch

### 8.6 YouTube API Integration

**APIs Used:**

- `youtube.search.list` — Discover videos by keyword/category
- `youtube.videos.list` — Get detailed metadata for specific videos
- `youtube.captions.list` — Check available captions
- `youtube.captions.download` — Fetch transcript text

**Rate Limits:**

- YouTube Data API v3: 10,000 units/day (default quota)
- search.list = 100 units per call
- videos.list = 1 unit per call
- Batch video detail calls to maximize efficiency

**Seeding Strategy:**

1. Define search queries per category (e.g., "home workout routine", "stoic philosophy explained", "funny fails compilation")
2. Fetch top results per query (50-100 per query)
3. Fetch video details in batches of 50
4. Fetch available transcripts
5. Run through enrichment pipeline
6. Store in index

Target: 10,000 enriched records across all categories for initial seed.

---

## 9. Phase 2: Good Vibes Provider

### 9.1 What It Is

Good Vibes is the first opinionated implementation of a SEP Stream Provider. It is:

- A curated, enriched content index
- With published ethical guardrails
- Serving SEP-compliant streams
- Focused on cognitive flourishing

It is NOT a content host. It is a metadata provider that points to origin sources.

### 9.2 Provider Capabilities

```
provider/
├── package.json
├── src/
│   ├── server.mjs                     # SEP endpoint server
│   ├── handlers/
│   │   ├── manifest.mjs               # GET /sep/manifest
│   │   ├── query.mjs                  # POST /sep/query
│   │   ├── browse.mjs                 # GET /sep/browse (if supported)
│   │   └── telemetry.mjs             # POST /sep/telemetry
│   ├── query-engine/
│   │   ├── matcher.mjs                # Match intent against index
│   │   ├── ranker.mjs                 # Rank results by relevance
│   │   ├── arc-suggester.mjs          # Suggest session arc ordering
│   │   └── state-manager.mjs          # Handle stateful sessions
│   └── lib/
│       └── config.mjs
├── tests/
│   ├── query.test.mjs
│   ├── matcher.test.mjs
│   └── fixtures/
└── Dockerfile                         # Optional containerized deployment
```

### 9.3 Guardrails — Published Standards

Good Vibes publishes its content filter logic openly. Transparency is credibility.

**Explicit Exclusions:**

- Graphic violence or gore
- Pornography or sexually explicit content
- Content promoting self-harm or suicide
- Extreme degradation or humiliation
- Targeted harassment
- Recruitment for extremist ideologies

**Soft Filters (configurable by user):**

- Inflammatory political content (default: reduced weight, not excluded)
- Profanity-heavy content (default: allowed, user can filter)
- Gambling/crypto promotion (default: reduced weight)
- Sponsored content / native ads (default: allowed, tagged as such)

**Important:** The guardrails define what Good Vibes curates. The protocol (SEP) itself has no content opinions. Another provider could implement SEP with completely different guardrails. That's by design.

### 9.4 Content Ingestion Schedule

Good Vibes continuously enriches new content:

- **Daily:** Fetch trending/new videos from target categories via YouTube API
- **Weekly:** Re-enrich a sample of existing records against latest taxonomy
- **On-demand:** Accept content URL submissions from users for enrichment
- **Lazy:** Re-enrich on-access when a record's schema version is outdated

---

## 10. Phase 3: Consumer PAE

### 10.1 What It Is

The Personal Algorithm Engine is the consumer's brain. It sits between the SEP protocol layer and the user interface. It:

- Sends intent queries to providers
- Receives enriched payloads
- Applies user-defined weights and filters
- Composes session arcs
- Tracks engagement signals
- Refines preferences over time
- Manages multi-source composition

### 10.2 PAE Architecture

```
consumer/
├── package.json
├── src/
│   ├── pae.mjs                        # Main PAE engine
│   ├── profile/
│   │   ├── preferences.mjs            # User weight/filter configuration
│   │   ├── history.mjs                # Session history (local only)
│   │   └── learning.mjs               # Preference refinement over time
│   ├── composer/
│   │   ├── session-builder.mjs        # Compose session arcs
│   │   ├── arc-templates.mjs          # Pre-defined arc patterns
│   │   └── rhythm-engine.mjs          # Pacing and transition logic
│   ├── sep-client/
│   │   ├── client.mjs                 # SEP protocol client
│   │   ├── negotiator.mjs             # Exchange model negotiation
│   │   └── multi-source.mjs           # Query multiple providers
│   ├── enrichment/
│   │   ├── behavior-interpreter.mjs   # Interpret user engagement signals
│   │   └── preference-updater.mjs     # Update weights from behavior
│   └── lib/
│       ├── storage.mjs                # Local preference/history storage
│       └── config.mjs
├── tests/
│   ├── pae.test.mjs
│   ├── composer.test.mjs
│   └── fixtures/
└── default-profiles/
    ├── morning-warrior.json           # Pre-built: high energy, fitness + motivation
    ├── evening-wind-down.json         # Pre-built: calm, craft + relaxation
    ├── skill-sprint.json              # Pre-built: focused learning
    └── good-vibes-default.json        # Good Vibes recommended baseline
```

### 10.3 Default Profiles

To solve the cold-start problem, Good Vibes ships with pre-built PAE profiles:

- **Morning Warrior** — Fitness-heavy, motivation peaks, ends with pump-up music
- **Evening Wind-Down** — Craft, nature, relaxation, minimal cognitive load
- **Skill Sprint** — 80% skill-building, minimal entertainment, high focus
- **Sunday Scroll** — Balanced across all categories, longer session, more randomness
- **Good Vibes Default** — The recommended starting point, balanced and designed to introduce users to the PAE concept

Users start with a default profile and customize from there. The PAE learns from their behavior and suggests adjustments.

### 10.4 Multi-Source Composition

The PAE can query multiple providers simultaneously:

```
Provider: Good Vibes → fitness, motivation, humor (enriched, guardrailed)
Provider: PodcastIndex → podcast metadata (enriched)
Provider: User's own stream → bookmarked/saved content

PAE merges all payloads → applies unified weights → composes single session arc
```

This is where the protocol pays off — any SEP-compliant provider can plug in.

---

## 11. Phase 4: The Shell

### 11.1 What It Is

The consumer shell is the user-facing interface. It is:

- Local-first (runs on user's machine)
- Lightweight (not a browser, not an OS replacement)
- Self-hostable (optional cloud component for sync)
- Pluggable (agents can install and configure it)

### 11.2 Shell Capabilities

- Render composed session arcs (video player, podcast player, music player)
- Display PAE configuration UI (weights, filters, session rules)
- Show session progress and rhythm visualization
- Provide "put the phone down" signals (session complete indicators)
- Manage multiple provider connections
- Expose local API for agent integration

### 11.3 Technology (TBD)

The shell technology is a Phase 4 decision. Options:

- **Electron app** — Cross-platform desktop, full Node.js backend
- **Tauri app** — Lighter weight, Rust backend, web frontend
- **Progressive Web App** — Browser-based but installable, no app store dependency
- **Terminal UI** — Minimal, developer-focused (could be a Phase 3.5 prototype)

Paul's preference is local-first, not browser-extension dependent. This rules out Chrome extension as the primary form factor. A lightweight desktop app (Tauri or Electron) or a self-hosted web app accessed via localhost are the most likely candidates.

### 11.4 Shell is NOT Phase 1

The shell is the last thing built. The enrichment pipeline, provider, and PAE all work headless (API-driven, scriptable) before the shell exists. An early prototype might just be a CLI tool or a simple localhost web page.

---

## 12. Implementation Details

### 12.1 Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Enrichment Pipeline | Node.js 20 | Consistent with AIP stack |
| LLM Tagging | Claude Haiku (Anthropic API) | Cheapest capable model |
| Local Storage | SQLite | Zero-config, portable, sufficient for local index |
| Cloud Storage | DynamoDB (optional) | If hosting provider as a service |
| Provider Server | Node.js (vanilla, no frameworks) | Consistent conventions |
| Consumer PAE | Node.js | Consistent, can run local or embedded |
| Schemas | JSON Schema | Industry standard, validated programmatically |
| Tests | Node.js built-in test runner | Zero dependencies |

### 12.2 Conventions (Matching AIP)

- **No frameworks** — Vanilla Node.js. No Express, no React, no Next.
- **No build step** — Run directly with Node.js
- **ES Modules** — `.mjs` extension, `import/export`
- **Storage abstraction** — Adapter pattern. `STORAGE=local` for SQLite, `STORAGE=dynamodb` for cloud.
- **Environment variables** — All config via env vars
- **Consistent error format** — `{ "error": "message", "code": "ERROR_CODE" }`

### 12.3 LLM Tagging Prompt Design

The enrichment pipeline's quality depends entirely on the LLM tagging prompt. This prompt must be:

- Deterministic (same input → consistent output)
- Schema-aware (output matches JSON schema exactly)
- Taxonomy-aware (categories and emotions are from the defined set)
- Efficient (minimal tokens for cost control)

Example tagging prompt structure:

```
You are a content tagger for the Good Vibes enrichment pipeline.

Given the following content metadata, produce a JSON enrichment envelope.

TAXONOMY:
Categories: [fitness, nutrition, skill_building, humor, motivation, craft, stoicism, fatherhood, entrepreneurship, music, nature, relaxation]
Emotional tones: [calm, focused, energized, amused, inspired, reflective]
Boolean flags: [rage_bait, humiliation, shock_content, inflammatory, sexually_explicit, violence]
Scores (0.0-1.0): [energy_level, cognitive_load, motivation_score, humor_score, skill_transfer_score, production_quality]
Session fit (boolean): [good_opener, good_builder, good_peak, good_closer]

CONTENT:
Title: {title}
Description: {description}
Tags: {tags}
Duration: {duration}
Transcript excerpt: {transcript_first_500_chars}

Respond with ONLY the JSON enrichment object. No explanation.
```

### 12.4 YouTube API Key Management

- Obtain YouTube Data API v3 key via Google Cloud Console
- Store in environment variable `YOUTUBE_API_KEY`
- Implement quota tracking (10,000 units/day default)
- Batch requests to maximize efficiency
- Cache responses to avoid redundant API calls

---

## 13. Domain & Branding

### 13.1 Domain (TBD)

Candidates:

- `goodvibes.app` — Clean, memorable, `.app` enforces HTTPS
- `goodvibes.dev` — Developer-focused
- `mygoodvibes.com` — If `goodvibes.com` is taken
- Custom domain TBD

### 13.2 GitHub Organization

TBD — Options:

- `github.com/good-vibes-app`
- `github.com/good-vibes-pae`
- Monorepo under Paul's existing GitHub org

### 13.3 Branding

- **Tone:** Warm, encouraging, not preachy. Not anti-tech. Pro-human.
- **Colors:** Warm palette. Not clinical blue. Think sunrise energy.
- **Logo:** Simple mark suggesting positive energy / upward momentum
- **Typography:** Clean, modern, readable

### 13.4 Positioning

**Not:** "Big Tech is evil."
**Not:** "Decentralize everything."
**Not:** "Web3 for your feed."

**Yes:** "Own your scroll. Own your mind."
**Yes:** "Algorithms should serve you."
**Yes:** "Design your cognitive environment."

---

## 14. Testing Strategy

### 14.1 Enrichment Pipeline Tests

**Unit Tests:**
- LLM tagger returns valid schema for known inputs
- Guardrail filter correctly rejects excluded content
- Taxonomy matching produces expected categories
- Schema validator catches malformed enrichment envelopes

**Integration Tests:**
- Full pipeline: YouTube API → enrichment → storage → retrieval
- Re-enrichment at new schema version preserves old data
- Batch processing handles API rate limits gracefully

**Quality Tests:**
- Sample 100 enriched records, manually verify tag accuracy
- Compare LLM tagging consistency across similar content
- Measure inter-run consistency (same input → same tags)

### 14.2 Provider Tests

**Unit Tests:**
- Query matcher returns relevant results for intent vectors
- Ranker ordering matches expected relevance
- Arc suggester produces valid session structures
- State token generation/validation

**Integration Tests:**
- Full SEP exchange: manifest → query → response
- Stateful session continuity across multiple queries
- Telemetry ingestion and processing

### 14.3 Consumer PAE Tests

**Unit Tests:**
- Weight application produces correct content ordering
- Filter exclusion works across all filter types
- Session arc composition follows template rules
- Behavior interpreter correctly adjusts weights

**Integration Tests:**
- Multi-source composition merges payloads correctly
- Profile save/load/update cycle
- Default profile initialization

---

## 15. Project Management

### 15.1 Build Order (Phase 1 Detail)

Phase 1 is the foundation. Everything else depends on it.

**Step 1: JSON Schemas**
Define all SEP message schemas. Validate with test fixtures.

**Step 2: Taxonomy Definition**
Define initial categories, emotions, scoring dimensions. Document in `taxonomy/`.

**Step 3: YouTube Source Adapter**
Connect to YouTube Data API v3. Fetch search results and video details.

**Step 4: LLM Tagger**
Build the Haiku-based tagging pipeline. Test with known content.

**Step 5: Guardrails Filter**
Implement ethical filter with published rules.

**Step 6: Storage Layer**
SQLite adapter for local index. Store enriched records.

**Step 7: Seed Script**
Run seeding across all target categories. Build initial 10,000-record index.

**Step 8: Validation & Quality Check**
Sample and manually verify enrichment quality. Iterate on taxonomy and prompts.

**Step 9: Provider Stub**
Basic SEP endpoint that serves enriched records from the index. This bridges into Phase 2.

**Step 10: Documentation**
Protocol spec on GitHub Pages. Taxonomy reference. Getting started guide.

### 15.2 Phase 2-4 Build Order (Summary)

**Phase 2:**
1. Provider query engine (matcher, ranker, arc suggester)
2. SEP endpoint server (manifest, query, browse, telemetry)
3. Guardrails publication page
4. Continuous enrichment scheduler

**Phase 3:**
1. PAE engine (weights, filters, session rules)
2. Session arc composer
3. SEP client (query providers, negotiate exchange model)
4. Multi-source composition
5. Behavior interpreter
6. Default profiles
7. Extract SEP as standalone spec

**Phase 4:**
1. Technology selection (Electron/Tauri/PWA)
2. Session player UI
3. PAE configuration UI
4. Multi-provider management
5. Agent integration API

### 15.3 What Open Claw Builds

Open Claw receives this requirements document and builds Phase 1 in its entirety:

- JSON schemas (all 5 message types)
- Enrichment pipeline (YouTube source adapter, LLM tagger, guardrails, storage)
- Taxonomy definitions
- Seed script
- Test suite
- GitHub Pages documentation
- Provider stub endpoint

This is a single repo (`good-vibes/`) with clean separation between `spec/`, `enrichment/`, `provider/`, and `docs/`.

---

## 16. Open Decisions

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | Project domain name | OPEN | Need to check availability |
| 2 | GitHub org name | OPEN | Depends on domain choice |
| 3 | YouTube API quota strategy | OPEN | May need to request quota increase |
| 4 | Shell technology (Phase 4) | DEFERRED | Electron vs Tauri vs PWA |
| 5 | Cloud hosting for provider | DEFERRED | Could run on same AWS infra as AIP |
| 6 | Monetization model | DEFERRED | Subscription? Donation? Public benefit? |
| 7 | Content source priority after YouTube | DEFERRED | Podcasts? RSS? TikTok API? |
| 8 | Provider-as-a-service vs self-host-only | DEFERRED | Phase 2 decision |

---

## 17. Future Backlog

Items explicitly deferred beyond Phase 4:

- [ ] Additional source adapters (TikTok, Instagram, Spotify, RSS)
- [ ] Community-contributed taxonomy extensions
- [ ] SEP certification registry (like AIP certification)
- [ ] Mobile app (iOS/Android)
- [ ] Browser extension (complementary, not primary)
- [ ] Social features (share sessions, share profiles)
- [ ] Creator tools (self-tag content for SEP compatibility)
- [ ] Enterprise version (workplace content curation)
- [ ] Internet 4.0 white paper / manifesto
- [ ] Integration with AIP (agent discovers Good Vibes via AIP protocol)
- [ ] Multi-language taxonomy and content support
- [ ] Music-specific enrichment (BPM, mood, genre for session soundtracks)
- [ ] Parental controls variant (kid-safe BYOA)
- [ ] Academic research partnerships (algorithmic influence studies)
- [ ] Open source community governance model

---

## Summary

| Component | What It Is | Phase |
|-----------|-----------|-------|
| SEP Spec | Protocol schemas defining stream exchange | 1 |
| Enrichment Service | LLM pipeline: raw metadata → tagged SEP envelopes | 1 |
| Good Vibes Provider | Opinionated, guardrailed SEP stream provider | 2 |
| Consumer PAE | User-owned algorithm engine with weights, filters, arcs | 3 |
| Consumer Shell | Local-first UI for consuming composed sessions | 4 |

**Core Principle:** Enrichment is perception. Good Vibes is judgment. The PAE is sovereignty. The shell is experience.

**North Star:** A man opens his app at 5 AM. His Personal Algorithm Engine has composed a 15-minute session: two funny clips to warm up, three fitness videos for focus, one motivational piece for intensity, and a pump-up track to close. He didn't choose each video. He chose the algorithm. He chose himself.

**End state:** The user controls the algorithm. The algorithm serves the user. The content flows from wherever it lives. The protocol makes it possible. The enrichment makes it intelligent. Good Vibes makes it good.

---

*This document is the authoritative requirements source for the Good Vibes project. All implementation decisions should reference this document. Updates should be versioned and dated.*
