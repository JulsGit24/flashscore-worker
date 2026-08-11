#!/usr/bin/env node
// Diagnostic: which international competitions does the feed carry, and under
// what country/slug? Confederation competitions sit under pseudo-countries
// ("europe", "south-america", "world"), so the exact slugs need reading rather
// than guessing before they can be allowlisted.
import { SPORT, fetchDayFixtures } from '../src/flashscore.js';
import { parseTournamentUrl } from '../src/leagues.js';
import { REGION_COUNTRIES } from '../src/leagues.data.js';

const known = new Set(Object.values(REGION_COUNTRIES).flatMap((s) => [...s]));
const seen = new Map();

// Sweep the whole fetchable window: a midweek continental round will not be on
// every day, and one day's slate would miss most of them.
for (let offset = -7; offset <= 7; offset += 1) {
  let matches;
  try {
    matches = await fetchDayFixtures({ dayOffset: offset, sport: SPORT.soccer });
  } catch {
    continue;
  }
  for (const m of matches) {
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    if (!country || !slug || known.has(country)) continue;
    const key = `${country}/${slug}`;
    if (!seen.has(key)) seen.set(key, { name: m.tournament?.name ?? '', games: 0, sample: '' });
    const row = seen.get(key);
    row.games += 1;
    if (!row.sample) row.sample = `${m.home} v ${m.away}`;
  }
}

const byCountry = new Map();
for (const [key, row] of seen) {
  const country = key.split('/')[0];
  if (!byCountry.has(country)) byCountry.set(country, []);
  byCountry.get(country).push({ key, ...row });
}

console.log(`## ${seen.size} competitions outside the configured countries\n`);
for (const [country, rows] of [...byCountry].sort()) {
  console.log(`### ${country} (${rows.length})`);
  for (const r of rows.sort((a, b) => b.games - a.games)) {
    console.log(`  ${r.games.toString().padStart(3)}  ${r.key}`);
    console.log(`       ${r.name}  ::  ${r.sample}`);
  }
  console.log('');
}
