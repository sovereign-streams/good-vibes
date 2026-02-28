/**
 * Home / Dashboard view
 * Quick-start profiles, active session, recent history
 */
import { api, getState, el, escapeHTML, profileStyle, timeAgo, formatDuration, showToast } from '../app.mjs';

export async function render(container) {
  const state = getState();
  container.innerHTML = '';

  // Page header
  container.appendChild(el('h1', { className: 'page-title' }, 'Good Vibes'));
  container.appendChild(el('p', { className: 'page-subtitle' }, 'Own your scroll. Own your mind.'));

  // Active session card (if exists)
  if (state.activeSession) {
    const session = state.activeSession;
    const composed = session.composed;
    const progress = composed
      ? Math.round((state.currentItemIndex / composed.item_count) * 100)
      : 0;

    const activeCard = el('div', { className: 'card card--highlight card--interactive', onClick: () => {
      location.hash = '#/session';
    }});
    activeCard.innerHTML = `
      <div class="card-header">
        <div class="card-icon" style="background: var(--primary); color: white;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <div>
          <div class="card-title">Session in progress</div>
          <div class="card-desc">${escapeHTML(session.profile?.name || 'Custom session')}</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        ${state.currentItemIndex + 1} of ${composed?.item_count || '?'} items \u00B7 ${progress}% complete
      </div>`;
    container.appendChild(activeCard);
    container.appendChild(el('div', { style: 'height: 24px' }));
  }

  // Quick-start profiles
  container.appendChild(el('h2', { className: 'section-title' }, 'Start a session'));

  const grid = el('div', { className: 'profile-grid' });

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

  if (profiles.length) {
    for (const profile of profiles) {
      const style = profileStyle(profile.id);
      const btn = el('button', {
        className: 'profile-btn',
        onClick: () => startSession(profile.id),
      });
      btn.innerHTML = `
        <span class="profile-btn-emoji">${style.emoji}</span>
        <span class="profile-btn-name">${escapeHTML(profile.name)}</span>
        <span class="profile-btn-dur">${profile.target_duration_minutes || 15} min</span>`;
      grid.appendChild(btn);
    }
  } else {
    grid.innerHTML = '<p class="card-desc" style="grid-column: 1/-1; text-align: center; padding: 16px;">No profiles loaded yet. Add a provider in Settings.</p>';
  }

  container.appendChild(grid);

  // Custom session section
  container.appendChild(el('h2', { className: 'section-title' }, 'Custom session'));

  const customCard = el('div', { className: 'card' });
  let selectedDuration = 15;

  customCard.innerHTML = `
    <div class="card-desc mb-8">Pick a duration and go.</div>
    <div class="duration-picker">
      <button class="duration-opt" data-dur="5">5 min</button>
      <button class="duration-opt selected" data-dur="15">15 min</button>
      <button class="duration-opt" data-dur="30">30 min</button>
      <button class="duration-opt" data-dur="45">45 min</button>
    </div>`;

  const startBtn = el('button', {
    className: 'btn btn--primary btn--full btn--round',
    onClick: () => startSession(null, selectedDuration),
  }, 'Start Session');

  customCard.appendChild(startBtn);

  // Duration picker interaction
  customCard.querySelectorAll('.duration-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      customCard.querySelectorAll('.duration-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedDuration = parseInt(opt.dataset.dur, 10);
    });
  });

  container.appendChild(customCard);

  // Recent history
  container.appendChild(el('div', { style: 'height: 24px' }));
  container.appendChild(el('h2', { className: 'section-title' }, 'Recent sessions'));

  try {
    const history = await api.getHistory(5);
    state.history = history;

    if (history && history.length) {
      const historyCard = el('div', { className: 'card' });
      for (const item of history) {
        const row = el('div', { className: 'history-item' });
        row.innerHTML = `
          <div>
            <div class="history-profile">${escapeHTML(item.profile_name || 'Session')}</div>
            <div class="history-meta">${item.item_count || 0} items \u00B7 ${formatDuration(item.duration_seconds || 0)}</div>
          </div>
          <div class="history-meta">${timeAgo(item.completed_at || item.created_at)}</div>`;
        historyCard.appendChild(row);
      }
      container.appendChild(historyCard);
    } else {
      container.appendChild(el('div', { className: 'empty-state' },
        el('div', { className: 'empty-text' }, 'No sessions yet. Start one above!')
      ));
    }
  } catch {
    container.appendChild(el('div', { className: 'empty-state' },
      el('div', { className: 'empty-text' }, 'Could not load history.')
    ));
  }
}

async function startSession(profileId, duration) {
  const state = getState();
  state.loading = true;

  try {
    const opts = {};
    if (profileId) opts.profile_id = profileId;
    if (duration) opts.target_duration_minutes = duration;

    const session = await api.createSession(opts);
    const content = await api.requestContent(session.session_id);

    state.activeSession = { ...session, composed: content.composed };
    state.currentItemIndex = 0;
    state.sessionComplete = false;
    state.engagements = {};

    location.hash = '#/session';
  } catch (err) {
    showToast(err.message);
  } finally {
    state.loading = false;
  }
}
