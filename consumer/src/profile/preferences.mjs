import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WEIGHTS = {
  fitness: 0.15, humor: 0.15, skill_building: 0.15,
  motivation: 0.12, craft: 0.10, music: 0.08,
  nature: 0.06, nutrition: 0.05, stoicism: 0.05,
  fatherhood: 0.04, entrepreneurship: 0.03, relaxation: 0.02,
};

const DEFAULT_FILTERS = {
  exclude_rage_bait: true,
  exclude_humiliation: true,
  exclude_shock_content: true,
  max_cognitive_load: 0.7,
  language: ['en'],
};

const DEFAULT_ENERGY = { min: 0.2, ideal: 0.6, max: 0.9 };

const DEFAULT_TONE = {
  preferred: ['energized', 'amused', 'inspired'],
  avoid: [],
};

/**
 * Clamp a value to the unit interval [0, 1].
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Load a profile from a JSON file.
 *
 * @param {string} filePath - Absolute path to the profile JSON file
 * @returns {object} Profile object
 */
export function loadProfileFromFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const profile = JSON.parse(raw);
  return normalizeProfile(profile);
}

/**
 * Load all default profiles from a directory.
 *
 * @param {string} [dir] - Directory containing profile JSON files
 * @returns {object[]} Array of profile objects
 */
export function loadDefaultProfiles(dir) {
  const profilesDir = dir || join(__dirname, '..', '..', 'default-profiles');
  const files = readdirSync(profilesDir).filter(f => f.endsWith('.json'));
  return files.map(f => loadProfileFromFile(join(profilesDir, f)));
}

/**
 * Normalize and validate a profile, merging with defaults.
 *
 * @param {object} profile - Raw profile object
 * @returns {object} Normalized profile
 */
export function normalizeProfile(profile) {
  const weights = { ...DEFAULT_WEIGHTS };
  if (profile.weights) {
    for (const [k, v] of Object.entries(profile.weights)) {
      if (typeof v === 'number') {
        weights[k] = clamp01(v);
      }
    }
  }

  const filters = { ...DEFAULT_FILTERS };
  if (profile.filters) {
    if (typeof profile.filters.exclude_rage_bait === 'boolean') filters.exclude_rage_bait = profile.filters.exclude_rage_bait;
    if (typeof profile.filters.exclude_humiliation === 'boolean') filters.exclude_humiliation = profile.filters.exclude_humiliation;
    if (typeof profile.filters.exclude_shock_content === 'boolean') filters.exclude_shock_content = profile.filters.exclude_shock_content;
    if (typeof profile.filters.min_energy_level === 'number') filters.min_energy_level = clamp01(profile.filters.min_energy_level);
    if (typeof profile.filters.max_cognitive_load === 'number') filters.max_cognitive_load = clamp01(profile.filters.max_cognitive_load);
    if (Array.isArray(profile.filters.language)) filters.language = profile.filters.language;
  }

  const energy = { ...DEFAULT_ENERGY };
  if (profile.energy_preferences) {
    if (typeof profile.energy_preferences.min === 'number') energy.min = clamp01(profile.energy_preferences.min);
    if (typeof profile.energy_preferences.ideal === 'number') energy.ideal = clamp01(profile.energy_preferences.ideal);
    if (typeof profile.energy_preferences.max === 'number') energy.max = clamp01(profile.energy_preferences.max);
  }

  const tone = { ...DEFAULT_TONE };
  if (profile.tone_preferences) {
    if (Array.isArray(profile.tone_preferences.preferred)) tone.preferred = profile.tone_preferences.preferred;
    if (Array.isArray(profile.tone_preferences.avoid)) tone.avoid = profile.tone_preferences.avoid;
  }

  return {
    id: profile.id || 'custom',
    name: profile.name || profile.id || 'Custom Profile',
    description: profile.description || '',
    weights,
    filters,
    preferred_arc_template: profile.preferred_arc_template || 'standard',
    target_duration_minutes: profile.target_duration_minutes || 15,
    energy_preferences: energy,
    tone_preferences: tone,
  };
}

/**
 * Merge user overrides into a base profile.
 * Only specified fields are overridden.
 *
 * @param {object} base - Base profile
 * @param {object} overrides - Partial profile overrides
 * @returns {object} Merged profile
 */
export function mergeOverrides(base, overrides) {
  const merged = { ...base };

  if (overrides.weights) {
    merged.weights = { ...base.weights };
    for (const [k, v] of Object.entries(overrides.weights)) {
      if (typeof v === 'number') merged.weights[k] = clamp01(v);
    }
  }

  if (overrides.filters) {
    merged.filters = { ...base.filters, ...overrides.filters };
    if (typeof merged.filters.min_energy_level === 'number') merged.filters.min_energy_level = clamp01(merged.filters.min_energy_level);
    if (typeof merged.filters.max_cognitive_load === 'number') merged.filters.max_cognitive_load = clamp01(merged.filters.max_cognitive_load);
  }

  if (overrides.energy_preferences) {
    merged.energy_preferences = { ...base.energy_preferences, ...overrides.energy_preferences };
  }

  if (overrides.tone_preferences) {
    merged.tone_preferences = { ...base.tone_preferences, ...overrides.tone_preferences };
  }

  if (overrides.preferred_arc_template) merged.preferred_arc_template = overrides.preferred_arc_template;
  if (overrides.target_duration_minutes) merged.target_duration_minutes = overrides.target_duration_minutes;

  return merged;
}

/**
 * Build a consumer intent object from a profile, suitable for SEP queries.
 *
 * @param {object} profile - Normalized profile
 * @param {object} [context] - Optional context overrides (time_of_day, session_number_today, state_token)
 * @returns {object} Consumer intent
 */
export function buildIntent(profile, context = {}) {
  return {
    sep_version: '0.1.0',
    consumer_id: 'pae-local',
    intent: {
      session_type: context.session_type || 'composed',
      target_duration_minutes: context.target_duration_minutes || profile.target_duration_minutes || 15,
      weights: { ...profile.weights },
      filters: { ...profile.filters },
      context: {
        time_of_day: context.time_of_day || getTimeOfDay(),
        session_number_today: context.session_number_today || 1,
        state_token: context.state_token || null,
      },
    },
    disclosure_level: context.disclosure_level || 'minimal',
    telemetry_opt_in: context.telemetry_opt_in || false,
  };
}

/**
 * Apply time-of-day energy adjustments to a profile.
 *
 * @param {object} profile - Normalized profile
 * @param {string} [timeOfDay] - morning/afternoon/evening/night
 * @returns {object} Profile with adjusted energy filters
 */
export function applyTimeOfDayEnergy(profile, timeOfDay) {
  const tod = timeOfDay || getTimeOfDay();
  const energyTargets = {
    morning: { min: 0.5, ideal: 0.75 },
    afternoon: { min: 0.3, ideal: 0.6 },
    evening: { min: 0.1, ideal: 0.35 },
    night: { min: 0.0, ideal: 0.2 },
  };

  const target = energyTargets[tod];
  if (!target) return profile;

  return mergeOverrides(profile, {
    filters: {
      min_energy_level: Math.max(profile.filters.min_energy_level || 0, target.min),
    },
    energy_preferences: {
      ideal: target.ideal,
    },
  });
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export { DEFAULT_WEIGHTS, DEFAULT_FILTERS, DEFAULT_ENERGY, DEFAULT_TONE };
