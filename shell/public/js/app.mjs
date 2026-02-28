/**
 * Good Vibes — Main app shell
 * Router, API client, state management, view orchestration
 */

// ── State Store ───────────────────────────────────────
const listeners = new Set();

const store = new Proxy({
  // Session state
  activeSession: null,        // Current composed session
  currentItemIndex: 0,        // Index within session items
  sessionComplete: false,
  engagements: {},            // { item_id: 'loved' | 'meh' | 'nope' }

  // Data
  profiles: [],
  activeProfile: null,
  providers: [],
  suggestions: [],
  history: [],
  stats: null,

  // UI
  loading: false,
  error: null,
  route: 'home',
  routeParams: {},
  toast: null,
}, {
  set(target, key, value) {
    target[key] = value;
    listeners.forEach(fn => fn(key, value));
    return true;
  }
});

export function getState() { return store; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── API Client ────────────────────────────────────────
const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Cannot reach server. Are you offline?');
    }
    throw err;
  }
}

export const api = {
  // Profiles
  listProfiles: () => apiFetch('/profiles'),
  getProfile: (id) => apiFetch(`/profiles/${encodeURIComponent(id)}`),
  saveProfile: (profile) => apiFetch(`/profiles/${encodeURIComponent(profile.id)}`, {
    method: 'PUT', body: profile
  }),
  setActiveProfile: (id) => apiFetch('/profiles/active', {
    method: 'PUT', body: { profile_id: id }
  }),

  // Sessions
  createSession: (opts) => apiFetch('/sessions', { method: 'POST', body: opts }),
  getSession: (id) => apiFetch(`/sessions/${encodeURIComponent(id)}`),
  requestContent: (sessionId) => apiFetch(`/sessions/${encodeURIComponent(sessionId)}/content`, {
    method: 'POST'
  }),
  reportEngagement: (sessionId, signals) => apiFetch(
    `/sessions/${encodeURIComponent(sessionId)}/engagement`,
    { method: 'POST', body: signals }
  ),

  // Providers
  listProviders: () => apiFetch('/providers'),
  addProvider: (endpoint) => apiFetch('/providers', { method: 'POST', body: { endpoint } }),
  removeProvider: (endpoint) => apiFetch(`/providers/${encodeURIComponent(endpoint)}`, {
    method: 'DELETE'
  }),

  // Learning
  getSuggestions: () => apiFetch('/learning/suggestions'),
  acceptSuggestion: (id) => apiFetch(`/learning/suggestions/${encodeURIComponent(id)}/accept`, {
    method: 'POST'
  }),
  dismissSuggestion: (id) => apiFetch(`/learning/suggestions/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST'
  }),

  // Stats
  getStats: () => apiFetch('/stats'),

  // History
  getHistory: (limit = 20) => apiFetch(`/history?limit=${limit}`),
};

// ── Toast ─────────────────────────────────────────────
let toastTimeout;

export function showToast(message, duration = 3000) {
  clearTimeout(toastTimeout);
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => {
    el.classList.add('visible');
  });
  toastTimeout = setTimeout(() => el.classList.remove('visible'), duration);
}

// ── Router ────────────────────────────────────────────
const routes = {};

export function registerRoute(name, renderFn) {
  routes[name] = renderFn;
}

function parseHash(hash) {
  const clean = (hash || '#/').replace('#', '');
  const [path, query] = clean.split('?');
  const segments = path.split('/').filter(Boolean);
  const params = {};

  if (query) {
    for (const pair of query.split('&')) {
      const [k, v] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }

  const routeName = segments[0] || 'home';
  if (segments.length > 1) params.id = segments[1];

  return { routeName, params };
}

async function navigate() {
  const { routeName, params } = parseHash(location.hash);
  const view = document.getElementById('view');

  store.route = routeName;
  store.routeParams = params;

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    const linkRoute = link.dataset.route;
    link.classList.toggle('active', linkRoute === routeName);
  });

  const renderFn = routes[routeName];
  if (renderFn) {
    view.innerHTML = '';
    view.className = 'app-main fade-in';
    try {
      await renderFn(view, params);
    } catch (err) {
      console.error(`Route render error [${routeName}]:`, err);
      view.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">!</div>
          <div class="empty-text">${escapeHTML(err.message)}</div>
          <a href="#/" class="btn btn--primary">Go Home</a>
        </div>`;
    }
  } else {
    view.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">?</div>
        <div class="empty-text">Page not found</div>
        <a href="#/" class="btn btn--primary">Go Home</a>
      </div>`;
  }
}

// ── Utilities ─────────────────────────────────────────
export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') element.className = val;
    else if (key === 'style' && typeof val === 'object') Object.assign(element.style, val);
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), val);
    else element.setAttribute(key, val);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  }
  return element;
}

// Profile emoji/color mapping
const PROFILE_STYLES = {
  'morning-warrior':     { emoji: '\u{1F305}', color: '#FF6B35' },
  'skill-sprint':        { emoji: '\u{1F3AF}', color: '#3498db' },
  'evening-wind-down':   { emoji: '\u{1F319}', color: '#9b59b6' },
  'sunday-scroll':       { emoji: '\u2615',     color: '#F7C948' },
  'good-vibes-default':  { emoji: '\u{1F31E}', color: '#E8505B' },
};

export function profileStyle(id) {
  return PROFILE_STYLES[id] || { emoji: '\u{2728}', color: '#FF6B35' };
}

// Category colors for charts
export const CATEGORY_COLORS = {
  fitness: '#FF6B35',
  humor: '#F7C948',
  skill_building: '#3498db',
  motivation: '#E8505B',
  craft: '#9b59b6',
  music: '#1abc9c',
  nature: '#2ecc71',
  nutrition: '#e67e22',
  stoicism: '#7f8c8d',
  fatherhood: '#e74c3c',
  entrepreneurship: '#2c3e50',
  relaxation: '#00cec9',
};

// ── Service Worker Registration ───────────────────────
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      // SW registration is optional — app works without it
    }
  }
}

// ── Boot ──────────────────────────────────────────────
async function boot() {
  // Import and register view modules
  const [home, session, profiles, settings, stats] = await Promise.all([
    import('./views/home.mjs'),
    import('./views/session.mjs'),
    import('./views/profiles.mjs'),
    import('./views/settings.mjs'),
    import('./views/stats.mjs'),
  ]);

  registerRoute('home', home.render);
  registerRoute('session', session.render);
  registerRoute('profiles', profiles.render);
  registerRoute('settings', settings.render);
  registerRoute('stats', stats.render);

  // Listen for route changes
  window.addEventListener('hashchange', navigate);

  // Initial route
  await navigate();

  // Register service worker
  registerSW();
}

boot().catch(err => {
  console.error('Boot failed:', err);
  document.getElementById('view').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">!</div>
      <div class="empty-text">Failed to start: ${escapeHTML(err.message)}</div>
    </div>`;
});
