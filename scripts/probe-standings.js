#!/usr/bin/env node
// Diagnostic: dump what the live feed actually returns for tournament headers
// and for each candidate standings URL shape. Run this when `tables loaded` is
// 0 in a report. Not part of the daily run.
import { DEFAULTS, extractMatches, parseFeed } from '../src/flashscore.js';
import { classifyCompetition, parseTournamentUrl } from '../src/leagues.js';

const cfg = DEFAULTS;

function headers() {
  return {
    'x-fsign': cfg.fsign,
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    referer: cfg.referer,
    origin: new URL(cfg.referer).origin,
    'user-agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  };
}

async function raw(path) {
  const url = `https://${cfg.host}/${cfg.project}/x/feed/${path}`;
  try {
    const res = await fetch(url, { headers: headers() });
    const body = await res.text();
    return { path, status: res.status, len: body.length, body };
  } catch (err) {
    return { path, status: 'ERR', len: 0, body: String(err.message) };
  }
}

const dayBody = await raw(`f_1_0_0_${cfg.lang}_1`);
console.log(`# day feed: HTTP ${dayBody.status}, ${dayBody.len} bytes\n`);

const records = parseFeed(dayBody.body);

// Every distinct tournament header, with all keys, for the in-scope leagues.
const headersSeen = [];
for (const r of records) {
  if (r.ZA === undefined) continue;
  const { country, slug } = parseTournamentUrl(r.ZL);
  if (!classifyCompetition({ country, slug, name: r.ZA }).include) continue;
  headersSeen.push(r);
}

console.log(`# ${headersSeen.length} in-scope tournament headers\n`);
console.log('## full key dump of the first three headers\n');
for (const h of headersSeen.slice(0, 3)) {
  console.log(JSON.stringify(h, null, 2));
  console.log('');
}

// Candidate id fields x candidate URL shapes, against the first header.
const probe = headersSeen[0];
if (!probe) {
  console.log('No in-scope headers today — cannot probe standings.');
  process.exit(0);
}

const idKeys = ['ZC', 'ZEE', 'ZB', 'ZA', 'ZD', 'ZE', 'ZH', 'ZJ'];
const shapes = [
  (id) => `to_${id}_table_overall`,
  (id) => `ta_${id}_table_overall`,
  (id) => `to_${id}_overall`,
  (id) => `tos_${id}_table_overall`,
  (id) => `t_${id}_table_overall`,
  (id) => `to_${id}_standings_overall`,
];

console.log(`## probing standings for ${probe.ZA} (${probe.ZL})\n`);
for (const key of idKeys) {
  const id = probe[key];
  if (!id) continue;
  for (const shape of shapes) {
    const r = await raw(shape(id));
    const hit = r.status === 200 && r.len > 40;
    console.log(
      `${hit ? 'HIT ' : '    '} ${key}=${id} ${shape(id)} -> ${r.status} ${r.len}b` +
        (r.len ? ` :: ${r.body.slice(0, 220).replace(/\n/g, ' ')}` : ''),
    );
  }
}
