#!/usr/bin/env node

import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';
import { Config } from '../src/lib/config.mjs';

async function main() {
  const dbPath = Config.dbPath;
  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  await store.initialize();

  const stats = await store.stats();

  console.log('=== Good Vibes Index Statistics ===\n');
  console.log(`Total items: ${stats.totalItems}`);

  if (stats.totalItems === 0) {
    console.log('\nIndex is empty. Run the seeder first:');
    console.log('  node scripts/seed-youtube.mjs');
    await store.close();
    return;
  }

  console.log('\n--- By Category ---');
  if (stats.byCategory) {
    for (const [cat, count] of Object.entries(stats.byCategory)) {
      const bar = '\u2588'.repeat(Math.ceil(count / stats.totalItems * 40));
      console.log(`  ${cat.padEnd(20)} ${String(count).padStart(6)} ${bar}`);
    }
  }

  console.log('\n--- By Content Type ---');
  if (stats.byContentType) {
    for (const [type, count] of Object.entries(stats.byContentType)) {
      console.log(`  ${type.padEnd(20)} ${count}`);
    }
  }

  console.log('\n--- Average Scores ---');
  if (stats.avgScores) {
    for (const [dim, avg] of Object.entries(stats.avgScores)) {
      const bar = '\u2593'.repeat(Math.ceil(avg * 30));
      console.log(`  ${dim.padEnd(25)} ${avg.toFixed(3)} ${bar}`);
    }
  }

  console.log('\n--- Guardrail Stats ---');
  console.log(`  Pass rate: ${(stats.guardrailPassRate * 100).toFixed(1)}%`);
  console.log(`  Passed: ${stats.guardrailPassed || 0}`);
  console.log(`  Failed: ${stats.guardrailFailed || 0}`);

  console.log('\n--- Schema Versions ---');
  if (stats.schemaVersions) {
    for (const [version, count] of Object.entries(stats.schemaVersions)) {
      console.log(`  ${version.padEnd(15)} ${count}`);
    }
  }

  await store.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
