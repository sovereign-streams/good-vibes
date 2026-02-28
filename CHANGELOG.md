# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-28

### Added

- **Stream Exchange Protocol (SEP) v0.1.0** — JSON Schema definitions for all five message types:
  - Enrichment Envelope — core content metadata schema
  - Consumer Intent — session request format
  - Provider Response — ranked payload format
  - Provider Manifest — provider self-description
  - Telemetry — optional engagement feedback
- **Enrichment Pipeline** — LLM-powered content tagging system:
  - YouTube Data API v3 adapter with quota tracking
  - Claude Haiku-based semantic tagger with full taxonomy prompt
  - Transcript fetcher with graceful degradation
  - Ethical guardrails with published exclusion rules
  - SQLite storage with full-text search
  - JSON Schema validation against SEP spec
- **Taxonomy v0.1.0** — Initial content classification system:
  - 12 content categories (fitness, nutrition, skill_building, humor, motivation, craft, stoicism, fatherhood, entrepreneurship, music, nature, relaxation)
  - 6 emotional tones (calm, focused, energized, amused, inspired, reflective)
  - 6 boolean harm flags (rage_bait, humiliation, shock_content, inflammatory, sexually_explicit, violence)
  - 6 scoring dimensions (energy_level, cognitive_load, motivation_score, humor_score, skill_transfer_score, production_quality)
  - Session fit classification (opener, builder, peak, closer)
- **Seeding Scripts** — YouTube content ingestion tooling:
  - `seed-youtube.mjs` — batch seeding with category filtering and progress tracking
  - `re-enrich.mjs` — re-tag existing records against latest taxonomy
  - `stats.mjs` — index statistics and health reporting
- **Provider Stub** — SEP-compliant HTTP server:
  - Manifest endpoint (GET /sep/manifest)
  - Query endpoint with intent matching and ranking (POST /sep/query)
  - Browse endpoint with pagination (GET /sep/browse)
  - Telemetry endpoint (POST /sep/telemetry)
  - Session arc composition (opener → builder → peak → closer)
- **Test Suite** — Node.js built-in test runner coverage:
  - Pipeline integration tests with fixture data
  - LLM tagger mock tests
  - Ethical guardrail tests
  - Schema validation tests
- **Documentation** — Protocol spec README, project README
