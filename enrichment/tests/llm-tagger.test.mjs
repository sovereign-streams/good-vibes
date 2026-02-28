import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LLMTagger } from '../src/enrichers/llm-tagger.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('LLMTagger', () => {
  let tagger;
  let taxonomy;

  it('should load taxonomy', () => {
    taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    assert.ok(taxonomy.categories.length === 12);
  });

  it('should generate mock enrichment without LLM client', async () => {
    taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    tagger = new LLMTagger({ llmClient: null, taxonomy });

    const result = await tagger.tag({
      title: '10-Minute Morning Workout — No Equipment',
      description: 'Quick full body workout for beginners.',
      tags: ['workout', 'fitness'],
      creator: 'FitLife Daily',
      duration_seconds: 623
    });

    assert.ok(result.schema_version);
    assert.ok(result.enriched_at);
    assert.ok(result.categories.length > 0);
    assert.ok(result.emotional_tone.primary);
    assert.equal(typeof result.energy_level, 'number');
    assert.ok(result.energy_level >= 0 && result.energy_level <= 1);
    assert.equal(typeof result.cognitive_load, 'number');
    assert.equal(typeof result.motivation_score, 'number');
    assert.equal(typeof result.humor_score, 'number');
    assert.equal(typeof result.skill_transfer_score, 'number');
    assert.equal(typeof result.production_quality, 'number');
    assert.ok(result.session_fit);
    assert.equal(typeof result.session_fit.good_opener, 'boolean');
  });

  it('should match fitness content to fitness category', async () => {
    taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    tagger = new LLMTagger({ llmClient: null, taxonomy });

    const result = await tagger.tag({
      title: 'HIIT Workout — 20 Minute Fat Burner',
      description: 'High intensity interval training for maximum fat burn.',
      tags: ['HIIT', 'workout', 'fat burn', 'exercise'],
      creator: 'Fitness Channel',
      duration_seconds: 1200
    });

    const fitnessCategory = result.categories.find(c => c.id === 'fitness');
    assert.ok(fitnessCategory, 'Should match fitness category');
    assert.ok(fitnessCategory.confidence > 0.5, 'Fitness confidence should be high');
  });

  it('should detect humor content', async () => {
    taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    tagger = new LLMTagger({ llmClient: null, taxonomy });

    const result = await tagger.tag({
      title: 'Best Stand-Up Comedy Clips — Try Not to Laugh',
      description: 'The funniest comedy clips. Non-stop laughs.',
      tags: ['comedy', 'funny', 'stand up', 'laugh'],
      creator: 'Comedy Hub',
      duration_seconds: 480
    });

    const humorCategory = result.categories.find(c => c.id === 'humor');
    assert.ok(humorCategory, 'Should match humor category');
    assert.ok(result.humor_score > 0.5, 'Humor score should be high');
  });

  it('should clamp all scores to 0-1 range', async () => {
    taxonomy = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'taxonomy', 'categories.json'), 'utf-8'));
    tagger = new LLMTagger({ llmClient: null, taxonomy });

    const result = await tagger.tag({
      title: 'Test Video',
      description: 'Test',
      tags: [],
      creator: 'Test',
      duration_seconds: 100
    });

    assert.ok(result.energy_level >= 0 && result.energy_level <= 1);
    assert.ok(result.cognitive_load >= 0 && result.cognitive_load <= 1);
    assert.ok(result.motivation_score >= 0 && result.motivation_score <= 1);
    assert.ok(result.humor_score >= 0 && result.humor_score <= 1);
    assert.ok(result.skill_transfer_score >= 0 && result.skill_transfer_score <= 1);
    assert.ok(result.production_quality >= 0 && result.production_quality <= 1);
  });
});
