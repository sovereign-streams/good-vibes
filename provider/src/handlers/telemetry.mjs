import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const TELEMETRY_LOG = process.env.TELEMETRY_LOG || './data/telemetry.jsonl';

export async function handleTelemetry(body) {
  if (!body || !body.telemetry) {
    const err = new Error('Missing telemetry payload');
    err.statusCode = 400;
    err.code = 'INVALID_TELEMETRY';
    throw err;
  }

  // Ensure directory exists
  mkdirSync(dirname(TELEMETRY_LOG), { recursive: true });

  // Append to JSONL log
  const entry = {
    received_at: new Date().toISOString(),
    ...body
  };
  appendFileSync(TELEMETRY_LOG, JSON.stringify(entry) + '\n');

  return {
    sep_version: '0.1.0',
    status: 'accepted',
    message: 'Telemetry received'
  };
}
