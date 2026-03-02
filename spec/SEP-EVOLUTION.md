# SEP Evolution — From v0.1 to v1.0

## Where We Are

SEP v0.1.0 defines a clean meta-first exchange between providers and consumers. It works. But it's a closed loop — one provider, one consumer, no money, no identity, no peer relationships. This document maps the protocol evolution needed to support the real world.

---

## The Missing Layers

The current spec handles **content discovery**. The real world also needs:

1. **Authentication & Authorization** — Who are you? What can you access?
2. **Monetization** — How do providers sustain themselves?
3. **Peer Exchange** — What happens when both sides are producers AND consumers?
4. **Stream Types** — What else flows through SEP besides content metadata?
5. **Identity** — Who are the participants, and how do they prove it?

These aren't separate protocols. They're extensions of SEP. The genius of keeping SEP meta-first is that all of these are *also* meta — keys, tokens, payment receipts, peer capabilities — they're all structured data exchanged between participants.

---

## 1. Authentication: API Keys & Access Tiers

### The Problem

Right now, SEP has no concept of "who's asking." Every consumer is anonymous. This works for a free, open index. It doesn't work when:

- A provider has operating costs and needs revenue
- Different consumers should see different content (premium vs. free)
- Rate limits need to be per-consumer, not per-IP
- A provider wants to reward high-quality telemetry contributors

### The Design

Add an optional `authentication` block to the **Consumer Intent** schema:

```json
{
  "sep_version": "0.2.0",
  "consumer_id": "consumer-abc-123",
  "authentication": {
    "method": "api_key",
    "credential": "gv_live_sk_...",
    "tier": "pro"
  },
  "intent": { ... }
}
```

And a corresponding `access_tiers` declaration to the **Provider Manifest**:

```json
{
  "provider_id": "good-vibes-main",
  "access_tiers": [
    {
      "tier_id": "free",
      "description": "Community tier — rate limited, standard enrichment",
      "rate_limit": { "requests_per_minute": 10, "daily_cap": 100 },
      "features": ["curated_payload"],
      "max_payload_size": 25,
      "requires_auth": false
    },
    {
      "tier_id": "pro",
      "description": "Pro tier — higher limits, full index browse, priority enrichment",
      "rate_limit": { "requests_per_minute": 60, "daily_cap": 5000 },
      "features": ["curated_payload", "full_index_browse", "negotiated", "priority_enrichment"],
      "max_payload_size": 100,
      "requires_auth": true,
      "auth_methods": ["api_key"]
    },
    {
      "tier_id": "partner",
      "description": "Partner tier — unlimited, webhook notifications, raw enrichment access",
      "rate_limit": null,
      "features": ["*"],
      "requires_auth": true,
      "auth_methods": ["api_key", "oauth2", "sep_identity"]
    }
  ]
}
```

### Design Principles

- **Authentication is always optional at the protocol level.** SEP does not require auth. Individual providers choose whether to require it.
- **The manifest declares what's available.** Consumers know before they query whether auth is needed and what tiers exist.
- **Multiple auth methods.** API keys are simplest. OAuth2 for integrations. `sep_identity` (see section 5) for decentralized identity.
- **Tier-based, not binary.** Not just "authenticated or not" — graduated access with clear feature differences.
- **Free tier is always possible.** The protocol encourages providers to offer a free tier. Good Vibes specifically should always have a free community tier.

### Good Vibes Monetization Model

```
Free (no key):     10 req/min, 100/day, curated payloads only, 25 items max
Pro ($9/mo):       60 req/min, 5000/day, full index browse, 100 items, priority enrichment
Partner (custom):  Unlimited, webhooks, raw enrichment data, white-label rights
```

This pays infrastructure bills. It's transparent. The free tier is genuinely useful — a single user running their own PAE probably never hits 100 requests/day. The pro tier is for power users and small apps building on top of Good Vibes. The partner tier is for other providers or platforms that want to integrate.

---

## 2. Monetization: The Value Exchange Framework

### Beyond API Keys

API keys handle "pay for access." But SEP enables richer monetization models that align incentives properly.

### Model A: Subscription Access (API Key)

Provider charges a flat fee for tiered access. Consumer gets a key. Simple.

```
Consumer pays $9/mo → gets API key → accesses Pro tier
```

