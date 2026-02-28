/**
 * Good Vibes Shell — HTTP Server
 *
 * Vanilla Node.js server (no Express). Serves the PWA static files
 * and provides the API that bridges the frontend to the PAE engine.
 *
 * Binds to 0.0.0.0 so phones on the same local network can access.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ShellConfig } from './lib/config.mjs';
import { PAEBridge } from './pae-bridge.mjs';

// ── MIME types ──────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// ── Helpers ─────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function error(res, message, status = 400) {
  json(res, { error: message }, status);
}

function notFound(res) {
  error(res, 'Not found', 404);
}

/**
 * Read the full request body as a parsed JSON object.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Simple path-param router.
 * Returns { params, handler } or null.
 */
function matchRoute(method, pathname, routes) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split('/');
    const urlParts = pathname.split('/');
    if (routeParts.length !== urlParts.length) continue;

    const params = {};
    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
      } else if (routeParts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { params, handler: route.handler };
  }
  return null;
}

// ── Server factory ──────────────────────────────────────────

/**
 * Create and return the HTTP server (does not call listen).
 * Exported so tests can use it without binding a port.
 *
 * @param {PAEBridge} [bridge] - Optional pre-initialized bridge (for tests)
 * @returns {{ server: http.Server, bridge: PAEBridge, start: Function }}
 */
export function createShellServer(bridge) {
  bridge = bridge || new PAEBridge();

  // ── API route table ─────────────────────────────────────

  const routes = [
    // Profiles
    { method: 'GET',    path: '/api/profiles',      handler: handleListProfiles },
    { method: 'POST',   path: '/api/profiles',      handler: handleCreateProfile },
    { method: 'GET',    path: '/api/profiles/:id',   handler: handleGetProfile },
    { method: 'PUT',    path: '/api/profiles/:id',   handler: handleSaveProfile },

    // Sessions
    { method: 'POST',   path: '/api/session',               handler: handleCreateSession },
    { method: 'GET',    path: '/api/session/:id',            handler: handleGetSession },
    { method: 'POST',   path: '/api/session/:id/engage',     handler: handleEngage },
    { method: 'GET',    path: '/api/session/:id/next',       handler: handleNextItem },
    { method: 'POST',   path: '/api/session/:id/skip',       handler: handleSkip },
    { method: 'POST',   path: '/api/session/:id/complete',   handler: handleComplete },

    // History
    { method: 'GET',    path: '/api/history',        handler: handleHistory },

    // Learning
    { method: 'GET',    path: '/api/learning/suggestions',  handler: handleGetSuggestions },
    { method: 'POST',   path: '/api/learning/apply',        handler: handleApplySuggestion },

    // Providers
    { method: 'GET',    path: '/api/providers',      handler: handleListProviders },
    { method: 'POST',   path: '/api/providers',      handler: handleAddProvider },
    { method: 'DELETE', path: '/api/providers/:id',  handler: handleRemoveProvider },

    // Stats
    { method: 'GET',    path: '/api/stats',          handler: handleStats },
  ];

  // ── Route handlers ──────────────────────────────────────

  async function handleListProfiles(_req, res) {
    json(res, bridge.listProfiles());
  }

  async function handleGetProfile(_req, res, params) {
    const profile = bridge.getProfile(params.id);
    if (!profile) return notFound(res);
    json(res, profile);
  }

  async function handleSaveProfile(req, res, params) {
    const body = await readBody(req);
    body.id = params.id;
    const saved = bridge.saveProfile(body);
    json(res, saved);
  }

  async function handleCreateProfile(req, res) {
    const body = await readBody(req);
    const created = bridge.createProfile(body);
    json(res, created, 201);
  }

  async function handleCreateSession(req, res) {
    const body = await readBody(req);
    const session = bridge.createSession(body);

    // Immediately request content so the session is populated
    try {
      const content = await bridge.requestContent(session.session_id, body.overrides);
      json(res, { ...session, content }, 201);
    } catch (e) {
      // Session created but content fetch failed — return session anyway
      json(res, { ...session, content: null, content_error: e.message }, 201);
    }
  }

  async function handleGetSession(_req, res, params) {
    const session = bridge.getSession(params.id);
    if (!session) return notFound(res);
    json(res, session);
  }

  async function handleEngage(req, res, params) {
    const body = await readBody(req);
    try {
      const result = bridge.reportEngagement(params.id, body);
      json(res, result);
    } catch (e) {
      error(res, e.message, 404);
    }
  }

  async function handleNextItem(_req, res, params) {
    const next = bridge.getNextItem(params.id);
    json(res, next);
  }

  async function handleSkip(req, res, params) {
    const body = await readBody(req);
    try {
      const result = bridge.skipItem(params.id, body.item_id);
      json(res, result);
    } catch (e) {
      error(res, e.message, 404);
    }
  }

  async function handleComplete(req, res, params) {
    const body = await readBody(req);
    try {
      const result = bridge.completeSession(params.id, body.satisfaction);
      json(res, result);
    } catch (e) {
      error(res, e.message, 404);
    }
  }

  async function handleHistory(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    json(res, bridge.getHistory(limit));
  }

  async function handleGetSuggestions(_req, res) {
    try {
      const suggestions = bridge.getSuggestions();
      json(res, suggestions);
    } catch (e) {
      json(res, { status: 'error', message: e.message });
    }
  }

  async function handleApplySuggestion(req, res) {
    const body = await readBody(req);
    try {
      const updated = bridge.applySuggestion(body);
      json(res, updated);
    } catch (e) {
      error(res, e.message);
    }
  }

  async function handleListProviders(_req, res) {
    json(res, bridge.listProviders());
  }

  async function handleAddProvider(req, res) {
    const body = await readBody(req);
    if (!body.endpoint) return error(res, 'endpoint is required');
    try {
      const provider = bridge.addProvider(body.endpoint);
      json(res, provider, 201);
    } catch (e) {
      error(res, e.message);
    }
  }

  async function handleRemoveProvider(_req, res, params) {
    try {
      const result = bridge.removeProvider(decodeURIComponent(params.id));
      json(res, result);
    } catch (e) {
      error(res, e.message);
    }
  }

  async function handleStats(_req, res) {
    json(res, bridge.getStats());
  }

  // ── Static file serving ─────────────────────────────────

  async function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let filePath = join(ShellConfig.publicDir, url.pathname === '/' ? '/index.html' : url.pathname);

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      // If file not found, try serving index.html for SPA routing
      filePath = join(ShellConfig.publicDir, 'index.html');
    }

    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      const contentType = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }

  // ── Request dispatcher ──────────────────────────────────

  const server = createServer(async (req, res) => {
    cors(res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      const match = matchRoute(req.method, pathname, routes);
      if (match) {
        try {
          await match.handler(req, res, match.params);
        } catch (e) {
          console.error(`API error: ${req.method} ${pathname}`, e);
          error(res, 'Internal server error', 500);
        }
      } else {
        notFound(res);
      }
      return;
    }

    // Static files
    await serveStatic(req, res);
  });

  async function start() {
    await bridge.initialize();
    return new Promise((resolve) => {
      server.listen(ShellConfig.port, ShellConfig.host, () => {
        const addr = server.address();
        console.log(`Good Vibes Shell running at http://${addr.address}:${addr.port}`);
        console.log(`  Local:   http://localhost:${addr.port}`);
        console.log(`  Network: http://${addr.address}:${addr.port}`);
        resolve(server);
      });
    });
  }

  return { server, bridge, start };
}

// ── CLI entry point ─────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const { start, bridge } = createShellServer();

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    bridge.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    bridge.close();
    process.exit(0);
  });

  await start();
}
