import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Validator } from '../src/lib/validator.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Validator', () => {
  let validator;

  it('should load schemas', () => {
    validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
    assert.ok(validator);
  });

  it('should validate a valid enrichment envelope', () => {
    validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
    const envelope = {
      sep_version: '0.1.0',
      item_id: '550e8400-e29b-41d4-a716-446655440000',
      source: {
        platform: 'youtube',
        origin_url: 'https://youtube.com/watch?v=abc123',
        origin_id: 'abc123',
        content_type: 'video',
        duration_seconds: 623
      },
      meta: {
        title: 'Test Video',
        creator: 'Test Channel',
        published: '2026-01-15T08:00:00Z',
        original_tags: ['test'],
        language: 'en',
        thumbnail_url: 'https://example.com/thumb.jpg'
      },
      enrichment: {
        schema_version: '0.1.0',
        enriched_at: '2026-02-28T12:00:00Z',
        categories: [{ id: 'fitness', confidence: 0.9 }],
        emotional_tone: {
          primary: 'energized',
          secondary: null,
          rage_bait: false,
          humiliation: false,
          shock_content: false,
          inflammatory: false,
          sexually_explicit: false,
          violence: false
        },
        energy_level: 0.75,
        cognitive_load: 0.25,
        motivation_score: 0.7,
        humor_score: 0.05,
        skill_transfer_score: 0.65,
        production_quality: 0.7,
        session_fit: {
          good_opener: true,
          good_builder: true,
          good_peak: false,
          good_closer: false
        }
      },
      provider: {
        id: 'good-vibes-main',
        guardrail_pass: true,
        guardrail_version: '0.1.0'
      }
    };
    const result = validator.validate(envelope, 'enrichment-envelope');
    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
  });

  it('should reject envelope missing required fields', () => {
    validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
    const result = validator.validate({}, 'enrichment-envelope');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should validate a consumer intent', () => {
    validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
    const intent = {
      sep_version: '0.1.0',
      consumer_id: 'test-consumer',
      intent: {
        session_type: 'composed',
        target_duration_minutes: 15,
        weights: { fitness: 0.3, humor: 0.2 },
        filters: {
          exclude_rage_bait: true,
          exclude_humiliation: true,
          exclude_shock_content: true
        },
        context: {
          time_of_day: 'morning',
          session_number_today: 1,
          state_token: null
        }
      },
      disclosure_level: 'minimal',
      telemetry_opt_in: false
    };
    const result = validator.validate(intent, 'consumer-intent');
    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
  });
});
