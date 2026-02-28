/**
 * Session view — THE main experience
 * Content player, arc progress, engagement, completion
 */
import { api, getState, el, escapeHTML, formatDuration, showToast, CATEGORY_COLORS } from '../app.mjs';

const PHASE_NAMES = ['Opener', 'Builder', 'Peak', 'Closer'];
const ENGAGEMENT_OPTIONS = [
  { key: 'loved', icon: '\u2764\uFE0F',  label: 'Loved it' },
  { key: 'meh',   icon: '\u{1F937}', label: 'Meh' },
  { key: 'nope',  icon: '\u{1F44E}', label: 'Not for me' },
];

// Touch tracking for swipe gestures
let touchStartX = 0;
let touchStartY = 0;

export async function render(container) {
  const state = getState();

  // No active session — redirect home
  if (!state.activeSession || !state.activeSession.composed) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F3B5}</div>
        <div class="empty-text">No active session</div>
        <a href="#/" class="btn btn--primary btn--round">Start one</a>
      </div>`;
    return;
  }

  // Session complete state
  if (state.sessionComplete) {
    renderComplete(container, state);
    return;
  }

  const composed = state.activeSession.composed;
  const items = composed.items || [];
  const idx = state.currentItemIndex;
  const item = items[idx];

  if (!item) {
    completeSession(container, state);
    return;
  }

  container.innerHTML = '';
  container.className = 'app-main session-view fade-in';

  // Phase info
  const currentPhase = getPhase(idx, items.length);
  const header = el('div', { className: 'session-header' });
  header.innerHTML = `
    <span class="session-phase">${PHASE_NAMES[currentPhase] || 'Playing'}</span>
    <span class="session-counter">${idx + 1} / ${items.length}</span>`;
  container.appendChild(header);

  // Arc progress bar
  container.appendChild(renderArcBar(idx, items.length));

  // Energy curve visualization
  container.appendChild(renderEnergyCurve(items, idx));

  // Video player
  container.appendChild(renderPlayer(item));

  // Item info
  const info = el('div', { className: 'item-info' });
  info.innerHTML = `
    <div class="item-title">${escapeHTML(item.meta?.title || 'Untitled')}</div>
    <div class="item-creator">${escapeHTML(item.meta?.creator || item.source?.platform || '')}</div>`;

  // Tags
  const tags = el('div', { className: 'item-meta' });
  const cats = item.enrichment_summary?.categories || item.enrichment?.categories?.map(c => c.id) || [];
  for (const cat of cats.slice(0, 3)) {
    tags.appendChild(el('span', { className: 'tag tag--category' }, cat.replace('_', ' ')));
  }
  const tone = item.enrichment_summary?.primary_tone || item.enrichment?.emotional_tone?.primary;
  if (tone) tags.appendChild(el('span', { className: 'tag tag--tone' }, tone));

  const energy = item.enrichment_summary?.energy_level ?? item.enrichment?.energy_level;
  if (energy != null) {
    tags.appendChild(el('span', { className: 'tag tag--energy' }, `energy ${Math.round(energy * 100)}%`));
  }

  info.appendChild(tags);
  container.appendChild(info);

  // Controls
  const controls = el('div', { className: 'session-controls' });

  const replayBtn = el('button', { className: 'control-btn', 'aria-label': 'Replay', onClick: () => {
    render(container);
  }});
  replayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';

  const nextBtn = el('button', { className: 'control-btn control-btn--main', 'aria-label': 'Next', onClick: () => {
    goNext(container, state);
  }});
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 4l10 8-10 8V4z"/><rect x="17" y="4" width="2" height="16"/></svg>';

  const skipBtn = el('button', { className: 'control-btn', 'aria-label': 'Skip', onClick: () => {
    recordEngagement(state, item, 'skipped');
    goNext(container, state);
  }});
  skipBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  controls.appendChild(replayBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(skipBtn);
  container.appendChild(controls);

  // Engagement buttons
  const engageRow = el('div', { className: 'engagement-row' });
  const currentEngagement = state.engagements[item.item_id];

  for (const opt of ENGAGEMENT_OPTIONS) {
    const btn = el('button', {
      className: `engage-btn${currentEngagement === opt.key ? ' selected' : ''}`,
      onClick: () => {
        state.engagements[item.item_id] = opt.key;
        recordEngagement(state, item, opt.key);
        engageRow.querySelectorAll('.engage-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      },
    });
    btn.innerHTML = `
      <span class="engage-btn-icon">${opt.icon}</span>
      <span>${opt.label}</span>`;
    engageRow.appendChild(btn);
  }
  container.appendChild(engageRow);

  // Swipe hint (mobile)
  container.appendChild(el('div', { className: 'swipe-hint' }, 'Swipe left to skip \u2192'));

  // Session progress bar
  const progressPct = Math.round(((idx + 1) / items.length) * 100);
  const progressWrap = el('div', { style: 'margin-top: 8px' });
  progressWrap.innerHTML = `
    <div class="progress-bar"><div class="progress-fill" style="width: ${progressPct}%"></div></div>
    <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 4px;">
      <span>${formatDuration(getElapsedSeconds(items, idx))} elapsed</span>
      <span>${formatDuration(getRemainingSeconds(items, idx))} remaining</span>
    </div>`;
  container.appendChild(progressWrap);

  // Register swipe gestures
  setupSwipe(container, state);
}

// ── Sub-renderers ─────────────────────────────────────

function renderPlayer(item) {
  const frame = el('div', { className: 'player-frame' });
  const videoId = item.source?.origin_id || extractYouTubeId(item.source?.origin_url || '');

  if (videoId) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.title = item.meta?.title || 'Video player';
    frame.appendChild(iframe);
  } else {
    frame.innerHTML = `
      <div class="player-placeholder">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>${escapeHTML(item.source?.content_type || 'content')}</span>
      </div>`;
  }
  return frame;
}

function renderArcBar(currentIdx, totalItems) {
  const container = el('div', { className: 'arc-container' });
  const phases = el('div', { className: 'arc-phases' });
  const labels = el('div', { className: 'arc-labels' });

  const phaseCount = Math.min(4, totalItems);
  const itemsPerPhase = totalItems / phaseCount;

  for (let i = 0; i < phaseCount; i++) {
    const phaseEl = el('div', { className: 'arc-phase' });
    const phaseStart = Math.floor(i * itemsPerPhase);
    const phaseEnd = Math.floor((i + 1) * itemsPerPhase);

    if (currentIdx >= phaseEnd) phaseEl.classList.add('arc-phase--done');
    else if (currentIdx >= phaseStart) phaseEl.classList.add('arc-phase--active');

    phases.appendChild(phaseEl);

    const labelEl = el('span', { className: currentIdx >= phaseStart && currentIdx < phaseEnd ? 'arc-label--active' : '' },
      PHASE_NAMES[i] || '');
    labels.appendChild(labelEl);
  }

  container.appendChild(phases);
  container.appendChild(labels);
  return container;
}

function renderEnergyCurve(items, currentIdx) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'energy-curve');
  svg.setAttribute('viewBox', '0 0 300 60');
  svg.setAttribute('preserveAspectRatio', 'none');

  if (items.length < 2) return svg;

  const w = 300;
  const h = 50;
  const padY = 5;
  const points = items.map((item, i) => {
    const x = (i / (items.length - 1)) * w;
    const energy = item.enrichment_summary?.energy_level ?? item.enrichment?.energy_level ?? 0.5;
    const y = padY + (1 - energy) * h;
    return { x, y };
  });

  // Area fill
  const areaPath = `M${points[0].x},${h + padY} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${h + padY}Z`;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'energy-curve-area');
  svg.appendChild(area);

  // Line
  const linePath = `M${points.map(p => `${p.x},${p.y}`).join(' L')}`;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', linePath);
  line.setAttribute('class', 'energy-curve-line');
  svg.appendChild(line);

  // Dots
  for (let i = 0; i < points.length; i++) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', points[i].x);
    dot.setAttribute('cy', points[i].y);
    dot.setAttribute('r', i === currentIdx ? 5 : 3);
    dot.setAttribute('class', i === currentIdx ? 'energy-curve-dot energy-curve-dot--current' : 'energy-curve-dot');
    svg.appendChild(dot);
  }

  return svg;
}

function renderComplete(container, state) {
  const composed = state.activeSession.composed;
  const items = composed.items || [];
  const totalDuration = items.reduce((sum, it) => sum + (it.source?.duration_seconds || 0), 0);

  container.innerHTML = '';
  container.className = 'app-main fade-in';

  const wrap = el('div', { className: 'session-complete' });
  wrap.innerHTML = `
    <div class="complete-icon">\u{1F305}</div>
    <div class="complete-title">Session complete \u2014 nice work</div>
    <div class="complete-message">
      You just spent ${formatDuration(totalDuration)} on content you chose,
      shaped by an algorithm you control.
    </div>
    <div class="complete-stats">
      <div class="complete-stat">
        <div class="complete-stat-value">${items.length}</div>
        <div class="complete-stat-label">items</div>
      </div>
      <div class="complete-stat">
        <div class="complete-stat-value">${formatDuration(totalDuration)}</div>
        <div class="complete-stat-label">duration</div>
      </div>
      <div class="complete-stat">
        <div class="complete-stat-value">${composed.flow_score ? Math.round(composed.flow_score * 100) + '%' : '\u2014'}</div>
        <div class="complete-stat-label">flow</div>
      </div>
    </div>
    <a href="#/" class="btn btn--primary btn--round">Back to Home</a>
    <div class="nudge">\u{1F331} Put the phone down. That was enough.</div>`;

  container.appendChild(wrap);

  // Send final telemetry
  sendSessionComplete(state);
}

// ── Helpers ───────────────────────────────────────────

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function getPhase(idx, total) {
  if (total <= 1) return 0;
  const pct = idx / (total - 1);
  if (pct < 0.2) return 0;      // opener
  if (pct < 0.5) return 1;      // builder
  if (pct < 0.8) return 2;      // peak
  return 3;                      // closer
}

function getElapsedSeconds(items, currentIdx) {
  let sum = 0;
  for (let i = 0; i < currentIdx; i++) {
    sum += items[i]?.source?.duration_seconds || 0;
  }
  return sum;
}

function getRemainingSeconds(items, currentIdx) {
  let sum = 0;
  for (let i = currentIdx; i < items.length; i++) {
    sum += items[i]?.source?.duration_seconds || 0;
  }
  return sum;
}

function goNext(container, state) {
  const items = state.activeSession.composed.items || [];
  if (state.currentItemIndex + 1 >= items.length) {
    completeSession(container, state);
  } else {
    state.currentItemIndex++;
    render(container);
  }
}

function completeSession(container, state) {
  state.sessionComplete = true;
  render(container);
}

async function recordEngagement(state, item, signal) {
  if (!state.activeSession?.session_id || !item?.item_id) return;
  try {
    await api.reportEngagement(state.activeSession.session_id, {
      items: [{
        item_id: item.item_id,
        signal,
        completion_rate: signal === 'loved' ? 1.0 : signal === 'meh' ? 0.7 : 0.2,
      }]
    });
  } catch {
    // Non-critical — silent fail
  }
}

async function sendSessionComplete(state) {
  if (!state.activeSession?.session_id) return;
  try {
    await api.reportEngagement(state.activeSession.session_id, {
      session_completed: true,
      items: Object.entries(state.engagements).map(([item_id, signal]) => ({
        item_id,
        signal,
        completion_rate: signal === 'loved' ? 1.0 : signal === 'meh' ? 0.7 : 0.2,
      }))
    });
  } catch {
    // Non-critical
  }
}

// ── Swipe Gestures ────────────────────────────────────

function setupSwipe(container, state) {
  container.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // Only horizontal swipes, minimum 60px, and more horizontal than vertical
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) {
        // Swipe left → next/skip
        goNext(container, state);
      }
      // Swipe right could be "replay" but let's keep it simple
    }
  }, { passive: true });
}
