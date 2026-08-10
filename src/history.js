// Season history, built by replaying past day feeds.
//
// Flashscore's standings endpoint could not be identified — every candidate id
// and URL shape answers HTTP 200 with a 1-byte "0" body. The day fixtures feed,
// on the other hand, is reliable, so the league tables here are computed from
// finished matches rather than fetched. That has two side benefits: it depends
// on exactly one upstream endpoint, and the derived table is guaranteed to be
// consistent with the fixtures the report ranks.
//
// Results are cached on disk so a daily run fetches one new day, not a season.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchDayFixtures } from './flashscore.js';
import { classifyCompetition, parseTournamentUrl } from './leagues.js';

export const DEFAULT_CACHE = 'data/history.json';
/** How far back to look. Covers a full summer-calendar season (Mar-Nov). */
export const DEFAULT_LOOKBACK_DAYS = 300;
/** Parallel day-feed fetches. Kept modest to stay a polite client. */
export const DEFAULT_CONCURRENCY = 6;

const isoDay = (date) => date.toISOString().slice(0, 10);

export function dayKeyForOffset(offset, now = new Date()) {
  return isoDay(new Date(now.getTime() + offset * 86400000));
}

export async function loadCache(cachePath = DEFAULT_CACHE) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveCache(cache, cachePath = DEFAULT_CACHE) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache));
}

/** Keep only finished, in-scope matches, in a compact cacheable shape. */
export function distilDay(matches) {
  const out = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    const verdict = classifyCompetition({ country, slug, name: m.tournament?.name });
    if (!verdict.include) continue;
    out.push({
      l: `${country}/${slug}`,
      h: m.home,
      a: m.away,
      hg: m.homeScore,
      ag: m.awayScore,
      ts: m.kickoff ? Math.floor(m.kickoff.getTime() / 1000) : 0,
    });
  }
  return out;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Ensure the cache covers the last `days` days, fetching only what is missing.
 * Returns every cached match plus counters for the report footer.
 */
export async function updateHistory({
  cachePath = DEFAULT_CACHE,
  days = DEFAULT_LOOKBACK_DAYS,
  concurrency = DEFAULT_CONCURRENCY,
  now = new Date(),
  fetchDay = (offset) => fetchDayFixtures({ dayOffset: offset }),
  onError = () => {},
} = {}) {
  const cache = await loadCache(cachePath);

  const wanted = [];
  for (let offset = -1; offset >= -days; offset -= 1) {
    const key = dayKeyForOffset(offset, now);
    if (!cache[key]) wanted.push({ offset, key });
  }

  let fetched = 0;
  let failed = 0;
  await mapWithConcurrency(wanted, concurrency, async ({ offset, key }) => {
    try {
      cache[key] = distilDay(await fetchDay(offset));
      fetched += 1;
    } catch (err) {
      failed += 1;
      onError(`day ${key}: ${err.message}`);
    }
  });

  // Drop days that have aged out so the cache does not grow without bound.
  const oldest = dayKeyForOffset(-days, now);
  for (const key of Object.keys(cache)) {
    if (key < oldest) delete cache[key];
  }

  if (fetched > 0 || failed > 0) await saveCache(cache, cachePath);

  const matches = Object.values(cache).flat();
  return { matches, daysCached: Object.keys(cache).length, daysFetched: fetched, daysFailed: failed };
}
