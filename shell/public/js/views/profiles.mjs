/**
 * Profile management view
 * List, edit weights, filters, arc templates
 */
import { api, getState, el, escapeHTML, profileStyle, showToast, CATEGORY_COLORS } from '../app.mjs';

const ARC_TEMPLATES = [
  { id: 'standard', label: 'Standard', desc: 'Opener \u2192 Builder \u2192 Peak \u2192 Closer' },
  { id: 'wind-down', label: 'Wind Down', desc: 'Gentle ramp down over the session' },
  { id: 'deep-dive', label: 'Deep Dive', desc: 'Sustained focus on one category' },
];

export async function render(container, params) {
  const state = getState();
  container.innerHTML = '';

  container.appendChild(el('h1', { className: 'page-title' }, 'Profiles'));
  container.appendChild(el('p', { className: 'page-subtitle' }, 'Shape your algorithm'));

  // Load profiles
  let profiles = state.profiles;
  if (!profiles.length) {
    try {
      profiles = await api.listProfiles();
      state.profiles = profiles;
    } catch {
      profiles = [];
    }
  }

  // If editing a specific profile
  if (params?.id) {
    const profile = profiles.find(p => p.id === params.id);
    if (profile) {
      renderEditor(container, profile, state);
      return;
    }
  }

  // Profile list
  if (!profiles.length) {
    container.appendChild(el('div', { className: 'empty-state' },
      el('div', { className: 'empty-icon' }, '\u{1F3A8}'),
      el('div', { className: 'empty-text' }, 'No profiles yet. Add a provider first.'),
      el('a', { href: '#/settings', className: 'btn btn--primary btn--round' }, 'Go to Settings'),
    ));
    return;
  }

  for (const profile of profiles) {
    const style = profileStyle(profile.id);
    const card = el('div', {
      className: 'card card--interactive profile-card',
      onClick: () => { location.hash = `#/profiles/${profile.id}`; },
    });

    // Weight preview: top 3 categories
    const weights = profile.weights || {};
    const topCats = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, w]) => `${cat.replace('_', ' ')} ${Math.round(w * 100)}%`)
      .join(' \u00B7 ');

    card.innerHTML = `
      <div class="card-header">
        <div class="card-icon" style="background: ${style.color}22; color: ${style.color};">
          <span style="font-size: 22px;">${style.emoji}</span>
        </div>
        <div style="flex: 1;">
          <div class="card-title">${escapeHTML(profile.name)}</div>
          <div class="card-desc">${escapeHTML(profile.description || '')}</div>
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div style="font-size: 13px; color: var(--text-muted);">
        ${topCats} \u00B7 ${profile.target_duration_minutes || 15} min \u00B7 ${profile.preferred_arc_template || 'standard'}
      </div>`;

    container.appendChild(card);
  }
}

