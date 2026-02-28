#!/usr/bin/env node

import { Pipeline } from '../src/pipeline.mjs';
import { YouTubeSource } from '../src/sources/youtube.mjs';
import { LLMTagger } from '../src/enrichers/llm-tagger.mjs';
import { TranscriptFetcher } from '../src/enrichers/transcript.mjs';
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

// Parse args
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
const maxResults = args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1], 10) : 100;
const dryRun = args.includes('--dry-run');

// Load taxonomy
const categoriesPath = join(__dirname, '..', 'src', 'taxonomy', 'categories.json');
const taxonomy = JSON.parse(readFileSync(categoriesPath, 'utf-8'));

async function main() {
  console.log('=== Good Vibes YouTube Seeder ===\n');

  // Validate API keys
  const ytKey = Config.youtubeApiKey;
  const llmKey = Config.anthropicApiKey;

  if (!ytKey) {
    console.error('Error: YOUTUBE_API_KEY environment variable is required');
    console.error('Set it with: export YOUTUBE_API_KEY=your-key');
    process.exit(1);
  }

  // Initialize components
  const source = new YouTubeSource(ytKey);
  const llmClient = llmKey ? new LLMClient({ apiKey: llmKey }) : null;
  const tagger = new LLMTagger({ llmClient, taxonomy });
  const transcriptFetcher = new TranscriptFetcher();
  const filter = new EthicalFilter();
  const dbPath = Config.dbPath;
  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  const validator = new Validator(join(__dirname, '..', '..', 'spec', '2026-02-28'));

  await store.initialize();

  const pipeline = new Pipeline({
    source, tagger, transcriptFetcher, filter, store, validator
  });

  // Filter categories if specified
  const categories = categoryFilter
    ? taxonomy.categories.filter(c => c.id === categoryFilter)
    : taxonomy.categories;

  if (categories.length === 0) {
    console.error(`Unknown category: ${categoryFilter}`);
    process.exit(1);
  }

  console.log(`Categories: ${categories.map(c => c.id).join(', ')}`);
  console.log(`Max per query: ${maxResults}`);
  console.log(`Dry run: ${dryRun}\n`);

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const category of categories) {
    console.log(`\n--- ${category.name} ---`);

    for (const query of category.example_queries) {
      console.log(`  Query: "${query}"`);

      try {
        const stats = await pipeline.run({
          query,
          maxResults: Math.ceil(maxResults / category.example_queries.length),
          category: category.id,
          dryRun
        });

        totalProcessed += stats.processed;
        totalSucceeded += stats.succeeded;
        totalFailed += stats.failed;
        totalSkipped += stats.skipped;

        console.log(`    Processed: ${stats.processed}, Succeeded: ${stats.succeeded}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
      } catch (err) {
        console.error(`    Error: ${err.message}`);
        totalFailed++;
      }
    }
  }

  console.log('\n=== Seeding Complete ===');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total succeeded: ${totalSucceeded}`);
  console.log(`Total failed: ${totalFailed}`);
  console.log(`Total skipped: ${totalSkipped}`);

  // Print stats
  const indexStats = await store.stats();
  console.log(`\nIndex size: ${indexStats.totalItems} items`);

  await store.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
