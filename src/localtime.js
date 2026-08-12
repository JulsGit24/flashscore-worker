// Local-day helpers.
//
// These exist because "today" is not a property of an instant — it depends on
// where you are standing. The feed buckets its day files by a UTC offset it is
// given, and the reports are read in America/New_York, and those two disagree
// for exactly the games that matter most here.
//
// Concretely: a 7:05pm Eastern first pitch is 23:05 UTC, so an evening slate
// straddles the UTC midnight. Asking the feed for "day 0" at offset 0 returns a
// window that covers part of yesterday evening and part of today — which showed
// up as an MLB slate of 25 games, being 15 real ones and 10 from the night
// before, each projected as though it had not been played yet.
//
// So two things are needed, and both live here: ask the feed for the day in the
// right offset, and then filter what comes back to the day actually wanted.

/**
 * The ISO date (YYYY-MM-DD) that `date` falls on in `tz`.
 * en-CA formats as YYYY-MM-DD, which is what makes this a one-liner.
 */
export function localDate(date, tz) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Whole-hour UTC offset in effect for `tz` at `at`. Follows DST, because it
 * asks about a specific instant rather than the zone in the abstract.
 *
 * Half-hour zones round to the nearest hour: the feed's day bucketing takes
 * whole hours, and a 30-minute error cannot move a fixture across a day
 * boundary once the results are filtered by local date anyway.
 */
export function tzOffsetHours(tz, at = new Date()) {
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asLocal = new Date(at.toLocaleString('en-US', { timeZone: tz }));
  return Math.round((asLocal - asUtc) / 3_600_000);
}

/** The ISO date `dayOffset` days from now, as seen in `tz`. */
export function targetDate(dayOffset, tz, now = new Date()) {
  return localDate(new Date(now.getTime() + dayOffset * 86_400_000), tz);
}

/** Keep only fixtures that fall on `date` in `tz`. */
export function onLocalDate(fixtures, date, tz) {
  return fixtures.filter((f) => f.kickoff && localDate(f.kickoff, tz) === date);
}

/**
 * Every fixture that falls on the wanted local day, however the feed happens to
 * bucket its own days.
 *
 * Two things are done, and both are needed:
 *
 * 1. The feed is asked for the day at the report's UTC offset rather than at
 *    zero, so its window is already close to the right one.
 * 2. The requested day *and the one after it* are fetched and merged, then
 *    filtered by local date. The feed's window was measured at about 27 hours
 *    wide and does not line up with any calendar day, so the tail of a local
 *    evening can sit in the next day's file. Filtering alone would silently
 *    drop those; fetching alone would keep the neighbours' games.
 *
 * The extra request is one call against a feed this already hits several times,
 * and it buys a guarantee at the boundary, which is precisely where evening
 * sports live.
 *
 * @param {object}   opts
 * @param {Function} opts.fetchDay  ({dayOffset, tzOffset, sport}) => fixtures
 * @returns {{date: string, tzOffset: number, all: Array, onDay: Array, otherDays: number}}
 */
export async function collectLocalDay({
  dayOffset = 0,
  tz,
  sport,
  now = new Date(),
  fetchDay,
  ...options
}) {
  const tzOffset = tzOffsetHours(tz, now);
  const date = targetDate(dayOffset, tz, now);

  const windows = await Promise.all(
    [dayOffset, dayOffset + 1].map(async (offset) => {
      try {
        return await fetchDay({ dayOffset: offset, tzOffset, sport, ...options });
      } catch {
        // The neighbouring day is a completeness measure, not a dependency:
        // losing it must not cost the report the day it was actually asked for.
        return offset === dayOffset ? Promise.reject(new Error('primary day feed failed')) : [];
      }
    }),
  );

  // The two windows overlap by design, so dedupe. Match id is the real key;
  // the composite is a fallback for feeds that omit one.
  const byKey = new Map();
  for (const m of windows.flat()) {
    const key = m.id ?? `${m.home}|${m.away}|${m.kickoff?.getTime()}`;
    if (!byKey.has(key)) byKey.set(key, m);
  }

  const all = [...byKey.values()];
  const onDay = onLocalDate(all, date, tz);
  return { date, tzOffset, all, onDay, otherDays: all.length - onDay.length };
}