**Who benefits:** Provider (revenue), Consumer (more content, higher limits)

### Model B: Telemetry-for-Access Exchange

Consumer shares high-quality engagement telemetry in exchange for reduced pricing or higher tier access. This is opt-in and explicit.

Add to the **Provider Manifest**:

```json
{
  "telemetry_exchange": {
    "enabled": true,
    "offers": [
      {
        "telemetry_level": "full_session",
        "reward": "tier_upgrade",
        "upgrade_to": "pro",
        "description": "Share full session telemetry and get Pro tier access for free"
      },
      {
        "telemetry_level": "aggregated_weekly",
        "reward": "discount",
        "discount_percent": 30,
        "description": "Share weekly aggregated data for 30% off Pro"
      }
    ]
  }
}
```

**Who benefits:** Provider (better data to improve enrichment), Consumer (free/cheaper access)

**Critical guardrail:** The consumer's PAE must clearly surface what data is being shared and what they're getting in return. No dark patterns. No "agree to everything" checkboxes. The telemetry schema already supports granular control — this extends it with explicit incentives.

### Model C: Ad-Supported Streams

A provider can include sponsored content within its payload, clearly tagged. The consumer's PAE decides whether to include it.

Add to the **Enrichment Envelope**:

```json
{
  "enrichment": { ... },
  "sponsorship": {
    "is_sponsored": true,
    "sponsor": "BrandName",
    "sponsor_category": "fitness_equipment",
    "disclosure": "Paid promotion by BrandName",
    "consumer_reward": {
      "type": "credit",
      "amount": 0.02,
      "currency": "USD",
      "description": "You earn $0.02 for viewing this sponsored item"
    }
  }
}
```

**Key difference from current ad models:** The consumer *knows* it's an ad. The consumer *chooses* to include ads. The consumer *gets paid* for their attention. The provider gets ad revenue. The advertiser gets a willing, engaged audience (far more valuable than an annoyed, captive one).

**Who benefits:** Everyone, but only because consent is real and transparent.

### Model D: Creator Tips / Micropayments

When a consumer "loves" content, they can optionally tip the creator through the provider.

Add to the **Telemetry** schema:

```json
{
  "telemetry": {
    "session_id": "...",
    "items": [
      {
        "item_id": "...",
        "tip": {
          "amount": 0.50,
          "currency": "USD",
          "method": "provider_balance",
          "message": "This was exactly what I needed today"
        }
      }
    ]
  }
}
```

The provider handles the payment rail. This is a natural extension of telemetry — "I liked this so much I want to pay for it."

### The Revenue Stack

A healthy provider like Good Vibes might monetize through multiple channels:

```
┌─────────────────────────────────────────────┐
│           Good Vibes Revenue Stack          │
├─────────────────────────────────────────────┤
│  1. Pro subscriptions         │ Predictable │
│  2. Telemetry exchange value  │ Data asset  │
│  3. Sponsored content margins │ Per-view    │
│  4. Creator tip processing    │ Small %     │
│  5. Partner/white-label fees  │ Enterprise  │
└─────────────────────────────────────────────┘
```

None of these require surveillance. None require behavioral manipulation. All are transparent and consensual.

---

## 3. Peer Exchange: When Everyone Is Both

### The Insight

SEP currently has two roles: Provider and Consumer. But what happens when a user is both?

- A fitness creator produces content AND consumes content
- A curator builds playlists (provider behavior) AND watches content (consumer behavior)
- Two friends want to share their "Good Vibes sessions" with each other
- A community wants a shared stream that members contribute to and consume from

### Peer Capabilities Declaration

Introduce a **Peer Manifest** — a combined provider+consumer capability document:

```json
{
  "sep_version": "0.2.0",
  "peer_id": "peer-paul-abc123",
  "peer_type": "individual",
  "capabilities": {
    "can_provide": true,
    "can_consume": true,
    "provides": {
      "content_types": ["playlist", "curation"],
      "stream_types": ["content_meta", "recommendations"],
      "max_payload_size": 50,
      "guardrails": {
        "published": true,
        "inherits_from": "good-vibes-main"
      }
    },
    "consumes": {
      "supported_models": ["curated_payload", "negotiated"],
      "disclosure_level_default": "minimal",
      "telemetry_default": false
    }
  },
  "discovery": {
    "public": false,
    "discoverable_by": ["contacts", "mutual_peers"],
    "invite_required": true
  }
}
```

