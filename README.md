# Good Vibes — Personal Algorithm Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![SEP Version](https://img.shields.io/badge/SEP-v0.1.0-green.svg)](spec/2026-02-28/)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-brightgreen.svg)](https://nodejs.org)

**Algorithmic sovereignty** — the user's right to control the signals that shape their mind.

Good Vibes is a Personal Algorithm Engine (PAE) that gives individuals control over the algorithms that shape their content consumption. Define your own content weights, emotional filters, session boundaries, and rhythm design. The system pulls content metadata from existing platforms, enriches it with LLM-powered semantic tagging, and composes personalized session arcs optimized for *your* goals — not an advertiser's.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CONSUMER SIDE                            │
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
│                         PROVIDER SIDE                            │
│                            │                                     │
│  ┌──────────────┐    ┌─────┴────────┐    ┌──────────────────┐   │
│  │ Content      │    │ Provider     │    │ Provider-Side    │   │
│  │ Source APIs  │───►│ Index        │◄───│ Enrichment       │   │
│  │ (YouTube,    │    │ (SQLite)     │    │ (Claude Haiku)   │   │
│  │  RSS, etc.)  │    └──────────────┘    └──────────────────┘   │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Guardrails Layer                                          │   │
│  │ - No violence, porn, self-harm, extreme degradation       │   │
│  │ - Published standards, transparent exclusion logic         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
good-vibes/
├── spec/2026-02-28/          # SEP JSON Schema definitions
├── enrichment/               # LLM enrichment pipeline
│   ├── src/
│   │   ├── pipeline.mjs      # Orchestrator
│   │   ├── sources/           # Platform adapters (YouTube)
│   │   ├── enrichers/         # LLM tagger, transcript, stubs
│   │   ├── guardrails/        # Ethical filter + rules
│   │   ├── store/             # SQLite storage
│   │   ├── taxonomy/          # Categories, emotions, scoring
│   │   └── lib/               # LLM client, validator, config
│   ├── scripts/               # Seeding, re-enrichment, stats
│   └── tests/                 # Test suite + fixtures
└── provider/                  # SEP-compliant HTTP server
    └── src/
        ├── server.mjs         # Vanilla Node.js HTTP server
        ├── handlers/           # Manifest, query, browse, telemetry
        └── query-engine/       # Matcher, ranker, arc suggester
```

## Quick Start — Enrichment Pipeline

```bash
cd enrichment
npm install

# Run tests (no API keys needed)
npm test

# Seed from YouTube (requires API keys)
export YOUTUBE_API_KEY=your-youtube-key
export ANTHROPIC_API_KEY=your-anthropic-key
node scripts/seed-youtube.mjs --category fitness --max 50

# Check index stats
node scripts/stats.mjs
```

## Quick Start — Provider

```bash
cd provider

# Start the SEP server (port 3700)
node src/server.mjs

# Endpoints:
# GET  http://localhost:3700/sep/manifest
# POST http://localhost:3700/sep/query
# GET  http://localhost:3700/sep/browse
# POST http://localhost:3700/sep/telemetry
```

Query example:

```bash
curl -X POST http://localhost:3700/sep/query \
  -H "Content-Type: application/json" \
  -d '{
    "sep_version": "0.1.0",
    "consumer_id": "test",
    "intent": {
      "session_type": "composed",
      "target_duration_minutes": 15,
      "weights": { "fitness": 0.3, "humor": 0.2, "motivation": 0.2 },
      "filters": { "exclude_rage_bait": true }
    },
    "disclosure_level": "minimal",
    "telemetry_opt_in": false
  }'
```

## Protocol Specification

See [spec/2026-02-28/README.md](spec/2026-02-28/README.md) for the full Stream Exchange Protocol documentation.

## Taxonomy Reference

- [Categories](enrichment/src/taxonomy/categories.json) — 12 content categories
- [Emotions](enrichment/src/taxonomy/emotions.json) — 6 tones + 6 harm flags
- [Scoring](enrichment/src/taxonomy/scoring.json) — 6 scoring dimensions (0.0–1.0)

## Design Principles

- **Zero production dependencies** except `better-sqlite3` for storage
- **ES Modules** throughout (`.mjs`)
- **No build step** — runs directly with `node`
- **No frameworks** — vanilla Node.js HTTP server
- **Works offline** — mock mode for testing without API keys
- **Environment-driven config** — `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, `PORT`, `DB_PATH`

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | Current | SEP Spec + Enrichment Pipeline |
| Phase 2 | Planned | Good Vibes Provider (full deployment) |
| Phase 3 | Planned | Consumer PAE (personal algorithm engine) |
| Phase 4 | Planned | The Shell (local-first UI) |

## License

[MIT](LICENSE)
