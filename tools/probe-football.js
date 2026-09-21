#!/usr/bin/env node
// Reconnaissance for American football: which sport id carries it, which
// competitions the feed files under it, and what their URL slugs are.
//
// Run on a GitHub runner — no agent environment can reach the feed.
//
// Sampling several day offsets on purpose. NFL and college football have very
// different rhythms: a Monday carries one NFL game and little else, a Saturday
// carries a hundred college ones. Probing a single day would give a badly
// misleading picture of either.

import { fetchFeed, parseFeed, extractMatches } from '../src/flashscore.js';
import { parseTournamentUrl } from '../src/leagues.js';

const CANDIDATE_SPORTS = [5, 16, 17];
const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

async function sample(sport, offset) {
  const body = await fetchFeed(`f_${sport}_${offset}_-4_en_1`);
  return extractMatches(parseFeed(body));
}

for (const sport of CANDIDATE_SPORTS) {
  process.stdout.write(`\n${'='.repeat(74)}\nsport ${sport}\n${'='.repeat(74)}\n`);

  // competition key -> { name, days: Map<offset, count>, sampleTeams, image }
  const comps = new Map();
  let total = 0;

  for (const offset of OFFSETS) {
    let matches;
    try {
      matches = await sample(sport, offset);
    } catch (err) {
      process.stdout.write(`  offset ${offset}: FAILED ${err.message}\n`);
      continue;
    }
    total += matches.length;
    process.stdout.write(`  offset ${String(offset).padStart(2)}: ${matches.length} matches\n`);

    for (const m of matches) {
      const { country, slug } = parseTournamentUrl(m.tournament?.url);
      const key = `${country}/${slug}`;
      if (!comps.has(key)) {
        comps.set(key, {
          name: m.tournament?.name ?? '',
          url: m.tournament?.url ?? '',
          image: m.tournament?.image ?? null,
          days: new Map(),
          teams: new Set(),
          withScores: 0,
        });
      }
      const c = comps.get(key);
      c.days.set(offset, (c.days.get(offset) ?? 0) + 1);
      if (c.teams.size < 4) c.teams.add(`${m.home} v ${m.away}`);
      if (m.homeScore !== null && m.awayScore !== null) c.withScores += 1;
    }
  }

  if (!total) {
    process.stdout.write('  nothing on this sport id.\n');
    continue;
  }

  process.stdout.write(`\n  --- competitions (${comps.size}) ---\n`);
  const rows = [...comps.entries()].sort(
    (a, b) =>
      [...b[1].days.values()].reduce((x, y) => x + y, 0) -
      [...a[1].days.values()].reduce((x, y) => x + y, 0),
  );
  for (const [key, c] of rows) {
    const n = [...c.days.values()].reduce((x, y) => x + y, 0);
    const byDay = OFFSETS.map((o) => `${o}:${c.days.get(o) ?? 0}`).join(' ');
    process.stdout.write(
      `  ${key.padEnd(40)} ${String(n).padStart(4)} games  finished:${String(c.withScores).padStart(4)}  [${byDay}]\n` +
        `      name=${c.name}\n` +
        `      url=${c.url}  image=${c.image ?? '(none)'}\n` +
        `      e.g. ${[...c.teams].slice(0, 2).join(' | ')}\n`,
    );
  }

  // The scoring distribution decides the model, so look at real finals.
  const finals = [];
  for (const offset of [-3, -2, -1]) {
    try {
      for (const m of await sample(sport, offset)) {
        if (m.homeScore !== null && m.awayScore !== null) {
          const { country, slug } = parseTournamentUrl(m.tournament?.url);
          finals.push({ key: `${country}/${slug}`, h: m.homeScore, a: m.awayScore });
        }
      }
    } catch {
      /* already reported above */
    }
  }
  if (finals.length) {
    const byComp = new Map();
    for (const f of finals) {
      if (!byComp.has(f.key)) byComp.set(f.key, []);
      byComp.get(f.key).push(f);
    }
    process.stdout.write('\n  --- scoring, from finished games ---\n');
    for (const [key, games] of byComp) {
      if (games.length < 3) continue;
      const pts = games.flatMap((g) => [g.h, g.a]);
      const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
      const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length;
      const margins = games.map((g) => Math.abs(g.h - g.a));
      const mMean = margins.reduce((a, b) => a + b, 0) / margins.length;
      process.stdout.write(
        `  ${key.padEnd(40)} n=${String(games.length).padStart(3)}  ` +
          `pts/team ${mean.toFixed(1)} (sd ${Math.sqrt(variance).toFixed(1)})  ` +
          `|margin| ${mMean.toFixed(1)}  ties=${games.filter((g) => g.h === g.a).length}\n`,
      );
    }
  }
}
