/**
 * Session Builder — Composes session arcs from ranked content items.
 *
 * Takes ranked items (from provider payload + profile preferences),
 * builds a structured session arc using a template, respects target
 * duration, handles partial fills, and returns a structured session
 * with ordering, estimated duration, and transitions.
 */

import { getTemplate, calculatePhaseAllocation } from './arc-templates.mjs';
import { optimizeOrdering, calculateFlowScore, suggestBreakPoints, applyEnergyCurve } from './rhythm-engine.mjs';
import { randomUUID } from 'node:crypto';

/**
 * Score an item's relevance to a profile's weights.
 * Higher = better match.
 *
 * @param {object} item - Enrichment envelope
 * @param {object} weights - Category weight map (e.g., { fitness: 0.3, humor: 0.2 })
 * @returns {number} Relevance score
 */
function scoreItemRelevance(item, weights) {
  let score = 0;
  for (const cat of item.enrichment.categories) {
    const weight = weights[cat.id] ?? 0;
    score += weight * cat.confidence;
  }
  return score;
}

/**
 * Filter items against profile filters.
 *
 * @param {object[]} items - Enrichment envelopes
 * @param {object} filters - Filter config from profile/intent
 * @returns {object[]} Filtered items
 */
function applyFilters(items, filters) {
  return items.filter(item => {
    const e = item.enrichment;
    const tone = e.emotional_tone;

    if (filters.exclude_rage_bait && tone.rage_bait) return false;
    if (filters.exclude_humiliation && tone.humiliation) return false;
    if (filters.exclude_shock_content && tone.shock_content) return false;

    if (filters.min_energy_level != null && e.energy_level < filters.min_energy_level) return false;
    if (filters.max_cognitive_load != null && e.cognitive_load > filters.max_cognitive_load) return false;

    if (filters.language?.length > 0) {
      if (!filters.language.includes(item.meta?.language)) return false;
    }

    return true;
  });
}

/**
 * Select items for a phase from the candidate pool.
 * Prefers items whose session_fit matches the phase and whose energy
 * is close to the target.
 *
 * @param {object[]} candidates - Available items
 * @param {object} phase - Phase allocation { role, count, session_fit_key, target_energy }
 * @param {object} weights - Profile category weights
 * @returns {{ selected: object[], remaining: object[] }}
 */
function selectForPhase(candidates, phase, weights) {
  // Score each candidate for this phase
  const scored = candidates.map(item => {
    const fitBonus = item.enrichment.session_fit[phase.session_fit_key] ? 1.0 : 0.0;
    const energyFit = 1 - Math.abs(item.enrichment.energy_level - phase.target_energy);
    const relevance = scoreItemRelevance(item, weights);
    const total = fitBonus * 0.4 + energyFit * 0.3 + relevance * 0.3;
    return { item, total };
  });

  scored.sort((a, b) => b.total - a.total);

  const selected = scored.slice(0, phase.count).map(s => s.item);
  const selectedIds = new Set(selected.map(i => i.item_id));
  const remaining = candidates.filter(i => !selectedIds.has(i.item_id));

  return { selected, remaining };
}

/**
 * Build a composed session from ranked items and a profile.
 *
 * @param {object} options
 * @param {object[]} options.items - Enrichment envelopes from provider(s)
 * @param {object} options.profile - User profile with weights, filters, preferred_arc_template, target_duration_minutes
 * @param {string} [options.template_override] - Override the profile's preferred arc template
 * @returns {object} Composed session
 */
export function buildSession(options) {
  const { items, profile, template_override } = options;

  const templateId = template_override ?? profile.preferred_arc_template ?? 'standard';
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown arc template: ${templateId}`);
  }

  const targetMinutes = profile.target_duration_minutes ?? 15;
  const weights = profile.weights ?? {};
  const filters = profile.filters ?? {};

  // Step 1: Apply filters
  const filtered = applyFilters(items, filters);
  if (filtered.length === 0) {
    return emptySession(templateId, targetMinutes);
  }

  // Step 2: Estimate how many items fit the target duration
  const avgDuration = filtered.reduce((sum, i) => sum + (i.source?.duration_seconds ?? 180), 0) / filtered.length;
  const targetItems = Math.max(template.pacing.min_items, Math.round((targetMinutes * 60) / avgDuration));

  // Step 3: Allocate items to phases
  const allocation = calculatePhaseAllocation(templateId, Math.min(targetItems, filtered.length));

  // Step 4: Select items for each phase
  let pool = [...filtered];
  // Rank pool by relevance first
  pool.sort((a, b) => scoreItemRelevance(b, weights) - scoreItemRelevance(a, weights));

  const phases = [];
  for (const phase of allocation) {
    const { selected, remaining } = selectForPhase(pool, phase, weights);
    pool = remaining;

    // Optimize ordering within phase
    const ordered = optimizeOrdering(selected, phase.target_energy);
    // Then apply energy curve direction
    const phaseIdx = allocation.indexOf(phase);
    const nextPhase = allocation[phaseIdx + 1];
    const endEnergy = nextPhase ? nextPhase.target_energy : phase.target_energy * 0.5;
    const curved = applyEnergyCurve(ordered, phase.target_energy, endEnergy);

    phases.push({
      role: phase.role,
      target_energy: phase.target_energy,
      items: curved,
    });
  }

  // Step 5: Flatten into ordered session
  const sessionItems = phases.flatMap(p => p.items);
  const totalDuration = sessionItems.reduce((sum, i) => sum + (i.source?.duration_seconds ?? 0), 0);

  // Step 6: Calculate flow score
  const { flow_score, transitions } = calculateFlowScore(sessionItems);

  // Step 7: Suggest break points for long sessions
  const breakPoints = totalDuration > 20 * 60
    ? suggestBreakPoints(sessionItems)
    : [];

  return {
    session_id: randomUUID(),
    template_id: templateId,
    target_duration_minutes: targetMinutes,
    estimated_duration_seconds: totalDuration,
    item_count: sessionItems.length,
    partial_fill: sessionItems.length < targetItems,
    flow_score,
    phases: phases.map(p => ({
      role: p.role,
      target_energy: p.target_energy,
      item_count: p.items.length,
      item_ids: p.items.map(i => i.item_id),
    })),
    items: sessionItems.map((item, index) => ({
      position: index,
      item_id: item.item_id,
      source: item.source,
      meta: item.meta,
      enrichment_summary: {
        categories: item.enrichment.categories.map(c => c.id),
        energy_level: item.enrichment.energy_level,
        primary_tone: item.enrichment.emotional_tone.primary,
      },
    })),
    transitions,
    break_points: breakPoints,
  };
}

/**
 * Create an empty session result when no content passes filters.
 */
function emptySession(templateId, targetMinutes) {
  return {
    session_id: randomUUID(),
    template_id: templateId,
    target_duration_minutes: targetMinutes,
    estimated_duration_seconds: 0,
    item_count: 0,
    partial_fill: true,
    flow_score: 0,
    phases: [],
    items: [],
    transitions: [],
    break_points: [],
  };
}

/**
 * Merge items from multiple provider payloads into a single pool.
 * De-duplicates by item_id.
 *
 * @param {Array<object[]>} payloads - Arrays of enrichment envelopes
 * @returns {object[]} Merged, de-duplicated items
 */
export function mergePayloads(payloads) {
  const seen = new Set();
  const merged = [];
  for (const payload of payloads) {
    for (const item of payload) {
      if (!seen.has(item.item_id)) {
        seen.add(item.item_id);
        merged.push(item);
      }
    }
  }
  return merged;
}