### P2P Exchange Flows

**Playlist Sharing:**
```
Paul creates a "Morning Warrior" session → loved 8 items
Paul exports session as a SEP payload (provider behavior)
Paul shares payload link with friend (P2P exchange)
Friend's PAE imports payload → applies own weights → composes own arc
```

**Live Co-Watching (Future):**
```
Paul and friend establish P2P SEP channel
Both peers share their current playback state
Sync protocol keeps them watching together
Chat/reactions flow as a SEP stream type
```

**Community Streams:**
```
Community members each curate content (provider behavior)
Community PAE aggregates across member contributions
Community stream serves as a "meta-provider" to its members
Members consume with their own PAE weights applied on top
```

### P2P is Just Two Providers Talking

The beautiful thing: **P2P doesn't require new protocol mechanics.** Each peer is a provider (publishing a manifest, serving payloads) and a consumer (sending intents, receiving payloads). The manifest already supports capability declaration. The intent already supports disclosure levels. Telemetry already supports engagement signals.

What's new:
- **Peer discovery** — How do peers find each other? (Invite links, contact graphs, public directories)
- **Bi-directional state** — Both sides have state tokens; the exchange is symmetric
- **Stream multiplexing** — Multiple stream types over one connection (content + chat + reactions)
- **Presence** — Is the other peer online? Available? In a session?

---

## 4. Stream Types: Beyond Content Meta

### The Principle

SEP is "Stream Exchange Protocol" — not "Content Metadata Exchange Protocol." A stream can carry anything structured. The meta-first principle still applies: streams carry structured data about things, not the things themselves.

### Stream Type Registry

Add a `stream_type` field to exchanges:

```json
{
  "stream_types": {
    "content_meta": {
      "description": "Enriched content metadata (current SEP)",
      "version": "0.1.0",
      "status": "stable"
    },
    "recommendations": {
      "description": "Curated recommendation lists from peers or providers",
      "version": "0.1.0",
      "status": "stable"
    },
    "engagement_signals": {
      "description": "Real-time engagement signals (likes, reactions)",
      "version": "0.1.0",
      "status": "draft"
    },
    "chat": {
      "description": "Text messages between peers in a session context",
      "version": "0.1.0",
      "status": "future"
    },
    "payments": {
      "description": "Payment receipts, tip confirmations, subscription events",
      "version": "0.1.0",
      "status": "future"
    },
    "identity_attestation": {
      "description": "Identity proofs and trust signals between peers",
      "version": "0.1.0",
      "status": "future"
    },
    "session_state": {
      "description": "Shared session state for co-watching or collaborative curation",
      "version": "0.1.0",
      "status": "future"
    }
  }
}
```

### How This Works

The **Provider Manifest** already declares `supported_content_types`. Extend this to `supported_stream_types`:

```json
{
  "provider_id": "good-vibes-main",
  "supported_stream_types": ["content_meta", "recommendations"],
  "supported_content_types": ["video", "podcast", "music", "article"]
}
```

Each stream type has its own envelope schema, but all share the SEP framing (version, IDs, auth, disclosure). The protocol is the pipe; the stream type defines what flows through it.

### Why This Matters

This is how SEP becomes a **general-purpose sovereign exchange protocol** — not just a content recommendation system. Payments flow through the same channel as content. Chat flows alongside sessions. Identity attestations use the same trust model.

The protocol's value increases with each stream type it supports, but each type remains optional. A simple content provider only needs `content_meta`. A full social platform implements everything.

---

## 5. Identity: Decentralized but Practical

### The Problem

SEP needs identity for auth, for P2P, for payments, for trust. But centralized identity (everyone registers with Good Vibes) defeats the purpose.

### The Design: Layered Identity

```
Layer 0: Anonymous          — No identity. Free tier. IP-based rate limiting.
Layer 1: API Key            — Provider-issued. Simple. Centralized per-provider.
Layer 2: SEP Identity       — Self-issued keypair. Decentralized. Portable.
Layer 3: Verified Identity  — SEP Identity + attestations from trusted parties.
```

