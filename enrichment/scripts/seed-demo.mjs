#!/usr/bin/env node
/**
 * Seed the index with demo content for testing the UI.
 * Uses realistic-looking data across all categories.
 *
 * Usage: node enrichment/scripts/seed-demo.mjs [--db path/to/db]
 */

import { randomUUID } from 'node:crypto';
import { IndexStore } from '../src/store/index-store.mjs';
import { SQLiteAdapter } from '../src/store/adapters/sqlite.mjs';

const dbPath = process.argv.includes('--db')
  ? process.argv[process.argv.indexOf('--db') + 1]
  : './data/good-vibes.db';

const DEMO_CONTENT = [
  // ── Fitness ──
  { title: '10-Minute Morning Workout — No Equipment', creator: 'FitLife Daily', dur: 623, cats: [['fitness', 0.95], ['motivation', 0.4]], tone: 'energized', energy: 0.85, cognitive: 0.2, motivation: 0.75, humor: 0.15, skill: 0.6, prod: 0.8, fit: { opener: true, peak: true } },
  { title: 'Full Body HIIT — 20 Min Fat Burner', creator: 'THENX', dur: 1220, cats: [['fitness', 0.92], ['motivation', 0.5]], tone: 'energized', energy: 0.95, cognitive: 0.3, motivation: 0.85, humor: 0.1, skill: 0.5, prod: 0.85, fit: { peak: true } },
  { title: 'Perfect Push-Up Form Guide', creator: 'Jeff Nippard', dur: 780, cats: [['fitness', 0.9], ['skill_building', 0.6]], tone: 'focused', energy: 0.5, cognitive: 0.6, motivation: 0.4, humor: 0.1, skill: 0.85, prod: 0.9, fit: { builder: true } },
  { title: 'Yoga for Beginners — 30 Min Flow', creator: 'Yoga With Adriene', dur: 1800, cats: [['fitness', 0.8], ['relaxation', 0.7]], tone: 'calm', energy: 0.3, cognitive: 0.2, motivation: 0.3, humor: 0.05, skill: 0.5, prod: 0.85, fit: { closer: true } },
  { title: '5K Training Plan for Absolute Beginners', creator: 'The Run Experience', dur: 900, cats: [['fitness', 0.88], ['skill_building', 0.4]], tone: 'inspired', energy: 0.6, cognitive: 0.4, motivation: 0.7, humor: 0.1, skill: 0.65, prod: 0.75, fit: { builder: true } },

  // ── Nutrition ──
  { title: 'Meal Prep Sunday — 5 Meals in 1 Hour', creator: 'Joshua Weissman', dur: 1500, cats: [['nutrition', 0.95], ['skill_building', 0.5]], tone: 'energized', energy: 0.6, cognitive: 0.5, motivation: 0.5, humor: 0.3, skill: 0.8, prod: 0.9, fit: { builder: true } },
  { title: 'Understanding Macros — Simple Nutrition Guide', creator: 'Jeff Nippard', dur: 840, cats: [['nutrition', 0.9], ['skill_building', 0.7]], tone: 'focused', energy: 0.4, cognitive: 0.7, motivation: 0.4, humor: 0.1, skill: 0.9, prod: 0.85, fit: { builder: true } },
  { title: 'High Protein Breakfast Ideas Under 500 Calories', creator: 'The Meal Prep Manual', dur: 600, cats: [['nutrition', 0.92], ['fitness', 0.3]], tone: 'energized', energy: 0.5, cognitive: 0.3, motivation: 0.4, humor: 0.2, skill: 0.7, prod: 0.75, fit: { opener: true } },

  // ── Skill Building ──
  { title: 'Learn JavaScript in 1 Hour — Full Beginner Course', creator: 'Fireship', dur: 3600, cats: [['skill_building', 0.95]], tone: 'focused', energy: 0.5, cognitive: 0.85, motivation: 0.5, humor: 0.3, skill: 0.95, prod: 0.9, fit: { builder: true } },
  { title: 'How to Read a Book Effectively — Active Reading Tips', creator: 'Thomas Frank', dur: 720, cats: [['skill_building', 0.85], ['stoicism', 0.2]], tone: 'focused', energy: 0.3, cognitive: 0.7, motivation: 0.6, humor: 0.1, skill: 0.85, prod: 0.8, fit: { opener: true } },
  { title: 'Public Speaking: How to Speak So People Listen', creator: 'Charisma on Command', dur: 950, cats: [['skill_building', 0.9], ['entrepreneurship', 0.3]], tone: 'inspired', energy: 0.6, cognitive: 0.6, motivation: 0.7, humor: 0.2, skill: 0.8, prod: 0.85, fit: { builder: true } },

  // ── Humor ──
  { title: 'When Your Dog Judges Your Life Choices', creator: 'FailArmy', dur: 300, cats: [['humor', 0.95]], tone: 'amused', energy: 0.7, cognitive: 0.1, motivation: 0.1, humor: 0.95, skill: 0.0, prod: 0.6, fit: { opener: true } },
  { title: 'Stand-Up: Everything Wrong With Adulting', creator: 'Nate Bargatze', dur: 480, cats: [['humor', 0.95]], tone: 'amused', energy: 0.6, cognitive: 0.2, motivation: 0.1, humor: 0.9, skill: 0.0, prod: 0.85, fit: { opener: true, closer: true } },
  { title: 'Dad Jokes Championship — Season 3 Finale', creator: 'All Def', dur: 660, cats: [['humor', 0.9], ['fatherhood', 0.3]], tone: 'amused', energy: 0.65, cognitive: 0.1, motivation: 0.1, humor: 0.92, skill: 0.0, prod: 0.75, fit: { opener: true } },
  { title: 'Try Not to Laugh — Wholesome Edition', creator: 'Markiplier', dur: 720, cats: [['humor', 0.93]], tone: 'amused', energy: 0.75, cognitive: 0.1, motivation: 0.05, humor: 0.95, skill: 0.0, prod: 0.7, fit: { opener: true } },

  // ── Motivation ──
  { title: 'Discipline Equals Freedom — Jocko Willink', creator: 'Jocko Podcast', dur: 1200, cats: [['motivation', 0.95], ['stoicism', 0.6]], tone: 'inspired', energy: 0.8, cognitive: 0.5, motivation: 0.95, humor: 0.05, skill: 0.3, prod: 0.8, fit: { peak: true } },
  { title: 'How I Built a Business From Nothing', creator: 'Alex Hormozi', dur: 900, cats: [['motivation', 0.85], ['entrepreneurship', 0.8]], tone: 'inspired', energy: 0.7, cognitive: 0.6, motivation: 0.9, humor: 0.15, skill: 0.6, prod: 0.85, fit: { peak: true } },
  { title: 'The Power of Showing Up Every Day', creator: 'Matt D\'Avella', dur: 660, cats: [['motivation', 0.9], ['stoicism', 0.4]], tone: 'reflective', energy: 0.5, cognitive: 0.5, motivation: 0.85, humor: 0.1, skill: 0.3, prod: 0.9, fit: { builder: true } },

  // ── Craft ──
  { title: 'Building a Surfboard From Scratch', creator: 'Otter Surfboards', dur: 2400, cats: [['craft', 0.95], ['relaxation', 0.4]], tone: 'calm', energy: 0.3, cognitive: 0.4, motivation: 0.4, humor: 0.05, skill: 0.7, prod: 0.9, fit: { builder: true } },
  { title: 'Hand-Cut Dovetail Joints — Woodworking Basics', creator: 'Paul Sellers', dur: 1800, cats: [['craft', 0.92], ['skill_building', 0.5]], tone: 'calm', energy: 0.2, cognitive: 0.5, motivation: 0.3, humor: 0.05, skill: 0.85, prod: 0.85, fit: { builder: true, closer: true } },
  { title: 'Throwing a Bowl on the Pottery Wheel', creator: 'Florian Gadsby', dur: 600, cats: [['craft', 0.9], ['relaxation', 0.6]], tone: 'calm', energy: 0.2, cognitive: 0.3, motivation: 0.2, humor: 0.0, skill: 0.6, prod: 0.95, fit: { closer: true } },

  // ── Stoicism ──
  { title: 'Marcus Aurelius — Meditations (Key Lessons)', creator: 'Einzelgänger', dur: 1080, cats: [['stoicism', 0.95], ['motivation', 0.4]], tone: 'reflective', energy: 0.3, cognitive: 0.7, motivation: 0.6, humor: 0.0, skill: 0.5, prod: 0.8, fit: { closer: true } },
  { title: 'Stoic Advice for Modern Problems', creator: 'Ryan Holiday', dur: 780, cats: [['stoicism', 0.9], ['motivation', 0.5]], tone: 'reflective', energy: 0.4, cognitive: 0.6, motivation: 0.7, humor: 0.1, skill: 0.4, prod: 0.85, fit: { builder: true } },

  // ── Fatherhood ──
  { title: 'How to Be a Present Dad in a Distracted World', creator: 'Dad University', dur: 720, cats: [['fatherhood', 0.95], ['motivation', 0.4]], tone: 'reflective', energy: 0.4, cognitive: 0.5, motivation: 0.6, humor: 0.1, skill: 0.4, prod: 0.7, fit: { builder: true } },
  { title: 'Fun Science Experiments to Do With Your Kids', creator: 'Mark Rober', dur: 900, cats: [['fatherhood', 0.6], ['skill_building', 0.5], ['humor', 0.3]], tone: 'amused', energy: 0.7, cognitive: 0.4, motivation: 0.5, humor: 0.6, skill: 0.5, prod: 0.95, fit: { opener: true } },

  // ── Entrepreneurship ──
  { title: 'The $100 Startup — Key Takeaways', creator: 'Ali Abdaal', dur: 840, cats: [['entrepreneurship', 0.9], ['skill_building', 0.5]], tone: 'inspired', energy: 0.5, cognitive: 0.65, motivation: 0.7, humor: 0.15, skill: 0.7, prod: 0.85, fit: { builder: true } },
  { title: 'How to Validate a Business Idea in 48 Hours', creator: 'My First Million', dur: 1200, cats: [['entrepreneurship', 0.92], ['skill_building', 0.6]], tone: 'energized', energy: 0.65, cognitive: 0.7, motivation: 0.8, humor: 0.2, skill: 0.75, prod: 0.8, fit: { peak: true } },

  // ── Music ──
  { title: 'Lofi Hip Hop — Study & Chill Beats', creator: 'Lofi Girl', dur: 3600, cats: [['music', 0.95], ['relaxation', 0.7]], tone: 'calm', energy: 0.2, cognitive: 0.05, motivation: 0.1, humor: 0.0, skill: 0.0, prod: 0.7, fit: { closer: true } },
  { title: 'Workout Pump-Up Mix 2026', creator: 'Trap Nation', dur: 2400, cats: [['music', 0.95], ['fitness', 0.4]], tone: 'energized', energy: 0.95, cognitive: 0.05, motivation: 0.7, humor: 0.0, skill: 0.0, prod: 0.7, fit: { opener: true, peak: true } },
  { title: 'Acoustic Covers — Chill Vibes Playlist', creator: 'Mahogany Sessions', dur: 1800, cats: [['music', 0.9], ['relaxation', 0.5]], tone: 'calm', energy: 0.3, cognitive: 0.1, motivation: 0.2, humor: 0.0, skill: 0.0, prod: 0.85, fit: { closer: true } },

  // ── Nature ──
  { title: '3 Days Solo Camping in the Wilderness', creator: 'Kraig Adams', dur: 1800, cats: [['nature', 0.95], ['relaxation', 0.5]], tone: 'calm', energy: 0.3, cognitive: 0.2, motivation: 0.4, humor: 0.05, skill: 0.3, prod: 0.9, fit: { builder: true, closer: true } },
  { title: 'Bushcraft Shelter Build — Start to Finish', creator: 'TA Outdoors', dur: 2400, cats: [['nature', 0.85], ['craft', 0.6], ['skill_building', 0.4]], tone: 'focused', energy: 0.4, cognitive: 0.4, motivation: 0.5, humor: 0.05, skill: 0.65, prod: 0.85, fit: { builder: true } },

  // ── Relaxation ──
  { title: 'Slow Pottery — 1 Hour of Calm', creator: 'Florian Gadsby', dur: 3600, cats: [['relaxation', 0.95], ['craft', 0.7]], tone: 'calm', energy: 0.1, cognitive: 0.1, motivation: 0.1, humor: 0.0, skill: 0.3, prod: 0.9, fit: { closer: true } },
  { title: 'Rain on a Tin Roof — 2 Hours Ambient', creator: 'Calm Sounds', dur: 7200, cats: [['relaxation', 0.95]], tone: 'calm', energy: 0.05, cognitive: 0.0, motivation: 0.0, humor: 0.0, skill: 0.0, prod: 0.5, fit: { closer: true } },
  { title: 'Japanese Garden Tour — Peaceful Walking', creator: 'Rambalac', dur: 1200, cats: [['relaxation', 0.9], ['nature', 0.6]], tone: 'calm', energy: 0.15, cognitive: 0.1, motivation: 0.1, humor: 0.0, skill: 0.1, prod: 0.85, fit: { closer: true } },

  // ── More variety ──
  { title: 'The Art of Focus — Deep Work Explained', creator: 'Thomas Frank', dur: 840, cats: [['skill_building', 0.85], ['stoicism', 0.3]], tone: 'focused', energy: 0.4, cognitive: 0.75, motivation: 0.65, humor: 0.1, skill: 0.8, prod: 0.85, fit: { builder: true } },
  { title: 'Why You Should Learn to Cook', creator: 'Internet Shaquille', dur: 480, cats: [['nutrition', 0.7], ['humor', 0.4], ['skill_building', 0.3]], tone: 'amused', energy: 0.6, cognitive: 0.3, motivation: 0.5, humor: 0.6, skill: 0.5, prod: 0.8, fit: { opener: true } },
  { title: 'Cold Plunge Science — What Actually Happens', creator: 'Andrew Huberman', dur: 960, cats: [['fitness', 0.7], ['skill_building', 0.6]], tone: 'focused', energy: 0.5, cognitive: 0.8, motivation: 0.5, humor: 0.05, skill: 0.85, prod: 0.85, fit: { builder: true } },
  { title: 'How to Negotiate Anything', creator: 'Charisma on Command', dur: 720, cats: [['skill_building', 0.85], ['entrepreneurship', 0.5]], tone: 'inspired', energy: 0.55, cognitive: 0.65, motivation: 0.6, humor: 0.15, skill: 0.8, prod: 0.85, fit: { builder: true } },
  { title: 'Morning Routine That Changed My Life', creator: 'Matt D\'Avella', dur: 600, cats: [['motivation', 0.8], ['fitness', 0.3], ['stoicism', 0.3]], tone: 'reflective', energy: 0.5, cognitive: 0.4, motivation: 0.75, humor: 0.1, skill: 0.3, prod: 0.9, fit: { opener: true } },
];

