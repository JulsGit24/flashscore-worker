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
import { SPORT, fetchDayFixtures } from './flashscore.js';
import { parseTournamentUrl } from './leagues.js';
import { regionOf } from './leagues.data.js';

export const DEFAULT_CACHE = 'data/history.json';

/**
 * Bump when the shape or the capture rule of a cached day changes. A cache
 * written under an older version is discarded and refetched rather than
 * silently mixed with days captured under different rules.
 *
 * 2: capture by region rather than by the league allowlist. Under v1 a day was
 *    filtered through the full allowlist at write time, so leagues added later
 *    could never be backfilled — the Americas and Asia came out empty against a
 *    cache captured when only Europe was configured.
 */
export const CACHE_VERSION = 2;
/**
 * The day feed only serves offsets -7..+7 — anything outside answers HTTP 200
 * with a 1-byte "0". Verified directly: -8 and +8 are empty, -7 and +7 both
 * return a full day. So this is the hard ceiling on what a single run can pull,
 * and the cache is what turns it into a season.
 */
export const FETCH_WINDOW_DAYS = 7;
/** How much history to keep once fetched. Covers a full season either calendar. */
export const DEFAULT_RETAIN_DAYS = 400;
/** Parallel day-feed fetches. Kept modest to stay a polite client. */
export const DEFAULT_CONCURRENCY = 6;

const isoDay = (date) => date.toISOString().slice(0, 10);

export function dayKeyForOffset(offset, now = new Date()) {
  return isoDay(new Date(now.getTime() + offset * 86400000));
}

export async function loadCache(cachePath = DEFAULT_CACHE) {
  try {
    const parsed = JSON.parse(await readFile(cachePath, 'utf8'));
    if (parsed?.version !== CACHE_VERSION) return {};
    return parsed.days ?? {};
  } catch {
    return {};
  }
}

export async function saveCache(days, cachePath = DEFAULT_CACHE) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ version: CACHE_VERSION, days }));
}

/**
 * Keep every finished match from a country in a reported region, in a compact
 * cacheable shape.
 *
 * Deliberately filtered by region rather than by the league allowlist: the
 * allowlist changes whenever a league is added or a slug corrected, and a cache
 * captured under the old list cannot be backfilled — the day feed only reaches
 * back a week. Regions are the stable layer, so capturing against them keeps
 * history usable when the league list moves underneath it. Fixtures are still
 * filtered through the full allowlist when a report is built.
 */
export function distilDay(matches) {
  const out = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    if (!country || !slug || !regionOf(country)) continue;
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
 * Top up the cache from the fetchable window, then prune anything older than
 * `retainDays`. Returns every cached match plus counters for the report footer.
 *
 * Because the window is only a week wide, a fresh cache cannot reconstruct a
 * season on its first run — it fills in as the job runs each morning. Days
 * already cached are never refetched, so no history is lost when it ages out
 * of the window.
 */
export async function updateHistory({
  cachePath = DEFAULT_CACHE,
  retainDays = DEFAULT_RETAIN_DAYS,
  window = FETCH_WINDOW_DAYS,
  concurrency = DEFAULT_CONCURRENCY,
  now = new Date(),
  sport = SPORT.soccer,
  distil = distilDay,
  fetchDay = (offset) => fetchDayFixtures({ dayOffset: offset, sport }),
  onError = () => {},
} = {}) {
  const cache = await loadCache(cachePath);

  const wanted = [];
  for (let offset = -1; offset >= -window; offset -= 1) {
    const key = dayKeyForOffset(offset, now);
    if (!cache[key]) wanted.push({ offset, key });
  }

  let fetched = 0;
  let failed = 0;
  await mapWithConcurrency(wanted, concurrency, async ({ offset, key }) => {
    try {
      cache[key] = await distil(await fetchDay(offset));
      fetched += 1;
    } catch (err) {
      failed += 1;
      onError(`day ${key}: ${err.message}`);
    }
  });

  // Drop days that have aged out so the cache does not grow without bound.
  const oldest = dayKeyForOffset(-retainDays, now);
  for (const key of Object.keys(cache)) {
    if (key < oldest) delete cache[key];
  }

  if (fetched > 0 || failed > 0) await saveCache(cache, cachePath);

  const matches = Object.values(cache).flat();
  return { matches, daysCached: Object.keys(cache).length, daysFetched: fetched, daysFailed: failed };
}
