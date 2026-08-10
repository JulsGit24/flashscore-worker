#!/usr/bin/env node
// Diagnostic: hunt for a per-tournament results/standings feed.
//
// A 1-byte "0" body is Flashscore's "no such feed" sentinel, so any response
// containing the key separator is a real hit. Run when the derived tables are
// empty; not part of the daily run.
import { DEFAULTS, KV_SEP, extractMatches, parseFeed } from '../src/flashscore.js';
import { classifyCompetition, parseTournamentUrl } from '../src/leagues.js';

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
    return { feedPath, status: res.status, body };
  } catch (err) {
    return { feedPath, status: 'ERR', body: String(err.message) };
  }
}

const dayBody = await raw(`f_1_0_0_${cfg.lang}_1`);
const headersSeen = [];
for (const r of parseFeed(dayBody.body)) {
  if (r.ZA === undefined) continue;
  const { country, slug } = parseTournamentUrl(r.ZL);
  if (classifyCompetition({ country, slug, name: r.ZA }).include) headersSeen.push(r);
}
console.log(`# ${headersSeen.length} in-scope headers; probing the first two\n`);

const PREFIXES = [
  'to', 'ta', 't', 'tr', 'ts', 'tss', 'tt', 'td', 'tds', 'tb', 'tp', 'tab',
  'ss', 'st', 'sta', 'standings', 'table',
  'res', 'results', 'r', 'rs', 'fx', 'fixtures', 'f', 'fs',
  'g', 'gs', 'lt', 'l', 'ls', 'mt', 'ms', 'd', 'di', 'dt',
];
const SHAPES = [
  (p, id) => `${p}_${id}`,
  (p, id) => `${p}_${id}_1`,
  (p, id) => `${p}_${id}_page_1`,
  (p, id) => `${p}_${id}_${cfg.lang}_1`,
  (p, id) => `${p}_1_${id}`,
];

let hits = 0;
for (const header of headersSeen.slice(0, 2)) {
  console.log(`## ${header.ZA}  ZEE=${header.ZEE} ZC=${header.ZC}\n`);
  for (const id of [header.ZEE, header.ZC]) {
    if (!id) continue;
    for (const p of PREFIXES) {
      const results = await Promise.all(SHAPES.map((shape) => raw(shape(p, id))));
      for (const r of results) {
        if (typeof r.body === 'string' && r.body.includes(KV_SEP)) {
          hits += 1;
          console.log(
            `HIT ${r.feedPath} -> ${r.status} ${r.body.length}b :: ` +
              `${r.body.slice(0, 300).replace(/\n/g, ' ')}`,
          );
        }
      }
    }
  }
}
console.log(`\n# ${hits} hits`);

// Also confirm the day-feed window, so the lookback limit is documented fact.
console.log('\n## day feed offset window');
for (const offset of [-9, -8, -7, 7, 8, 9]) {
  const r = await raw(`f_1_${offset}_0_${cfg.lang}_1`);
  const ok = typeof r.body === 'string' && r.body.includes(KV_SEP);
  const n = ok ? extractMatches(parseFeed(r.body)).length : 0;
  console.log(`  offset ${String(offset).padStart(3)} -> ${ok ? `OK ${n} matches` : 'empty'}`);
}