### SEP Identity (Layer 2)

A consumer or peer generates a keypair. The public key IS their identity. No registration required.

```json
{
  "sep_identity": {
    "public_key": "ed25519:base64...",
    "display_name": "Paul",
    "created_at": "2026-02-28T00:00:00Z",
    "attestations": []
  }
}
```

- **Self-sovereign:** No one issues it. You generate it. You own it.
- **Portable:** Works with any SEP provider. Not locked to Good Vibes.
- **Pseudonymous:** Your public key is your identity. You choose what name to display.
- **Attestable:** Others can vouch for you (provider attestation, peer attestation, domain verification).

### Attestations

```json
{
  "attestations": [
    {
      "type": "provider_verified",
      "issuer": "good-vibes-main",
      "issued_at": "2026-03-01T00:00:00Z",
      "claims": ["paying_customer", "telemetry_contributor"],
      "signature": "..."
    },
    {
      "type": "peer_vouched",
      "issuer": "ed25519:base64...",
      "issued_at": "2026-03-15T00:00:00Z",
      "claims": ["known_person"],
      "signature": "..."
    },
    {
      "type": "domain_verified",
      "domain": "paulscode.dev",
      "proof": "dns_txt_record",
      "verified_at": "2026-04-01T00:00:00Z"
    }
  ]
}
```

### Why Not Just Use OAuth/OIDC?

OAuth works for "sign in with Google." It doesn't work for "I am a sovereign participant in a decentralized protocol." SEP Identity is:

- **Provider-agnostic:** Not tied to any OAuth provider
- **Self-issued:** No registration step
- **Portable:** Same identity across all SEP providers and peers
- **Attestable:** Build trust over time through verifiable claims

But SEP also supports OAuth as an auth method (Layer 1). Pragmatism over purity.

---

## 6. Consumer Meta Ownership & Sharing

### The Principle

Consumers own their meta. This includes:
- Their preference weights and filter configurations
- Their session history and engagement patterns
- Their learned taste profile
- Their curated playlists and exported sessions

This data **never leaves the consumer's machine unless they choose to share it.**

### Sharing Models

```
┌──────────────────────────────────────────────────────────┐
│                 Consumer Meta Sharing                     │
├───────────────┬──────────────────────────────────────────┤
│ Private       │ Default. Data stays on device.           │
│               │ Provider sees only per-request intent.   │
├───────────────┼──────────────────────────────────────────┤
│ Telemetry     │ Opt-in. Aggregated engagement data       │
│ Exchange      │ shared with provider for better recs     │
│               │ or tier upgrade. Consumer controls       │
│               │ granularity.                             │
├───────────────┼──────────────────────────────────────────┤
│ Profile Share │ Consumer exports taste profile as a      │
│               │ portable SEP document. Can share with    │
│               │ peers, other providers, or publicly.     │
│               │ "Here's what I like — surprise me."      │
├───────────────┼──────────────────────────────────────────┤
│ Ad-Supported  │ Consumer opts into receiving sponsored   │
│               │ content. Shares interest categories      │
│               │ (not behavior) with ad-enabled providers.│
│               │ Gets paid per sponsored view.            │
├───────────────┼──────────────────────────────────────────┤
│ Community     │ Consumer contributes taste signal to a   │
│ Contribution  │ community stream. Individual identity    │
│               │ is optional — can be anonymous aggregate.│
└───────────────┴──────────────────────────────────────────┘
```

### Portable Taste Profile

```json
{
  "sep_version": "0.2.0",
  "profile_type": "taste_export",
  "exported_at": "2026-03-15T00:00:00Z",
  "identity": "ed25519:base64... (optional)",
  "taste": {
    "weights": {
      "fitness": 0.8,
      "humor": 0.6,
      "stoicism": 0.5,
      "craft": 0.4
    },
    "preferred_energy_range": [0.3, 0.8],
    "preferred_tones": ["energized", "inspired", "calm"],
    "excluded_flags": ["rage_bait", "shock_content"],
    "preferred_session_length_minutes": 20,
    "preferred_arc_template": "standard"
  },
  "sharing_permissions": {
    "use_for_recommendations": true,
    "use_for_ads": false,
    "share_with_peers": true,
    "share_with_providers": ["good-vibes-main"],
    "anonymize": true
  }
}
```

