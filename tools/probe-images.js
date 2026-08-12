#!/usr/bin/env node
// Second probe: now that the day feed is known to carry image filenames
// (OA = home team, OB = away team, OAJ = competition), find the host that
// actually serves them.
//
// The first attempt tested a made-up filename and got 404 from every candidate,
// which proved nothing at all — a 404 for a file that does not exist is the
// correct answer. This one pulls real filenames out of the live feed first.

import { SPORT, fetchFeed, parseFeed } from '../src/flashscore.js';

const HOSTS = [
  'https://www.flashscore.com/res/image/data/',
  'https://static.flashscore.com/res/image/data/',
  'https://www.flashscoreusa.com/res/image/data/',
  'https://static.flashscoreusa.com/res/image/data/',
  'https://images.flashscore.ninja/image/data/',
  'https://static.flashscore.ninja/res/image/data/',
  'https://www.flashscore.com/res/_fs/image/data/',
];

/** Real filenames, straight from today's feed. */
async function sampleFilenames() {
  const out = { team: new Set(), competition: new Set() };
  for (const sport of [SPORT.soccer, SPORT.basketball, SPORT.baseball]) {
    const records = parseFeed(await fetchFeed(`f_${sport}_0_-4_en_1`));
    for (const r of records) {
      if (r.OA) out.team.add(r.OA);
      if (r.OB) out.team.add(r.OB);
      if (r.OAJ) out.competition.add(r.OAJ);
    }
  }
  return { team: [...out.team].slice(0, 3), competition: [...out.competition].slice(0, 3) };
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { referer: 'https://www.flashscoreusa.com/', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    // A 200 that hands back HTML is not an image. Check the magic bytes.
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
    const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
    const isSvg = buf.toString('utf8', 0, 200).includes('<svg');
    const kind = isPng ? 'PNG' : isJpg ? 'JPEG' : isSvg ? 'SVG' : 'not-an-image';
    return `${res.status} ${String(buf.length).padStart(7)}b ${kind.padEnd(12)} ${res.headers.get('content-type') ?? ''}`;
  } catch (err) {
    return `FAILED ${err.message}`;
  }
}

const names = await sampleFilenames();
process.stdout.write(`team filenames:        ${names.team.join(', ') || '(none)'}\n`);
process.stdout.write(`competition filenames: ${names.competition.join(', ') || '(none)'}\n\n`);

for (const kind of ['team', 'competition']) {
  const file = names[kind][0];
  if (!file) continue;
  process.stdout.write(`--- ${kind}: ${file} ---\n`);
  for (const host of HOSTS) {
    process.stdout.write(`${(await probe(host + file)).padEnd(50)}  ${host}\n`);
  }
  process.stdout.write('\n');
}
