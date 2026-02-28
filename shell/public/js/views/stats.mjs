/**
 * Stats view
 * Session stats, category distribution, engagement patterns, learning insights
 */
import { api, getState, el, escapeHTML, formatDuration, CATEGORY_COLORS } from '../app.mjs';

export async function render(container) {
  const state = getState();
  container.innerHTML = '';

  container.appendChild(el('h1', { className: 'page-title' }, 'Stats'));
  container.appendChild(el('p', { className: 'page-subtitle' }, 'Your content patterns'));

  // Load stats
  let stats = null;
  try {
    stats = await api.getStats();
    state.stats = stats;
  } catch {
    stats = null;
  }

  if (!stats) {
    container.appendChild(el('div', { className: 'empty-state' },
      el('div', { className: 'empty-icon' }, '\u{1F4CA}'),
      el('div', { className: 'empty-text' }, 'No stats yet. Complete some sessions to see your patterns.'),
      el('a', { href: '#/', className: 'btn btn--primary btn--round' }, 'Start a Session'),
    ));
    return;
  }

  // Summary stat cards
  const grid = el('div', { className: 'stat-grid' });

  const statItems = [
    { value: stats.sessions_this_week ?? 0, label: 'This week' },
    { value: stats.sessions_this_month ?? 0, label: 'This month' },
    { value: stats.total_sessions ?? 0, label: 'All time' },
    { value: formatDuration((stats.avg_duration_seconds ?? 0)), label: 'Avg duration' },
  ];

  for (const s of statItems) {
    const card = el('div', { className: 'card stat-card' });
    card.innerHTML = `
      <div class="stat-value">${escapeHTML(String(s.value))}</div>
      <div class="stat-label">${s.label}</div>`;
    grid.appendChild(card);
  }
  container.appendChild(grid);

  // Category distribution donut chart
  container.appendChild(el('h2', { className: 'section-title' }, 'Category Mix'));

  const catCard = el('div', { className: 'card mb-24' });
  const distribution = stats.category_distribution || {};
  const catEntries = Object.entries(distribution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (catEntries.length) {
    const donut = renderDonutChart(catEntries);
    catCard.appendChild(donut.chart);
    catCard.appendChild(donut.legend);
  } else {
    catCard.innerHTML = '<p class="card-desc text-center" style="padding: 24px;">Not enough data yet.</p>';
  }
  container.appendChild(catCard);

  // Engagement patterns
  if (stats.engagement_patterns) {
    container.appendChild(el('h2', { className: 'section-title' }, 'Engagement'));

    const engCard = el('div', { className: 'card mb-24' });
    const patterns = stats.engagement_patterns;

    const engStats = [
      { label: 'Loved', value: patterns.loved ?? 0, color: '#2ecc71' },
      { label: 'Meh', value: patterns.meh ?? 0, color: '#F7C948' },
      { label: 'Not for me', value: patterns.nope ?? 0, color: '#E8505B' },
      { label: 'Skipped', value: patterns.skipped ?? 0, color: '#9BA4A8' },
    ];

    const total = engStats.reduce((s, e) => s + e.value, 0) || 1;

    for (const e of engStats) {
      const pct = Math.round((e.value / total) * 100);
      const row = el('div', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;' });
      row.innerHTML = `
        <span style="width: 80px; font-size: 13px;">${e.label}</span>
        <div style="flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${e.color}; border-radius: 4px;"></div>
        </div>
        <span style="font-size: 12px; color: var(--text-muted); width: 40px; text-align: right;">${pct}%</span>`;
      engCard.appendChild(row);
    }
    container.appendChild(engCard);
  }

  // Learning Insights
  container.appendChild(el('h2', { className: 'section-title' }, 'Insights'));

  const insightsCard = el('div', { className: 'card' });
  const insights = stats.insights || [];

  if (insights.length) {
    for (const insight of insights) {
      const item = el('div', { className: 'insight-card mb-16' });
      item.innerHTML = `
        <div class="insight-icon">${insight.icon || '\u{1F4A1}'}</div>
        <div class="insight-text">${escapeHTML(insight.text)}</div>`;
      insightsCard.appendChild(item);
    }
  } else {
    // Generate simple insights from available data
    const generatedInsights = generateInsights(stats, catEntries);
    for (const ins of generatedInsights) {
      const item = el('div', { className: 'insight-card mb-16' });
      item.innerHTML = `
        <div class="insight-icon">${ins.icon}</div>
        <div class="insight-text">${escapeHTML(ins.text)}</div>`;
      insightsCard.appendChild(item);
    }
  }

  container.appendChild(insightsCard);
  container.appendChild(el('div', { style: 'height: 24px' }));
}

// ── Donut Chart (CSS-only conic-gradient) ─────────────

function renderDonutChart(entries) {
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const chart = el('div', { className: 'donut-chart' });

  // Build conic-gradient
  let gradientParts = [];
  let cumPct = 0;

  for (const [cat, val] of entries) {
    const pct = (val / total) * 100;
    const color = CATEGORY_COLORS[cat] || '#ccc';
    gradientParts.push(`${color} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  }

  chart.style.background = `conic-gradient(${gradientParts.join(', ')})`;

  const hole = el('div', { className: 'donut-hole' });
  hole.innerHTML = `<span>${total}<br>items</span>`;
  chart.appendChild(hole);

  // Legend
  const legend = el('div', { className: 'donut-legend mt-16' });
  for (const [cat, val] of entries) {
    const pct = Math.round((val / total) * 100);
    const color = CATEGORY_COLORS[cat] || '#ccc';
    const item = el('div', { className: 'legend-item' });
    item.innerHTML = `
      <span class="legend-dot" style="background: ${color};"></span>
      <span>${cat.replace('_', ' ')} ${pct}%</span>`;
    legend.appendChild(item);
  }

  return { chart, legend };
}

// ── Auto-generated Insights ───────────────────────────

function generateInsights(stats, catEntries) {
  const insights = [];

  if (catEntries.length >= 2) {
    const top = catEntries[0][0].replace('_', ' ');
    insights.push({
      icon: '\u{1F3AF}',
      text: `Your top category is ${top}. Your algorithm reflects what matters to you.`,
    });
  }

  if (stats.total_sessions > 5) {
    insights.push({
      icon: '\u{1F525}',
      text: `You've completed ${stats.total_sessions} sessions. That's ${stats.total_sessions} times you chose your own content over an ad-driven feed.`,
    });
  }

  if (stats.avg_duration_seconds) {
    const mins = Math.round(stats.avg_duration_seconds / 60);
    insights.push({
      icon: '\u23F1\uFE0F',
      text: `Your average session is ${mins} minutes \u2014 deliberate, not infinite.`,
    });
  }

  if (catEntries.length >= 3) {
    const variety = catEntries.length;
    insights.push({
      icon: '\u{1F308}',
      text: `You're exploring ${variety} different categories. Good range.`,
    });
  }

  if (!insights.length) {
    insights.push({
      icon: '\u{1F331}',
      text: 'Keep using sessions and insights will appear here as your patterns emerge.',
    });
  }

  return insights;
}