function renderEditor(container, profile, state) {
  const style = profileStyle(profile.id);

  // Back button
  const back = el('button', { className: 'btn btn--ghost mb-16', onClick: () => { location.hash = '#/profiles'; } });
  back.innerHTML = '\u2190 Back to profiles';
  container.appendChild(back);

  // Profile header
  const header = el('div', { className: 'card mb-16' });
  header.innerHTML = `
    <div class="card-header" style="margin-bottom: 0;">
      <span style="font-size: 32px;">${style.emoji}</span>
      <div>
        <div class="card-title" style="font-size: 20px;">${escapeHTML(profile.name)}</div>
        <div class="card-desc">${escapeHTML(profile.description || '')}</div>
      </div>
    </div>`;
  container.appendChild(header);

  // Working copy of weights for editing
  const editWeights = { ...(profile.weights || {}) };

  // Category Weights
  container.appendChild(el('h2', { className: 'section-title' }, 'Category Weights'));
  const weightsCard = el('div', { className: 'card mb-16' });

  const categories = Object.keys(editWeights);
  for (const cat of categories) {
    const group = el('div', { className: 'slider-group' });
    const pct = Math.round(editWeights[cat] * 100);
    const color = CATEGORY_COLORS[cat] || 'var(--primary)';

    group.innerHTML = `
      <div class="slider-header">
        <span class="slider-label" style="color: ${color};">${cat.replace('_', ' ')}</span>
        <span class="slider-value" data-cat="${cat}">${pct}%</span>
      </div>`;

    const slider = el('input', {
      type: 'range',
      className: 'slider',
      min: '0',
      max: '100',
      value: String(pct),
      'aria-label': `${cat} weight`,
      onInput: (e) => {
        const val = parseInt(e.target.value, 10);
        editWeights[cat] = val / 100;
        group.querySelector('.slider-value').textContent = `${val}%`;
        updatePreview();
      },
    });
    group.appendChild(slider);
    weightsCard.appendChild(group);
  }
  container.appendChild(weightsCard);

  // Filters
  container.appendChild(el('h2', { className: 'section-title' }, 'Filters'));
  const filtersCard = el('div', { className: 'card mb-16' });
  const editFilters = { ...(profile.filters || {}) };

  const filterToggles = [
    { key: 'exclude_rage_bait', label: 'Exclude rage bait' },
    { key: 'exclude_humiliation', label: 'Exclude humiliation' },
    { key: 'exclude_shock_content', label: 'Exclude shock content' },
  ];

  for (const ft of filterToggles) {
    const row = el('div', { className: 'toggle-row' });
    const toggle = el('button', {
      className: `toggle${editFilters[ft.key] ? ' active' : ''}`,
      'aria-label': ft.label,
      onClick: () => {
        editFilters[ft.key] = !editFilters[ft.key];
        toggle.classList.toggle('active');
      },
    });
    row.appendChild(el('span', { className: 'toggle-label' }, ft.label));
    row.appendChild(toggle);
    filtersCard.appendChild(row);
  }

  // Max cognitive load slider
  const cogGroup = el('div', { className: 'slider-group', style: 'margin-top: 12px' });
  const cogVal = Math.round((editFilters.max_cognitive_load || 0.7) * 100);
  cogGroup.innerHTML = `
    <div class="slider-header">
      <span class="slider-label">Max cognitive load</span>
      <span class="slider-value" id="cog-val">${cogVal}%</span>
    </div>`;
  const cogSlider = el('input', {
    type: 'range', className: 'slider', min: '10', max: '100', value: String(cogVal),
    onInput: (e) => {
      editFilters.max_cognitive_load = parseInt(e.target.value, 10) / 100;
      cogGroup.querySelector('#cog-val').textContent = `${e.target.value}%`;
    },
  });
  cogGroup.appendChild(cogSlider);
  filtersCard.appendChild(cogGroup);
  container.appendChild(filtersCard);

  // Arc Template
  container.appendChild(el('h2', { className: 'section-title' }, 'Arc Template'));
  const arcCard = el('div', { className: 'card mb-16' });
  let selectedArc = profile.preferred_arc_template || 'standard';

  for (const tmpl of ARC_TEMPLATES) {
    const row = el('button', {
      className: `toggle-row`,
      style: 'width: 100%; text-align: left; cursor: pointer;',
      onClick: () => {
        selectedArc = tmpl.id;
        arcCard.querySelectorAll('.toggle-row').forEach((r, i) => {
          const dot = r.querySelector('.toggle');
          dot.classList.toggle('active', ARC_TEMPLATES[i].id === selectedArc);
        });
      },
    });
    row.innerHTML = `
      <div>
        <div class="toggle-label" style="font-weight: 500;">${tmpl.label}</div>
        <div style="font-size: 12px; color: var(--text-muted);">${tmpl.desc}</div>
      </div>`;
    const dot = el('button', { className: `toggle${tmpl.id === selectedArc ? ' active' : ''}` });
    row.appendChild(dot);
    arcCard.appendChild(row);
  }
  container.appendChild(arcCard);

  // Duration
  container.appendChild(el('h2', { className: 'section-title' }, 'Session Duration'));
  const durCard = el('div', { className: 'card mb-16' });
  let selectedDuration = profile.target_duration_minutes || 15;
  const durPicker = el('div', { className: 'duration-picker' });

  for (const d of [5, 10, 15, 20, 30, 45]) {
    const btn = el('button', {
      className: `duration-opt${d === selectedDuration ? ' selected' : ''}`,
      onClick: () => {
        selectedDuration = d;
        durPicker.querySelectorAll('.duration-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      },
    }, `${d} min`);
    durPicker.appendChild(btn);
  }
  durCard.appendChild(durPicker);
  container.appendChild(durCard);

  // Preview section
  container.appendChild(el('h2', { className: 'section-title' }, 'Preview'));
  const previewCard = el('div', { className: 'card mb-16', id: 'profile-preview' });
  container.appendChild(previewCard);
  updatePreview();

  function updatePreview() {
    const preview = document.getElementById('profile-preview');
    if (!preview) return;

    const sorted = Object.entries(editWeights)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    const total = sorted.reduce((s, [, v]) => s + v, 0);

    preview.innerHTML = `
      <div class="card-desc mb-8">Based on these weights, your session would look like:</div>
      ${sorted.map(([cat, w]) => {
        const pct = total > 0 ? Math.round((w / total) * 100) : 0;
        const color = CATEGORY_COLORS[cat] || 'var(--primary)';
        return `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="width: 90px; font-size: 13px; text-transform: capitalize;">${cat.replace('_', ' ')}</span>
          <div style="flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
          </div>
          <span style="font-size: 12px; color: var(--text-muted); width: 36px; text-align: right;">${pct}%</span>
        </div>`;
      }).join('')}`;
  }

  // Save button
  const saveBtn = el('button', {
    className: 'btn btn--primary btn--full btn--round',
    onClick: async () => {
      try {
        const updated = {
          ...profile,
          weights: editWeights,
          filters: editFilters,
          preferred_arc_template: selectedArc,
          target_duration_minutes: selectedDuration,
        };
        await api.saveProfile(updated);
        // Update local state
        const idx = state.profiles.findIndex(p => p.id === profile.id);
        if (idx >= 0) state.profiles[idx] = updated;
        showToast('Profile saved');
      } catch (err) {
        showToast(err.message);
      }
    },
  }, 'Save Profile');
  container.appendChild(saveBtn);

  container.appendChild(el('div', { style: 'height: 24px' }));
}
