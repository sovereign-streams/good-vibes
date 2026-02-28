import { createServer } from 'node:http';
import { handleManifest } from './handlers/manifest.mjs';
import { handleQuery } from './handlers/query.mjs';
import { handleBrowse } from './handlers/browse.mjs';
import { handleTelemetry } from './handlers/telemetry.mjs';
import { ProviderConfig } from './lib/config.mjs';

const PORT = ProviderConfig.port;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : null);
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ProviderConfig.corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    sendJson(res, 204, null);
    return;
  }

  try {
    if (path === '/sep/manifest' && method === 'GET') {
      const result = handleManifest();
      sendJson(res, 200, result);
    } else if (path === '/sep/query' && method === 'POST') {
      const body = await parseBody(req);
      const result = await handleQuery(body);
      sendJson(res, 200, result);
    } else if (path === '/sep/browse' && method === 'GET') {
      const params = Object.fromEntries(url.searchParams);
      const result = await handleBrowse(params);
      sendJson(res, 200, result);
    } else if (path === '/sep/telemetry' && method === 'POST') {
      const body = await parseBody(req);
      const result = await handleTelemetry(body);
      sendJson(res, 200, result);
    } else {
      sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
    }
  } catch (err) {
    console.error(`[${method} ${path}]`, err.message);
    sendJson(res, err.statusCode || 500, {
      error: err.message,
      code: err.code || 'INTERNAL_ERROR'
    });
  }
});

server.listen(PORT, () => {
  console.log(`Good Vibes Provider running on port ${PORT}`);
  console.log(`  Manifest: http://localhost:${PORT}/sep/manifest`);
  console.log(`  Query:    POST http://localhost:${PORT}/sep/query`);
  console.log(`  Browse:   http://localhost:${PORT}/sep/browse`);
  console.log(`  Telemetry: POST http://localhost:${PORT}/sep/telemetry`);
});

export { server };
