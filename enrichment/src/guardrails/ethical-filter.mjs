import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class EthicalFilter {
  constructor() {
    const rulesPath = join(__dirname, 'rules.json');
    this.rules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  }

  /**
   * Check content against guardrail rules.
   * @param {object} enrichment - The enrichment object (contains emotional_tone, categories, etc.)
   * @param {object} rawMeta - Optional raw metadata (title, description, tags, etc.)
   * @returns {{ pass: boolean, version: string, violations: string[], soft_flags: string[] }}
   */
  check(enrichment, rawMeta = {}) {
    const violations = [];
    const soft_flags = [];

    const emotionalTone = enrichment.emotional_tone || {};

    // --- Hard exclusions ---
    for (const rule of this.rules.hard_exclusions) {
      // Flag-based check: if the emotional_tone has a boolean flag set to true
      if (rule.flag && emotionalTone[rule.flag] === true) {
        violations.push(rule.id);
        continue;
      }

      // Keyword-based check: search title and description
      if (rule.keywords && rule.keywords.length > 0) {
        const searchText = [
          rawMeta.title || '',
          rawMeta.description || ''
        ].join(' ').toLowerCase();

        const matched = rule.keywords.some(kw => searchText.includes(kw.toLowerCase()));
        if (matched) {
          violations.push(rule.id);
        }
      }
    }

    // --- Soft filters ---
    for (const filter of this.rules.soft_filters) {
      // Flag-based soft check
      if (filter.flag && emotionalTone[filter.flag] === true) {
        soft_flags.push(filter.id);
        continue;
      }

      // Keyword-based soft check
      if (filter.keywords && filter.keywords.length > 0) {
        const searchText = [
          rawMeta.title || '',
          rawMeta.description || ''
        ].join(' ').toLowerCase();

        const matched = filter.keywords.some(kw => searchText.includes(kw.toLowerCase()));
        if (matched) {
          soft_flags.push(filter.id);
        }
      }
    }

    return {
      pass: violations.length === 0,
      version: this.rules.version,
      violations,
      soft_flags
    };
  }

  /**
   * Return the current rules for transparency/publishing.
   * @returns {object}
   */
  getRules() {
    return this.rules;
  }
}
