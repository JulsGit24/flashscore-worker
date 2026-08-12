// Client + parser for the Flashscore "ninja" feed that powers flashscoreusa.com.
//
// The feed is a flat, delimiter-separated stream rather than JSON:
//
//   <record> ~ <record> ~ ...
//   <record> := <key> ÷ <value> ¬ <key> ÷ <value> ¬ ...
//
// Tournament header records carry Z* keys and match records carry A* keys. The
// parser is deliberately generic — it returns each record as a plain key/value
// map, and the field mapping lives in FIELDS, so a key rename upstream is a
// one-line fix rather than a rewrite.
//
// Only the day fixtures feed is used. Flashscore's standings endpoint could not
// be identified (every candidate id and URL shape answers HTTP 200 with a
// 1-byte "0"), so league tables are derived from past day feeds instead — see
// history.js and table.js.

/**
 * Feed sport ids, confirmed live: 1 and 3 both return a full day, 2 and 6 too.
 * The WNBA sits on 3 at /basketball/usa/wnba/, and MLB on 6 at
 * /baseball/usa/mlb/.
 */
export const SPORT = {
  soccer: 1,
  basketball: 3,
  baseball: 6,
};

export const REC_SEP = '~';
export const PAIR_SEP = '¬';
export const KV_SEP = '÷';

/** Field codes, most-likely first. `pick()` walks the list until one hits. */
export const FIELDS = {
  matchId: ['AA'],
  startTs: ['AD'],
  homeName: ['AE', 'CX'],
  awayName: ['AF'],
  homeScore: ['AG'],
  awayScore: ['AH'],
  statusId: ['AC'],
  stageCode: ['AB'],
  tournamentName: ['ZA'],
  tournamentUrl: ['ZL'],
  tournamentCountry: ['ZY'],
  tournamentStageId: ['ZC', 'ZEE', 'ZB'],
};

export function pick(record, field) {
  for (const key of FIELDS[field] ?? []) {
    if (record[key] !== undefined && record[key] !== '') return record[key];
  }
  return undefined;
}

/** Parse a raw feed body into an ordered array of key/value records. */
export function parseFeed(body) {
  const records = [];
  for (const chunk of String(body).split(REC_SEP)) {
    if (!chunk.trim()) continue;
    const record = {};
    for (const pair of chunk.split(PAIR_SEP)) {
      if (!pair) continue;
      const idx = pair.indexOf(KV_SEP);
      if (idx === -1) continue;
      record[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
    }
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}

/**
 * Walk parsed records, attaching each match to the tournament header that
 * preceded it. Returns raw match objects — filtering happens in leagues.js.
 */
export function extractMatches(records) {
  const matches = [];
  let tournament = null;

  for (const record of records) {
    const name = pick(record, 'tournamentName');
    if (name !== undefined) {
      tournament = {
        name,
        url: pick(record, 'tournamentUrl') ?? '',
        country: pick(record, 'tournamentCountry') ?? '',
        stageId: pick(record, 'tournamentStageId') ?? null,
      };
      continue;
    }

    const id = pick(record, 'matchId');
    if (id === undefined) continue;

    const startTs = Number(pick(record, 'startTs'));
    matches.push({
      id,
      tournament,
      kickoff: Number.isFinite(startTs) ? new Date(startTs * 1000) : null,
      home: pick(record, 'homeName') ?? '',
      away: pick(record, 'awayName') ?? '',
      homeScore: toIntOrNull(pick(record, 'homeScore')),
      awayScore: toIntOrNull(pick(record, 'awayScore')),
      statusId: pick(record, 'statusId') ?? null,
      raw: record,
    });
  }
  return matches;
}

function toIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  // Scores can arrive as "2" or as aggregate strings like "2 (1)".
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

// --- network -----------------------------------------------------------------

export const DEFAULTS = {
  host: process.env.FS_HOST ?? 'local-global.flashscore.ninja',
  project: process.env.FS_PROJECT ?? '2',
  fsign: process.env.FS_SIGN ?? 'SW9D1eZo',
  lang: process.env.FS_LANG ?? 'en-us',
  referer: process.env.FS_REFERER ?? 'https://www.flashscoreusa.com/',
};

function feedHeaders(cfg) {
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

export async function fetchFeed(feedPath, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const url = `https://${cfg.host}/${cfg.project}/x/feed/${feedPath}`;
  const res = await fetch(url, { headers: feedHeaders(cfg) });
  if (!res.ok) {
    throw new Error(`feed ${feedPath} -> HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  if (!body.includes(KV_SEP)) {
    throw new Error(
      `feed ${feedPath} returned ${body.length} bytes that do not look like a feed ` +
        `(first 120: ${body.slice(0, 120)}). Re-check FS_PROJECT / FS_SIGN.`,
    );
  }
  return body;
}

/**
 * Fixtures for a day. `dayOffset` is relative to today (0 = today).
 * `tzOffset` is the whole-hour UTC offset the feed buckets days by; kickoff
 * timestamps are absolute either way, so this only affects which matches the
 * feed considers to fall on the requested day.
 */
export async function fetchDayFixtures({
  dayOffset = 0,
  tzOffset = 0,
  sport = SPORT.soccer,
  ...options
} = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const body = await fetchFeed(`f_${sport}_${dayOffset}_${tzOffset}_${cfg.lang}_1`, cfg);
  return extractMatches(parseFeed(body));
}
