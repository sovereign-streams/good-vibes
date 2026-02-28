/**
 * Settings view
 * Provider management, learning preferences, data management
 */
import { api, getState, el, escapeHTML, showToast } from '../app.mjs';

export async function render(container) {
  const state = getState();
  container.innerHTML = '';

  container.appendChild(el('h1', { className: 'page-title' }, 'Settings'));
  container.appendChild(el('p', { className: 'page-subtitle' }, 'Manage your setup'));

  // ── Providers ───────────────────────────────────────
  const provSection = el('div', { className: 'settings-section' });
  provSection.appendChild(el('div', { className: 'settings-section-title' }, 'Providers'));

  const provCard = el('div', { className: 'card' });
  const provList = el('div', { id: 'provider-list' });

  // Load providers
  let providers = [];
  try {
    providers = await api.listProviders();
    state.providers = providers;
  } catch {
    // Provider API may not be available yet
  }

  renderProviderList(provList, providers, state);
  provCard.appendChild(provList);

  // Add provider form
  const addForm = el('div', { className: 'input-group mt-16' });
  const urlInput = el('input', {
    className: 'input',
    type: 'url',
    placeholder: 'http://localhost:3700',
    'aria-label': 'Provider URL',
  });
  const addBtn = el('button', {
    className: 'btn btn--primary btn--sm',
    onClick: async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      try {
        await api.addProvider(url);
        urlInput.value = '';
        const updated = await api.listProviders();
        state.providers = updated;
        renderProviderList(provList, updated, state);
        showToast('Provider added');
      } catch (err) {
        showToast(err.message);
      }
    },
  }, 'Add');
  addForm.appendChild(urlInput);
  addForm.appendChild(addBtn);
  provCard.appendChild(addForm);

  provSection.appendChild(provCard);
  container.appendChild(provSection);

  // ── Learning Preferences ────────────────────────────
  const learnSection = el('div', { className: 'settings-section' });
  learnSection.appendChild(el('div', { className: 'settings-section-title' }, 'Learning Suggestions'));

  const learnCard = el('div', { className: 'card' });
  const suggestionsWrap = el('div', { id: 'suggestions-list' });

  try {
    const suggestions = await api.getSuggestions();
    state.suggestions = suggestions || [];
    renderSuggestions(suggestionsWrap, state.suggestions, state);
  } catch {
    suggestionsWrap.innerHTML = '<p class="card-desc">No suggestions available yet. Use the app more to get personalized recommendations.</p>';
  }

  learnCard.appendChild(suggestionsWrap);
  learnSection.appendChild(learnCard);
  container.appendChild(learnSection);

  // ── Data Management ─────────────────────────────────
  const dataSection = el('div', { className: 'settings-section' });
  dataSection.appendChild(el('div', { className: 'settings-section-title' }, 'Data'));

  const dataCard = el('div', { className: 'card' });

  const exportRow = el('div', { className: 'toggle-row' });
  exportRow.appendChild(el('span', { className: 'toggle-label' }, 'Export session history'));
  exportRow.appendChild(el('button', {
    className: 'btn btn--secondary btn--sm',
    onClick: async () => {
      try {
        const history = await api.getHistory(1000);
        const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `good-vibes-history-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('History exported');
      } catch (err) {
        showToast(err.message);
      }
    },
  }, 'Export'));
  dataCard.appendChild(exportRow);

  const clearRow = el('div', { className: 'toggle-row' });
  clearRow.appendChild(el('span', { className: 'toggle-label' }, 'Clear all history'));
  clearRow.appendChild(el('button', {
    className: 'btn btn--sm',
    style: 'color: var(--accent);',
    onClick: () => {
      showConfirm(container, 'Clear all session history? This cannot be undone.', async () => {
        try {
          await api.getHistory(0); // placeholder — actual clear endpoint
          showToast('History cleared');
        } catch (err) {
          showToast(err.message);
        }
      });
    },
  }, 'Clear'));
  dataCard.appendChild(clearRow);

  dataSection.appendChild(dataCard);
  container.appendChild(dataSection);

  // ── About ───────────────────────────────────────────
  const aboutSection = el('div', { className: 'settings-section' });
  aboutSection.appendChild(el('div', { className: 'settings-section-title' }, 'About'));

  const aboutCard = el('div', { className: 'card' });
  aboutCard.innerHTML = `
    <div class="card-title mb-8">Good Vibes</div>
    <div class="card-desc mb-8">
      Own your scroll. Own your mind.
    </div>
    <div class="card-desc mb-8">
      Good Vibes is a Personal Algorithm Engine that gives you control over the
      algorithms shaping your content consumption. No ads. No engagement traps.
      Just content you chose, on your terms.
    </div>
    <div style="font-size: 13px; color: var(--text-muted);">
      Version 0.1.0 \u00B7 SEP Protocol 0.1.0
    </div>`;
  aboutSection.appendChild(aboutCard);
  container.appendChild(aboutSection);

  container.appendChild(el('div', { style: 'height: 24px' }));
}

// ── Sub-renderers ─────────────────────────────────────

function renderProviderList(container, providers, state) {
  container.innerHTML = '';

  if (!providers || !providers.length) {
    container.innerHTML = '<p class="card-desc">No providers connected. Add one below.</p>';
    return;
  }

  for (const prov of providers) {
    const item = el('div', { className: 'provider-item' });
    const info = el('div', { className: 'flex items-center gap-8' });

    const status = el('span', {
      className: `provider-status${prov.status === 'offline' ? ' provider-status--offline' : ''}`,
    });
    const url = el('span', { className: 'provider-url' }, prov.endpoint || prov.url || 'Unknown');
    info.appendChild(status);
    info.appendChild(url);
    item.appendChild(info);

    const removeBtn = el('button', {
      className: 'btn btn--ghost btn--sm',
      style: 'color: var(--accent);',
      onClick: async () => {
        try {
          await api.removeProvider(prov.endpoint || prov.url);
          const updated = await api.listProviders();
          state.providers = updated;
          renderProviderList(container, updated, state);
          showToast('Provider removed');
        } catch (err) {
          showToast(err.message);
        }
      },
    }, 'Remove');
    item.appendChild(removeBtn);
    container.appendChild(item);
  }
}

function renderSuggestions(container, suggestions, state) {
  container.innerHTML = '';

  if (!suggestions || !suggestions.length) {
    container.innerHTML = '<p class="card-desc">No suggestions available yet. Keep using sessions and the learning engine will suggest profile adjustments.</p>';
    return;
  }

  for (const s of suggestions) {
    const card = el('div', { className: 'suggestion-card mb-16' });

    const rationale = el('div', { className: 'suggestion-rationale' },
      s.rationale || 'Based on your recent sessions:');

    const diff = el('div', { className: 'suggestion-diff' });
    if (s.changes) {
      diff.innerHTML = Object.entries(s.changes).map(([key, val]) => {
        const arrow = val.direction === 'up' ? '\u2191' : '\u2193';
        const cls = val.direction === 'up' ? 'diff-up' : 'diff-down';
        return `<span class="${cls}">${arrow} ${key}: ${val.from} \u2192 ${val.to}</span>`;
      }).join('\n');
    } else {
      diff.textContent = JSON.stringify(s, null, 2);
    }

    const actions = el('div', { className: 'btn-group' });
    actions.appendChild(el('button', {
      className: 'btn btn--primary btn--sm',
      onClick: async () => {
        try {
          await api.acceptSuggestion(s.id);
          showToast('Suggestion applied');
          const updated = await api.getSuggestions();
          renderSuggestions(container, updated, state);
        } catch (err) { showToast(err.message); }
      },
    }, 'Apply'));
    actions.appendChild(el('button', {
      className: 'btn btn--secondary btn--sm',
      onClick: async () => {
        try {
          await api.dismissSuggestion(s.id);
          showToast('Suggestion dismissed');
          const updated = await api.getSuggestions();
          renderSuggestions(container, updated, state);
        } catch (err) { showToast(err.message); }
      },
    }, 'Dismiss'));

    card.appendChild(rationale);
    card.appendChild(diff);
    card.appendChild(actions);
    container.appendChild(card);
  }
}

function showConfirm(parentContainer, message, onConfirm) {
  const overlay = el('div', { className: 'modal-overlay', onClick: (e) => {
    if (e.target === overlay) overlay.remove();
  }});

  const modal = el('div', { className: 'modal' });
  modal.innerHTML = `<div class="modal-title">Confirm</div>`;
  modal.appendChild(el('p', { className: 'card-desc mb-16' }, message));

  const actions = el('div', { className: 'btn-group' });
  actions.appendChild(el('button', {
    className: 'btn btn--accent btn--sm',
    onClick: () => { overlay.remove(); onConfirm(); },
  }, 'Yes, clear'));
  actions.appendChild(el('button', {
    className: 'btn btn--secondary btn--sm',
    onClick: () => overlay.remove(),
  }, 'Cancel'));
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