---

## 7. Governance: Protocol vs. Provider

### The Distinction

**SEP (the protocol)** has no opinions about content, monetization, or governance. It's a pipe. Like HTTP doesn't care what website you visit.

**Good Vibes (a provider)** has strong opinions. It curates for cognitive flourishing. It publishes guardrails. It has a business model.

This distinction must be maintained as the ecosystem grows.

### Protocol Governance

SEP itself should be governed as an open standard:

- **Specification repository** — Public, version-controlled, accepting contributions
- **RFC process** — Proposed changes go through public review
- **Reference implementations** — Multiple, in multiple languages
- **Test suite** — Conformance tests for providers and consumers
- **No single owner** — The protocol belongs to the community

### Possible Organizational Structures

| Structure | Pros | Cons |
|-----------|------|------|
| **Non-profit foundation** | Clear mission, tax benefits, community trust | Slow decision-making, fundraising overhead |
| **DAO** | Decentralized governance, token-aligned incentives | Complexity, regulatory uncertainty, speculation risk |
| **Open standard body** (like W3C) | Legitimacy, industry participation | Bureaucratic, expensive |
| **Benevolent dictator + community** | Fast decisions, clear vision | Bus factor, trust concentration |
| **Hybrid: Non-profit protocol + For-profit provider** | Clean separation, sustainable | Requires discipline to maintain separation |

### Recommended: Hybrid Model

```
┌─────────────────────────────────────────┐
│    SEP Foundation (non-profit / DAO)    │
│    Owns: Protocol spec, test suites,    │
│    reference implementations, domain    │
│    Governed by: Community contributors  │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────┐  │
│  │Good Vibes│  │Provider B│  │Peer X│  │
│  │(for-prof)│  │(non-prof)│  │(ind.)│  │
│  └──────────┘  └──────────┘  └──────┘  │
│                                         │
│  Each implements SEP independently.     │
│  Each has own business model.           │
│  Each has own content opinions.         │
└─────────────────────────────────────────┘
```

Good Vibes can be a for-profit (or non-profit, or DAO) that implements SEP and charges for its curation quality and infrastructure. The protocol itself remains free and open.

---

## 8. Schema Evolution Roadmap

### v0.1.0 (Current) — Foundation
- Enrichment envelope, consumer intent, provider response, manifest, telemetry
- Three exchange models
- Privacy architecture with disclosure levels
- ✅ Implemented and working

### v0.2.0 (Next) — Authentication & Monetization
- Add `authentication` block to consumer intent
- Add `access_tiers` to provider manifest
- Add `telemetry_exchange` offers to manifest
- Add `sponsorship` block to enrichment envelope (optional)
- Add `stream_type` field to all exchanges
- Spec status: **Ready to draft**

### v0.3.0 — Peer Exchange
- Peer manifest schema
- Bi-directional state tokens
- Peer discovery mechanisms
- Session sharing / export format
- Portable taste profile schema
- Spec status: **Design phase**

### v0.4.0 — Identity & Trust
- SEP Identity (self-issued keypair)
- Attestation framework
- Provider verification
- Peer vouching
- Domain verification
- Spec status: **Future**

### v0.5.0 — Stream Multiplexing
- Multiple stream types over single connection
- Chat stream type
- Real-time engagement stream
- Session state sync (co-watching)
- Spec status: **Future**

### v1.0.0 — Stable Release
- All core schemas finalized
- Multiple reference implementations
- Conformance test suite
- Formal specification document
- Community governance established
- Spec status: **Target**

---

## 9. What Good Vibes Builds vs. What SEP Defines

| Concern | SEP Protocol | Good Vibes Provider |
|---------|-------------|-------------------|
| Content opinions | None | Strong (cognitive flourishing) |
| Guardrails | Schema for declaring them | Published, opinionated guardrails |
| Pricing | Schema for access tiers | Specific price points |
| Auth method | Supports multiple | Starts with API keys |
| Identity | Defines SEP Identity spec | Implements it |
| Monetization | Defines exchange models | Chooses subscription + telemetry exchange |
| Ad support | Defines sponsorship schema | May offer ethically tagged sponsored content |
| Governance | Open standard, community | For-profit or non-profit entity |
| P2P | Defines peer exchange | May or may not support P2P |

