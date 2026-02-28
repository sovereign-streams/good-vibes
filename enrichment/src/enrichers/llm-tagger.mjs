const VALID_EMOTIONAL_TONES = ['calm', 'focused', 'energized', 'amused', 'inspired', 'reflective'];

const VALID_CATEGORIES = [
  'fitness', 'nutrition', 'skill_building', 'humor', 'motivation',
  'craft', 'stoicism', 'fatherhood', 'entrepreneurship', 'music',
  'nature', 'relaxation',
];

export class LLMTagger {
  /**
   * @param {object} opts
   * @param {import('../lib/llm-client.mjs').LLMClient|null} opts.llmClient - Anthropic API client, or null for mock mode.
   * @param {object} [opts.taxonomy] - Full taxonomy object with categories, emotions, scoring dimensions.
   */
  constructor({ llmClient = null, taxonomy = null } = {}) {
    this.llmClient = llmClient;
    this.taxonomy = taxonomy;
  }

  /**
   * Tag a raw metadata item using the LLM.
   * @param {object} rawMeta - Raw metadata from the source adapter.
   * @param {string|null} [transcript=null] - Transcript excerpt (first 500 chars) or null.
   * @returns {Promise<object>} Enrichment object matching the SEP enrichment schema.
   */
  async tag(rawMeta, transcript = null) {
    if (!this.llmClient) {
      return this._mockResponse(rawMeta);
    }

    const prompt = this._buildPrompt(rawMeta, transcript);

    let response;
    try {
      response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 1024, temperature: 0 }
      );
    } catch (err) {
      console.error(`[llm-tagger] API call failed: ${err.message}`);
      throw new Error(`LLM tagging failed: ${err.message}`);
    }

    // Extract JSON from the response text
    const parsed = this._parseResponse(response);
    const validated = this._validateAndClamp(parsed);
    return validated;
  }

  /**
   * Build the structured prompt for the LLM.
   * @private
   */
  _buildPrompt(rawMeta, transcript) {
    const taxonomySection = this.taxonomy
      ? this._formatTaxonomy()
      : this._defaultTaxonomyPrompt();

    const transcriptSection = transcript
      ? `\n## Transcript Excerpt (first 500 chars)\n${transcript.slice(0, 500)}\n`
      : '\n## Transcript\nNot available.\n';

    const durationDisplay = typeof rawMeta.duration === 'number'
      ? `${Math.floor(rawMeta.duration / 60)}m ${rawMeta.duration % 60}s`
      : 'unknown';

    return `You are a content enrichment tagger for the Stream Exchange Protocol (SEP).
Analyze the following video metadata and produce a structured JSON enrichment object.

${taxonomySection}

## Video Metadata
- Title: ${rawMeta.title || 'Unknown'}
- Description: ${(rawMeta.description || '').slice(0, 500)}
- Channel: ${rawMeta.channelTitle || 'Unknown'}
- Tags: ${(rawMeta.tags || []).join(', ') || 'None'}
- Duration: ${durationDisplay}
- View Count: ${rawMeta.statistics?.viewCount || 'Unknown'}
${transcriptSection}

## Output Requirements
Return ONLY a valid JSON object (no markdown fencing, no explanation) with this exact structure:

{
  "categories": [{"id": "category_id", "confidence": 0.0-1.0}],
  "emotional_tone": {
    "primary": "one of: calm, focused, energized, amused, inspired, reflective",
    "secondary": "one of the above or null",
    "rage_bait": false,
    "humiliation": false,
    "shock_content": false,
    "inflammatory": false,
    "sexually_explicit": false,
    "violence": false
  },
  "energy_level": 0.0-1.0,
  "cognitive_load": 0.0-1.0,
  "motivation_score": 0.0-1.0,
  "humor_score": 0.0-1.0,
  "skill_transfer_score": 0.0-1.0,
  "production_quality": 0.0-1.0,
  "session_fit": {
    "good_opener": true/false,
    "good_builder": true/false,
    "good_peak": true/false,
    "good_closer": true/false
  }
}

Categories: assign 1-3 categories from: ${VALID_CATEGORIES.join(', ')}
Emotional tones: ${VALID_EMOTIONAL_TONES.join(', ')}
All scores must be between 0.0 and 1.0.
Set boolean flags to true ONLY if the content clearly exhibits that characteristic.`;
  }

  /**
   * Format the full taxonomy for inclusion in the prompt.
   * @private
   */
  _formatTaxonomy() {
    const parts = ['## Taxonomy'];

    if (this.taxonomy.categories) {
      parts.push('\n### Categories');
      for (const cat of this.taxonomy.categories) {
        parts.push(`- ${cat.id}: ${cat.description}`);
      }
    }

    if (this.taxonomy.emotional_tones) {
      parts.push('\n### Emotional Tones');
      for (const tone of this.taxonomy.emotional_tones) {
        parts.push(`- ${tone.id}: ${tone.description}`);
      }
    }

    if (this.taxonomy.dimensions) {
      parts.push('\n### Scoring Dimensions');
      for (const dim of this.taxonomy.dimensions) {
        parts.push(`- ${dim.id}: ${dim.description}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Default taxonomy summary when no taxonomy object is provided.
   * @private
   */
  _defaultTaxonomyPrompt() {
    return `## Taxonomy
### Categories
${VALID_CATEGORIES.map(c => `- ${c}`).join('\n')}

### Emotional Tones
${VALID_EMOTIONAL_TONES.map(t => `- ${t}`).join('\n')}

### Scoring Dimensions (all 0.0 - 1.0)
- energy_level: calm (0) to intense (1)
- cognitive_load: passive (0) to demanding (1)
- motivation_score: neutral (0) to highly motivating (1)
- humor_score: serious (0) to comedy-focused (1)
- skill_transfer_score: entertainment only (0) to highly instructional (1)
- production_quality: raw/unedited (0) to professional studio (1)`;
  }

  /**
   * Parse the LLM response text into a JSON object.
   * Handles responses that may include markdown code fences.
   * @private
   */
  _parseResponse(responseText) {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      // Try to extract JSON from within the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (_) {
          // Fall through to error
        }
      }
      throw new Error(`Failed to parse LLM response as JSON: ${err.message}`);
    }
  }

  /**
   * Validate structure and clamp all scores to 0-1 range.
   * @private
   */
  _validateAndClamp(parsed) {
    const now = new Date().toISOString();

    // Validate and clamp categories
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
          .filter(c => c && typeof c.id === 'string' && VALID_CATEGORIES.includes(c.id))
          .map(c => ({
            id: c.id,
            confidence: this._clamp(c.confidence),
          }))
          .sort((a, b) => b.confidence - a.confidence)
      : [];

    // Validate emotional tone
    const emotionalTone = parsed.emotional_tone || {};
    const primaryTone = VALID_EMOTIONAL_TONES.includes(emotionalTone.primary)
      ? emotionalTone.primary
      : 'focused';
    const secondaryTone = emotionalTone.secondary && VALID_EMOTIONAL_TONES.includes(emotionalTone.secondary)
      ? emotionalTone.secondary
      : null;

    // Validate session fit
    const sessionFit = parsed.session_fit || {};

    return {
      schema_version: '0.1.0',
      enriched_at: now,
      categories,
      emotional_tone: {
        primary: primaryTone,
        secondary: secondaryTone,
        rage_bait: Boolean(emotionalTone.rage_bait),
        humiliation: Boolean(emotionalTone.humiliation),
        shock_content: Boolean(emotionalTone.shock_content),
        inflammatory: Boolean(emotionalTone.inflammatory),
        sexually_explicit: Boolean(emotionalTone.sexually_explicit),
        violence: Boolean(emotionalTone.violence),
      },
      energy_level: this._clamp(parsed.energy_level),
      cognitive_load: this._clamp(parsed.cognitive_load),
      motivation_score: this._clamp(parsed.motivation_score),
      humor_score: this._clamp(parsed.humor_score),
      skill_transfer_score: this._clamp(parsed.skill_transfer_score),
      production_quality: this._clamp(parsed.production_quality),
      session_fit: {
        good_opener: Boolean(sessionFit.good_opener),
        good_builder: Boolean(sessionFit.good_builder),
        good_peak: Boolean(sessionFit.good_peak),
        good_closer: Boolean(sessionFit.good_closer),
      },
    };
  }

  /**
   * Clamp a value to the 0-1 range. Returns 0.5 for non-numeric inputs.
   * @private
   */
  _clamp(value) {
    if (typeof value !== 'number' || isNaN(value)) return 0.5;
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Generate a mock enrichment response for testing without an LLM client.
   * Produces deterministic-ish results based on the metadata.
   * @private
   */
  _mockResponse(rawMeta) {
    const title = (rawMeta.title || '').toLowerCase();
    const now = new Date().toISOString();

    // Simple heuristic-based mock tagging
    let primaryCategory = 'skill_building';
    let primaryTone = 'focused';
    let energy = 0.5;
    let motivation = 0.5;
    let humor = 0.1;
    let skillTransfer = 0.5;

    if (title.includes('workout') || title.includes('exercise') || title.includes('fitness')) {
      primaryCategory = 'fitness';
      primaryTone = 'energized';
      energy = 0.8;
      motivation = 0.7;
    } else if (title.includes('cook') || title.includes('meal') || title.includes('recipe') || title.includes('nutrition')) {
      primaryCategory = 'nutrition';
      primaryTone = 'focused';
      skillTransfer = 0.7;
    } else if (title.includes('funny') || title.includes('comedy') || title.includes('laugh') || title.includes('fail')) {
      primaryCategory = 'humor';
      primaryTone = 'amused';
      humor = 0.9;
      energy = 0.6;
    } else if (title.includes('motivat') || title.includes('inspir') || title.includes('discipline')) {
      primaryCategory = 'motivation';
      primaryTone = 'inspired';
      motivation = 0.9;
      energy = 0.7;
    } else if (title.includes('wood') || title.includes('craft') || title.includes('build') || title.includes('diy')) {
      primaryCategory = 'craft';
      primaryTone = 'calm';
      skillTransfer = 0.8;
      energy = 0.3;
    } else if (title.includes('stoic') || title.includes('philosophy') || title.includes('meditat')) {
      primaryCategory = 'stoicism';
      primaryTone = 'reflective';
      energy = 0.2;
    }

    return {
      schema_version: '0.1.0',
      enriched_at: now,
      categories: [
        { id: primaryCategory, confidence: 0.85 },
      ],
      emotional_tone: {
        primary: primaryTone,
        secondary: null,
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: false,
        violence: false,
      },
      energy_level: energy,
      cognitive_load: 0.4,
      motivation_score: motivation,
      humor_score: humor,
      skill_transfer_score: skillTransfer,
      production_quality: 0.6,
      session_fit: {
        good_opener: energy < 0.5,
        good_builder: skillTransfer > 0.5,
        good_peak: energy > 0.7 || motivation > 0.7,
        good_closer: energy < 0.4,
      },
    };
  }
}
