import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ProviderConfig } from '../lib/config.mjs';

export async function handleTelemetry(body) {
  // --- Validation ---
  if (!body || !body.telemetry) {
    const err = new Error('Missing telemetry payload');
    err.statusCode = 400;
    err.code = 'INVALID_TELEMETRY';
    throw err;
  }

  const { telemetry } = body;

  if (!telemetry.session_id) {
    const err = new Error('Missing telemetry.session_id');
    err.statusCode = 400;
    err.code = 'INVALID_TELEMETRY';
    throw err;
  }

  if (!Array.isArray(telemetry.items)) {
    const err = new Error('Missing or invalid telemetry.items');
    err.statusCode = 400;
    err.code = 'INVALID_TELEMETRY';
    throw err;
  }

  // Validate each item has at least item_id and viewed
  for (const item of telemetry.items) {
    if (!item.item_id) {
      const err = new Error('Telemetry item missing item_id');
      err.statusCode = 400;
      err.code = 'INVALID_TELEMETRY';
      throw err;
    }
    if (typeof item.viewed !== 'boolean') {
      const err = new Error(`Telemetry item ${item.item_id} missing viewed flag`);
      err.statusCode = 400;
      err.code = 'INVALID_TELEMETRY';
      throw err;
    }
  }

  // Ensure data directory exists
  const logPath = ProviderConfig.telemetryLog;
  mkdirSync(dirname(logPath), { recursive: true });

  // Append to JSONL log
  const entry = {
    received_at: new Date().toISOString(),
    ...body
  };
  appendFileSync(logPath, JSON.stringify(entry) + '\n');

  return {
    sep_version: ProviderConfig.sepVersion,
    status: 'accepted',
    message: 'Telemetry received'
  };
}
