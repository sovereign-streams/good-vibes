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

const args = process.argv.slice(2);
const maxItems = args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1], 10) : 100;
const minVersion = args.includes('--min-version') ? args[args.indexOf('--min-version') + 1] : '0.0.0';

async function main() {
  console.log('=== Good Vibes Re-Enrichment ===\n');

  const llmKey = Config.anthropicApiKey;
  if (!llmKey) {
    console.error('Error: ANTHROPIC_API_KEY is required for re-enrichment');
    process.exit(1);
  }

  const categoriesPath = join(__dirname, '..', 'src', 'taxonomy', 'categories.json');
  const taxonomy = JSON.parse(readFileSync(categoriesPath, 'utf-8'));

  const llmClient = new LLMClient({ apiKey: llmKey });
  const tagger = new LLMTagger({ llmClient, taxonomy });
  const filter = new EthicalFilter();
  const validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));
  const dbPath = Config.dbPath;
  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  await store.initialize();

  // Get items needing re-enrichment
  const items = await store.getAll({ limit: maxItems, minSchemaVersion: minVersion });

  console.log(`Found ${items.length} items below schema version ${minVersion}`);
  console.log(`Processing up to ${maxItems} items\n`);

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const rawMeta = {
        title: item.meta.title,
        description: '',
        creator: item.meta.creator,
        tags: item.meta.original_tags || [],
        duration_seconds: item.source.duration_seconds
      };

      const enrichment = await tagger.tag(rawMeta);
      const guardrailResult = filter.check(enrichment, rawMeta);

      await store.update(item.item_id, {
        enrichment: JSON.stringify(enrichment),
        guardrail_pass: guardrailResult.pass ? 1 : 0,
        guardrail_version: guardrailResult.version,
        updated_at: new Date().toISOString()
      });

      succeeded++;
      process.stdout.write(`\r  Progress: ${succeeded + failed}/${items.length}`);
    } catch (err) {
      failed++;
      console.error(`\n  Failed ${item.item_id}: ${err.message}`);
    }
  }

  console.log(`\n\n=== Re-Enrichment Complete ===`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  await store.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
