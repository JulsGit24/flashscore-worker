#!/usr/bin/env node
// One-shot reconnaissance against the live feed, for running on a GitHub
// runner — the only place with outbound access to it.
//
// Answers one question: which fields does the day feed actually carry, and do
// any of them look like image references? The committed sample fixture is a
// hand-written minimal document, so it cannot answer this.
//
// Not part of any report. Kept because the same question recurs every time the
// feed is extended to a new sport.

import { SPORT, fetchFeed, parseFeed } from '../src/flashscore.js';

const SPORTS = { soccer: SPORT.soccer, basketball: SPORT.basketball, baseball: SPORT.baseball };

/** Every distinct key in the feed, with how often it appears and an example. */
function fieldCensus(records) {
  const seen = new Map();
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      if (!seen.has(k)) seen.set(k, { count: 0, samples: new Set() });
      const e = seen.get(k);
      e.count += 1;
      if (e.samples.size < 3 && v) e.samples.add(String(v).slice(0, 48));
    }
  }
  return [...seen.entries()].sort((a, b) => b[1].count - a[1].count);
}

/** Keys whose values look like an image handle rather than data. */
function imageish(census) {
  return census.filter(([k, e]) => {
    const s = [...e.samples].join(' ');
    return (
      /image|img|logo|badge|crest|flag|pic/i.test(k) ||
      /\.(png|jpe?g|svg|webp)/i.test(s) ||
      // Flashscore image handles are short opaque ids, often with a type prefix.
      /^\d+\/[A-Za-z0-9_-]{6,}$/.test(s)
    );
  });
}

for (const [name, id] of Object.entries(SPORTS)) {
  process.stdout.write(`\n${'='.repeat(70)}\n${name} (sport ${id})\n${'='.repeat(70)}\n`);
  try {
    const body = await fetchFeed(`f_${id}_0_-4_en_1`);
    process.stdout.write(`feed bytes: ${body.length}\n`);
    const records = parseFeed(body);
    process.stdout.write(`records: ${records.length}\n\n`);

    const census = fieldCensus(records);
    process.stdout.write('--- every field ---\n');
    for (const [k, e] of census) {
      process.stdout.write(`${k.padEnd(6)} x${String(e.count).padStart(5)}  ${[...e.samples].join(' | ')}\n`);
    }

    const imgs = imageish(census);
    process.stdout.write(`\n--- image-looking fields (${imgs.length}) ---\n`);
    for (const [k, e] of imgs) {
      process.stdout.write(`${k.padEnd(6)} x${String(e.count).padStart(5)}  ${[...e.samples].join(' | ')}\n`);
    }

    // A whole record, so the shape is visible rather than inferred.
    const match = records.find((r) => r.AE && r.AF);
    if (match) process.stdout.write(`\n--- one match record ---\n${JSON.stringify(match, null, 1)}\n`);
    const header = records.find((r) => r.ZL);
    if (header) process.stdout.write(`\n--- one competition header ---\n${JSON.stringify(header, null, 1)}\n`);
  } catch (err) {
    process.stdout.write(`FAILED: ${err.message}\n`);
  }
}
