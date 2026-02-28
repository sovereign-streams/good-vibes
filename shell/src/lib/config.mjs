/**
 * Shell configuration.
 *
 * All values are environment-overridable with sensible defaults
 * for local-first operation.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function env(key, fallback) {
  return process.env[key] ?? fallback;
}

function envInt(key, fallback) {
  return parseInt(env(key, String(fallback)), 10);
}

/** Shell root: two levels up from src/lib/ */
const shellRoot = resolve(__dirname, '../..');

/** Consumer root: sibling directory */
const consumerRoot = resolve(shellRoot, '../consumer');

export const ShellConfig = {
  /** HTTP server port */
  port: envInt('SHELL_PORT', 3800),

  /** Bind address — 0.0.0.0 so phones on the same network can access */
  host: env('SHELL_HOST', '0.0.0.0'),

  /** Static files directory */
  publicDir: resolve(shellRoot, 'public'),

  /** Provider server base URL */
  providerUrl: env('SHELL_PROVIDER_URL', 'http://localhost:3700'),

  /** PAE data directory (SQLite database lives here) */
  dataDir: env('SHELL_DATA_DIR', resolve(shellRoot, 'data')),

  /** PAE database path */
  dbPath: env('SHELL_DB_PATH', resolve(shellRoot, 'data/shell-pae.db')),

  /** Default profiles directory (inside consumer) */
  profilesDir: env('SHELL_PROFILES_DIR', resolve(consumerRoot, 'default-profiles')),

  /** Consumer root (for importing PAE) */
  consumerRoot,
};
