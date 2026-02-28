#!/usr/bin/env node

import { LLMTagger } from '../src/enrichers/llm-tagger.mjs';
import { EthicalFilter } from '../src/guardrails/ethical-filter.mjs';
import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';
import { LLMClient } from '../src/lib/llm-client.mjs';
import { Validator } from '../src/lib/validator.mjs';
import { Config } from '../src/lib/config.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CURRENT_SCHEMA_VERSION = '0.1.0';

// ── Parse CLI arguments ────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    max: 100,
    minVersion: '0.0.0',
    sample: false,
    sampleSize: 50,
    outdated: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max':
        flags.max = parseInt(args[++i], 10);
        break;
      case '--min-version':
        flags.minVersion = args[++i];
        break;
      case '--sample':
        flags.sample = true;
        if (args[i + 1] && !args[i + 1].startsWith('--')) {
          flags.sampleSize = parseInt(args[++i], 10);
        }
        break;
      case '--outdated':
        flags.outdated = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
    }
  }

  return flags;
}

function printUsage() {
  console.log(`
Usage: node scripts/re-enrich.mjs [options]

Options:
  --max N            Maximum items to re-enrich (default: 100)
  --min-version X    Only items below this schema version (default: 0.0.0)
  --sample [N]       Random sample of N items (default: 50)
  --outdated         Find and re-enrich records below current schema version (${CURRENT_SCHEMA_VERSION})
  --dry-run          Show what would be re-enriched without making changes
  --help, -h         Show this help message
  `);
}

// ── Progress reporting ─────────────────────────────────────────

function reportProgress(current, total, succeeded, failed, startTime) {
  const elapsed = Date.now() - startTime;
  const itemsPerSec = current > 0 ? (current / (elapsed / 1000)).toFixed(1) : '0';
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const bar = '='.repeat(Math.floor(pct / 5)).padEnd(20, ' ');
  process.stdout.write(
    `\r  [${bar}] ${pct}% | ${current}/${total} | ok:${succeeded} fail:${failed} | ${itemsPerSec} items/s`
  );
}

// ── Random sample utility ──────────────────────────────────────

function randomSample(array, size) {
  if (array.length <= size) return [...array];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

// ── Version comparison ─────────────────────────────────────────

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  console.log('=== Good Vibes Re-Enrichment ===\n');

  if (flags.dryRun) {
    console.log('  ** DRY RUN — no changes will be made **\n');
  }

  // When --outdated is used, override minVersion to current schema
  if (flags.outdated) {
    flags.minVersion = CURRENT_SCHEMA_VERSION;
    console.log(`  Mode: outdated (schema < ${CURRENT_SCHEMA_VERSION})`);
  } else if (flags.sample) {
    console.log(`  Mode: random sample (n=${flags.sampleSize})`);
  } else {
    console.log(`  Mode: standard (min-version=${flags.minVersion}, max=${flags.max})`);
  }

  const llmKey = Config.anthropicApiKey;
  if (!llmKey && !flags.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY is required for re-enrichment (or use --dry-run)');
    process.exit(1);
  }

  const categoriesPath = join(__dirname, '..', 'src', 'taxonomy', 'categories.json');
  const taxonomy = JSON.parse(readFileSync(categoriesPath, 'utf-8'));

  const llmClient = llmKey ? new LLMClient({ apiKey: llmKey }) : null;
  const tagger = new LLMTagger({ llmClient, taxonomy });
  const filter = new EthicalFilter();
  const validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
  const dbPath = Config.dbPath;
  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  await store.initialize();

  // Fetch items based on mode
  let items;

  if (flags.outdated) {
    // Get ALL items, then filter for outdated schema
    const allItems = await store.getAll({ limit: 10000 });
    items = allItems.filter(item => {
      const sv = item.enrichment?.schema_version || '0.0.0';
      return compareVersions(sv, CURRENT_SCHEMA_VERSION) < 0;
    });
    console.log(`  Found ${items.length} items with outdated schema (<${CURRENT_SCHEMA_VERSION})`);
    items = items.slice(0, flags.max);
  } else if (flags.sample) {
    const allItems = await store.getAll({ limit: 10000 });
    items = randomSample(allItems, flags.sampleSize);
    console.log(`  Sampled ${items.length} of ${allItems.length} total items`);
  } else {
    items = await store.getAll({ limit: flags.max, minSchemaVersion: flags.minVersion });
    console.log(`  Found ${items.length} items below schema version ${flags.minVersion}`);
  }

  console.log(`  Processing ${items.length} items\n`);

  if (items.length === 0) {
    console.log('  Nothing to re-enrich.');
    await store.close();
    return;
  }

  // Dry run — just list items
  if (flags.dryRun) {
    console.log('  Items that would be re-enriched:\n');
    for (const item of items) {
      const sv = item.enrichment?.schema_version || '?';
      console.log(`    ${item.item_id}  v${sv}  "${item.meta.title}"`);
    }
    console.log(`\n  Total: ${items.length} items (dry run — no changes made)`);
    await store.close();
    return;
  }

  // Process items
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const item of items) {
    try {
      const rawMeta = {
        title: item.meta.title,
        description: '',
        creator: item.meta.creator,
        tags: item.meta.original_tags || [],
        duration_seconds: item.source.duration_seconds,
      };

      const enrichment = await tagger.tag(rawMeta);
      const guardrailResult = filter.check(enrichment, rawMeta);

      await store.update(item.item_id, {
        enrichment,
        guardrail_pass: guardrailResult.pass,
        guardrail_version: guardrailResult.version,
      });

      succeeded++;
    } catch (err) {
      failed++;
      console.error(`\n  Failed ${item.item_id}: ${err.message}`);
    }

    reportProgress(succeeded + failed, items.length, succeeded, failed, startTime);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\n=== Re-Enrichment Complete ===`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Time:      ${elapsed}s`);

  await store.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