Good Vibes is the **opinionated reference implementation.** SEP is the **unopinionated protocol.**

The value of Good Vibes is curation quality, enrichment intelligence, and community trust. The value of SEP is interoperability, sovereignty, and ecosystem growth. Both reinforce each other.

---

## 10. Revenue Sustainability Analysis

### The Hard Math

At scale, Good Vibes costs money to run:

| Cost | At 10K users | At 100K users | At 1M users |
|------|-------------|---------------|-------------|
| LLM enrichment (Haiku) | ~$50/mo | ~$500/mo | ~$5,000/mo |
| Infrastructure (servers, DB) | ~$100/mo | ~$500/mo | ~$3,000/mo |
| YouTube API (paid tier) | ~$0 | ~$200/mo | ~$1,000/mo |
| Bandwidth | ~$20/mo | ~$200/mo | ~$2,000/mo |
| **Total** | **~$170/mo** | **~$1,400/mo** | **~$11,000/mo** |

### Revenue Needed

```
Break-even at 100K users: $1,400/mo
If 5% convert to Pro ($9/mo): 5,000 × $9 = $45,000/mo
Margin: $43,600/mo — healthy
```

Even at 1% conversion:
```
1,000 Pro users × $9 = $9,000/mo vs $1,400 cost = still viable
```

### The Non-Profit Path

If Good Vibes runs as a non-profit:
- Pro subscriptions fund infrastructure
- Telemetry exchange reduces costs (better enrichment = fewer re-enrichment runs)
- Grants for "algorithmic sovereignty" research
- Community contributions reduce engineering costs
- No investor pressure to extract maximum value

This is sustainable. The mission is not "make Paul rich." The mission is "pay the bills and spread the idea."

---

## 11. Syndication & Commerce Models

### The Two Syndication Directions

SEP supports two fundamentally different content distribution strategies. Both use the same protocol primitives. The difference is who initiates.

**Forward Syndication (Push Marketing)**
A producer finds consumers and publishes enrichment metadata directly to providers or Nostr relays. The producer's agent handles distribution — pushing content to YouTube, TikTok, Instagram, AND Web 4.0 providers simultaneously. The consumer streams media on demand from origin sources. This is the steady-state model once the ecosystem has critical mass.

**Reverse Syndication (Pull Marketing)**
A middle-man entity (itself both a producer and consumer, like Good Vibes) discovers quality content in the wild, enriches its metadata via the LLM pipeline, and serves it through its own provider endpoint. The content is never hosted — it's meta-first, pointing back to origin URLs. This is the aggressive growth strategy for launch.

```
Discover quality creators (low copyright risk, high potential, overlooked)
    → Index metadata via YouTube API / public feeds
    → Enrich with LLM pipeline (categories, tone, energy, session fit)
    → Serve enriched metadata through Good Vibes provider
    → Consumers engage → revenue flows to general pool
    → Contact creator: "Sign up to claim your share"
    → Creator joins syndication service → direct P2P from then on
```

### The Three Commerce Models

All three models work within SEP. The protocol doesn't dictate commerce — it enables it. The provider's governance protocol declares which models it supports.

**Model A: Direct Pay**

Consumer pays directly for content or products discovered through the algorithm:

*Tip/Support:* Consumer sends value directly to the creator. Payment flows through x402, Lightning Zaps, or Stripe. The provider facilitates the connection but doesn't take a cut (or takes a minimal processing fee). Products: Stanzas (books), Itzda (music), Good Vibes (creator tips), Open Shelf (marketplace).

*Product Purchase:* Consumer discovers a product through organically surfaced content at a transparent price. Consumer pays into escrow (1-3 day fulfillment window) OR registers interest and waits for producer fulfillment.

Add to the Telemetry schema:
```json
{
  "commerce_event": {
    "type": "direct_purchase",
    "item_id": "...",
    "amount": 29.99,
    "currency": "USD",
    "settlement": "escrow",
    "escrow_window_hours": 72,
    "producer_id": "...",
    "status": "pending_fulfillment"
  }
}
```

**Model B: Indirect Pay (Native Partnership)**

An influencer/creator naturally features a product in their content. In Web 4.0, this is a transparent partnership facilitated by agents, not a platform-brokered ad deal.

