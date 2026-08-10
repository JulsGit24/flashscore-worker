#!/usr/bin/env node
// Diagnostic: what does the feed carry beyond soccer, and is there any
// player-level data behind a match?
//
// A 1-byte "0" body is the "no such feed" sentinel, so any response containing
// the key separator is a real hit. Not part of any daily run.
import { DEFAULTS, KV_SEP, parseFeed } from '../src/flashscore.js';

const cfg = DEFAULTS;
const headers = {
  'x-fsign': cfg.fsign,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  referer: cfg.referer,
  origin: new URL(cfg.referer).origin,
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
};

async function raw(feedPath) {
  try {
    const res = await fetch(`https://${cfg.host}/${cfg.project}/x/feed/${feedPath}`, { headers });
    const body = await res.text();
    return { feedPath, status: res.status, body, ok: body.includes(KV_SEP) };
  } catch (err) {
    return { feedPath, status: 'ERR', body: String(err.message), ok: false };
  }
}

// --- 1. which sport ids answer -----------------------------------------------
console.log('## sport ids on the day feed (offset 0)\n');
const sports = {};
for (let sport = 1; sport <= 12; sport += 1) {
  // Look a day back too: some sports have nothing scheduled today.
  let hit = null;
  for (const offset of [0, -1, -2]) {
    const r = await raw(`f_${sport}_${offset}_0_${cfg.lang}_1`);
    if (r.ok) {
      hit = { offset, body: r.body };
      break;
    }
  }
  if (!hit) {
    console.log(`  sport ${String(sport).padStart(2)} -> empty`);
    continue;
  }
  const records = parseFeed(hit.body);
  const tournaments = records.filter((r) => r.ZA !== undefined);
  sports[sport] = { tournaments, offset: hit.offset };
  console.log(
    `  sport ${String(sport).padStart(2)} -> ${hit.body.length}b at offset ${hit.offset}, ` +
      `${tournaments.length} competitions e.g. ${tournaments.slice(0, 3).map((t) => t.ZA).join(' | ')}`,
  );
}

// --- 2. find the WNBA --------------------------------------------------------
console.log('\n## looking for the WNBA\n');
let wnba = null;
let wnbaSport = null;
for (const [sport, info] of Object.entries(sports)) {
  for (const t of info.tournaments) {
    const label = `${t.ZA ?? ''} ${t.ZL ?? ''}`;
    if (/wnba/i.test(label)) {
      wnba = t;
      wnbaSport = sport;
      console.log(`  FOUND on sport ${sport}: ${t.ZA}  url=${t.ZL}`);
      console.log(`  header keys: ${JSON.stringify(t)}`);
    }
  }
}
if (!wnba) {
  console.log('  not present today. Basketball competitions seen:');
  for (const [sport, info] of Object.entries(sports)) {
    if (!info.tournaments.some((t) => /basketball|nba|wnba/i.test(`${t.ZA} ${t.ZL}`))) continue;
    for (const t of info.tournaments.slice(0, 40)) {
      console.log(`    sport ${sport}: ${t.ZA}  ${t.ZL ?? ''}`);
    }
  }
}

// --- 3. is there anything player-level behind a match? -----------------------
console.log('\n## per-match detail feeds\n');
const basketballSport = wnbaSport ?? Object.keys(sports).find((s) => sports[s].tournaments.some((t) => /basketball|nba/i.test(`${t.ZA} ${t.ZL}`)));

let matchId = null;
if (basketballSport) {
  const info = sports[basketballSport];
  const body = (await raw(`f_${basketballSport}_${info.offset}_0_${cfg.lang}_1`)).body;
  const match = parseFeed(body).find((r) => r.AA !== undefined);
  matchId = match?.AA ?? null;
  console.log(`  using basketball match id ${matchId} (sport ${basketballSport})`);
}
if (!matchId) {
  const body = (await raw(`f_1_0_0_${cfg.lang}_1`)).body;
  matchId = parseFeed(body).find((r) => r.AA !== undefined)?.AA ?? null;
  console.log(`  no basketball match; falling back to soccer match id ${matchId}`);
}

if (matchId) {
  const shapes = [
    (id) => `df_st_1_${id}`, // statistics
    (id) => `df_sui_1_${id}`, // summary
    (id) => `df_pl_1_${id}`, // player lineups?
    (id) => `df_lu_1_${id}`, // lineups
    (id) => `dp_1_${id}`,
    (id) => `dpl_1_${id}`,
    (id) => `dps_1_${id}`,
    (id) => `box_${id}`,
    (id) => `bs_${id}`,
    (id) => `ps_${id}`,
    (id) => `player_stats_${id}`,
    (id) => `df_pstat_1_${id}`,
    (id) => `sui_${id}`,
    (id) => `st_${id}`,
  ];
  let hits = 0;
  for (const shape of shapes) {
    const r = await raw(shape(matchId));
    if (r.ok) {
      hits += 1;
      console.log(`  HIT ${r.feedPath} -> ${r.status} ${r.body.length}b :: ${r.body.slice(0, 400).replace(/\n/g, ' ')}`);
    }
  }
  console.log(`  ${hits} per-match detail feeds responded`);
}

// --- 4. any sign of injuries anywhere ---------------------------------------
console.log('\n## injury / news feeds');
for (const p of ['injuries_1', 'inj_1', 'news_1', `df_inj_1_${matchId}`, `df_news_1_${matchId}`]) {
  const r = await raw(p);
  console.log(`  ${p} -> ${r.ok ? `HIT ${r.body.length}b` : 'empty'}`);
}
