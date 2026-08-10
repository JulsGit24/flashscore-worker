// Promoted and relegated sides, derived from where a team played last season.
//
// The feed exposes no "promoted" flag, but the cached results carry which
// league every result belonged to. So a side that played in the second tier
// last season and the first tier this season came up, and vice versa. That
// needs two seasons of history in the cache: until it has them, every team
// reports `unknown` rather than a guess.

import { LEAGUE_INDEX } from './leagues.data.js';
import { SEASON_GAP_DAYS, seasonStarts } from './table.js';

export const STATUS = {
  promoted: 'promoted',
  relegated: 'relegated',
  same: 'same',
  unknown: 'unknown',
};

export const STATUS_BADGE = {
  promoted: '⇑',
  relegated: '⇓',
  same: '',
  unknown: '',
};

/** Tier of a league key like "england/championship", or null if unknown. */
export function tierOf(leagueKey) {
  return LEAGUE_INDEX.get(leagueKey)?.tier ?? null;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Where did this team play before the current season, and was that a higher or
 * lower tier than where they are now?
 *
 * @param {Array} matches distilled results, any league
 * @param {string} team
 * @param {string} currentLeagueKey the league the team is in now
 * @returns {'promoted'|'relegated'|'same'|'unknown'}
 */
export function promotionStatus(matches, team, currentLeagueKey, { gapDays = SEASON_GAP_DAYS } = {}) {
  const appearances = matches
    .filter((m) => m.h === team || m.a === team)
    .sort((a, b) => a.ts - b.ts);
  if (appearances.length === 0) return STATUS.unknown;

  const starts = seasonStarts(appearances.map((a) => a.ts), gapDays);
  // One season of history cannot say anything about where a team came from.
  if (starts.length < 2) return STATUS.unknown;

  const currentStart = starts[starts.length - 1];
  const previous = appearances.filter((a) => a.ts < currentStart);
  if (previous.length === 0) return STATUS.unknown;

  const previousLeague = mostCommon(previous.map((a) => a.l));
  const currentTier = tierOf(currentLeagueKey);
  const previousTier = tierOf(previousLeague);
  if (currentTier === null || previousTier === null) return STATUS.unknown;

  // Tier 1 is the top, so a smaller number now means the side came up.
  if (currentTier < previousTier) return STATUS.promoted;
  if (currentTier > previousTier) return STATUS.relegated;
  return STATUS.same;
}