```
Creator content naturally links to a product
    → Enrichment pipeline tags the product reference
    → Consumer's algorithm surfaces the content organically
    → Consumer clicks through → purchase tracked
    → Revenue splits: creator + partner + provider margin
```

This is NOT traditional advertising because the consumer's algorithm decided to surface it, the partnership metadata is transparently tagged, and the consumer can set "no partnership content" in their PAE.

**Model C: Affiliate**

Good Vibes supports external affiliate programs as a pragmatic bridge to established commerce. The provider enriches content and links through to affiliate partners (YOMO, Amazon Associates, etc.).

```json
{
  "commerce": {
    "model": "affiliate",
    "affiliate_program": "yomo_v2",
    "affiliate_link": "https://yomo.app/p/...",
    "commission_rate": 0.08,
    "disclosure": "Affiliate link — provider earns commission on purchases"
  }
}
```

### The Escrow Pattern

All commerce models share a common escrow pattern:

```
Consumer signals purchase intent
    → Funds held in escrow (MoR — Stripe or equivalent)
    → Fulfillment window: 1-3 days (configurable)
    → Producer fulfills → funds released
    → Producer fails → funds returned to consumer
```

### Reverse Syndication: The Recruitment Escrow

The aggressive growth variant uses revenue as a recruitment tool:

1. Good Vibes indexes and enriches a creator's content (meta-first, never hosted)
2. Consumers engage with the enriched content
3. Revenue accumulates in a general pool
4. Good Vibes contacts the creator:
   - "Consumers loved your content. We generated $X in engagement revenue."
   - "Sign up for our syndication service + record a short promo for Good Vibes"
   - "We pay you a signing bonus of $X from our revenue pool"
5. Creator declines → revenue stays in pool, any direct consumer payments refunded
6. Creator accepts → direct P2P relationship going forward

Ethical framework: meta-first indexing means we reference, never host. The creator's content plays from its origin source. We add enrichment and curation value. If they don't want to participate, nothing was taken — their reputation is intact, their content is where it always was.

---

## Appendix A: Good Vibes API Key Spec (Draft)

```
Key format:  gv_{environment}_{type}_{random}
Examples:    gv_live_sk_abc123def456    (live secret key)
             gv_test_sk_xyz789ghi012    (test secret key)
             gv_live_pk_mno345pqr678    (live publishable key)

Environment: live | test
Type:        sk (secret, server-side) | pk (publishable, client-side)
Random:      24+ alphanumeric characters
```

Key management:
- Keys are issued via the Good Vibes dashboard (simple web UI)
- Keys can be rotated, revoked, and scoped
- Usage tracked per key (requests, bandwidth, tier)
- Test keys work against a sandbox with fixture data
- Rate limits enforced per key, not per IP

---

## Appendix B: Comparison to Existing Protocols

| Protocol | What It Does | How SEP Differs |
|----------|-------------|----------------|
| RSS/Atom | Syndicate content feeds | SEP adds semantic enrichment, consumer sovereignty, exchange models |
| ActivityPub | Federated social networking | SEP is content-focused, not social-graph-focused. Could complement. |
| AT Protocol (Bluesky) | Decentralized social | AT handles identity + social graph. SEP handles content curation + algorithmic control. |
| Nostr | Decentralized messaging/social | Nostr is event-based, minimal schema. SEP is richly typed, content-specialized. |
| IPFS | Decentralized file storage | IPFS stores data. SEP exchanges metadata about data. Complementary. |
| Lightning Network | Micropayments | Could be a payment rail for SEP tip/sponsorship flows. |

SEP is not competing with these. It's the **content curation and algorithmic sovereignty layer** that sits alongside or on top of them.

---

## Appendix C: The One-Sentence Pitch for Each Audience

- **Users:** "Own your scroll. Control what you see. Get paid for your attention."
- **Creators:** "Reach people who actually want your content, without paying an algorithm."
- **Developers:** "An open protocol for content exchange with semantic enrichment and consumer sovereignty."
- **Investors:** "The protocol layer for the post-algorithmic internet, with a reference implementation that already works."
- **Non-profit/Grant bodies:** "Infrastructure for algorithmic sovereignty and cognitive wellbeing in the attention economy."