function makeVideoId(i) {
  return `demo${String(i).padStart(4, '0')}`;
}

function buildItem(entry, index) {
  const videoId = makeVideoId(index);
  return {
    item_id: randomUUID(),
    sep_version: '0.1.0',
    source: {
      platform: 'youtube',
      origin_url: `https://www.youtube.com/watch?v=${videoId}`,
      origin_id: videoId,
      content_type: 'video',
      duration_seconds: entry.dur,
    },
    meta: {
      title: entry.title,
      creator: entry.creator,
      published: new Date(Date.now() - Math.random() * 90 * 86400000).toISOString(),
      original_tags: entry.cats.map(c => c[0]),
      language: 'en',
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    },
    enrichment: {
      schema_version: '0.1.0',
      enriched_at: new Date().toISOString(),
      categories: entry.cats.map(([id, confidence]) => ({ id, confidence })),
      emotional_tone: {
        primary: entry.tone,
        secondary: null,
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: false,
        violence: false,
      },
      energy_level: entry.energy,
      cognitive_load: entry.cognitive,
      motivation_score: entry.motivation,
      humor_score: entry.humor,
      skill_transfer_score: entry.skill,
      production_quality: entry.prod,
      session_fit: {
        good_opener: entry.fit.opener || false,
        good_builder: entry.fit.builder || false,
        good_peak: entry.fit.peak || false,
        good_closer: entry.fit.closer || false,
      },
    },
    provider: {
      id: 'good-vibes-main',
      guardrail_pass: true,
      guardrail_version: '0.1.0',
    },
  };
}

async function main() {
  console.log(`Seeding demo data into ${dbPath}...`);
  const adapter = new SQLiteAdapter(dbPath);
  const store = new IndexStore(adapter);
  await store.initialize();

  let count = 0;
  for (let i = 0; i < DEMO_CONTENT.length; i++) {
    const item = buildItem(DEMO_CONTENT[i], i);
    await store.put(item);
    count++;
  }

  const stats = await store.stats();
  console.log(`✅ Seeded ${count} items.`);
  console.log(`   Total items in index: ${stats.totalItems}`);
  console.log(`   Categories: ${JSON.stringify(stats.categoryCounts || 'n/a')}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
