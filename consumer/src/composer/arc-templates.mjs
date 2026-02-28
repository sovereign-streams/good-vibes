/**
 * Arc Templates — Pre-defined session arc patterns for the Good Vibes PAE.
 *
 * Each template defines:
 *  - phases: ordered list of arc phases with target proportions
 *  - energy_curve: target energy level at each phase
 *  - category_distribution: how categories should spread across the arc
 *  - pacing: min/max items, transition rules
 */

const ARC_TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Standard Arc',
    description: 'A balanced session: warm up, build, peak, wind down.',
    phases: [
      { role: 'opener', proportion: 0.15, session_fit_key: 'good_opener' },
      { role: 'builder', proportion: 0.45, session_fit_key: 'good_builder' },
      { role: 'peak', proportion: 0.25, session_fit_key: 'good_peak' },
      { role: 'closer', proportion: 0.15, session_fit_key: 'good_closer' },
    ],
    energy_curve: [0.4, 0.6, 0.9, 0.3],
    pacing: {
      min_items: 4,
      max_items: 30,
      prefer_smooth_transitions: true,
      max_energy_delta: 0.4,
    },
    category_distribution: 'balanced',
  },

  'quick-hit': {
    id: 'quick-hit',
    name: 'Quick Hit',
    description: 'Short, high-energy burst. 3-5 items, no wind-down.',
    phases: [
      { role: 'opener', proportion: 0.2, session_fit_key: 'good_opener' },
      { role: 'peak', proportion: 0.6, session_fit_key: 'good_peak' },
      { role: 'closer', proportion: 0.2, session_fit_key: 'good_closer' },
    ],
    energy_curve: [0.7, 0.95, 0.8],
    pacing: {
      min_items: 3,
      max_items: 5,
      prefer_smooth_transitions: false,
      max_energy_delta: 0.6,
    },
    category_distribution: 'concentrated',
  },

  'deep-dive': {
    id: 'deep-dive',
    name: 'Deep Dive',
    description: 'Skill/learning focused. 1-2 openers, then sustained builders.',
    phases: [
      { role: 'opener', proportion: 0.1, session_fit_key: 'good_opener' },
      { role: 'builder', proportion: 0.8, session_fit_key: 'good_builder' },
      { role: 'closer', proportion: 0.1, session_fit_key: 'good_closer' },
    ],
    energy_curve: [0.5, 0.65, 0.4],
    pacing: {
      min_items: 4,
      max_items: 20,
      prefer_smooth_transitions: true,
      max_energy_delta: 0.25,
    },
    category_distribution: 'focused',
  },

  'wind-down': {
    id: 'wind-down',
    name: 'Wind Down',
    description: 'Decreasing energy curve. Ends with relaxation.',
    phases: [
      { role: 'opener', proportion: 0.15, session_fit_key: 'good_opener' },
      { role: 'builder', proportion: 0.35, session_fit_key: 'good_builder' },
      { role: 'closer', proportion: 0.50, session_fit_key: 'good_closer' },
    ],
    energy_curve: [0.5, 0.4, 0.15],
    pacing: {
      min_items: 4,
      max_items: 20,
      prefer_smooth_transitions: true,
      max_energy_delta: 0.2,
    },
    category_distribution: 'relaxation_heavy',
  },

  explorer: {
    id: 'explorer',
    name: 'Explorer',
    description: 'High randomness, wide category spread, discovery mode.',
    phases: [
      { role: 'opener', proportion: 0.15, session_fit_key: 'good_opener' },
      { role: 'builder', proportion: 0.50, session_fit_key: 'good_builder' },
      { role: 'peak', proportion: 0.20, session_fit_key: 'good_peak' },
      { role: 'closer', proportion: 0.15, session_fit_key: 'good_closer' },
    ],
    energy_curve: [0.5, 0.6, 0.7, 0.4],
    pacing: {
      min_items: 5,
      max_items: 30,
      prefer_smooth_transitions: false,
      max_energy_delta: 0.5,
    },
    category_distribution: 'wide_spread',
  },
};

/**
 * Get a template by ID.
 * @param {string} templateId
 * @returns {object|null}
 */
export function getTemplate(templateId) {
  return ARC_TEMPLATES[templateId] ?? null;
}

/**
 * List all available template IDs.
 * @returns {string[]}
 */
export function listTemplates() {
  return Object.keys(ARC_TEMPLATES);
}

/**
 * Calculate target item counts per phase given total item count.
 * Returns an array of { role, count, session_fit_key, target_energy }.
 *
 * @param {string} templateId
 * @param {number} totalItems
 * @returns {Array<{ role: string, count: number, session_fit_key: string, target_energy: number }>}
 */
export function calculatePhaseAllocation(templateId, totalItems) {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown arc template: ${templateId}`);
  }

  const { phases, energy_curve, pacing } = template;
  const clamped = Math.max(pacing.min_items, Math.min(pacing.max_items, totalItems));

  // Distribute items proportionally, ensuring at least 1 per phase
  let remaining = clamped;
  const allocation = phases.map((phase, i) => {
    const raw = Math.round(clamped * phase.proportion);
    const count = Math.max(1, raw);
    return {
      role: phase.role,
      count,
      session_fit_key: phase.session_fit_key,
      target_energy: energy_curve[i],
    };
  });

  // Adjust to match total
  const allocated = allocation.reduce((sum, a) => sum + a.count, 0);
  let diff = clamped - allocated;
  // Add/remove from the largest phase (builder typically)
  const largestIdx = allocation.reduce((best, a, i) => (a.count > allocation[best].count ? i : best), 0);
  allocation[largestIdx].count += diff;
  if (allocation[largestIdx].count < 1) {
    allocation[largestIdx].count = 1;
  }

  return allocation;
}

export { ARC_TEMPLATES };
