// Recent form for one team: the last N results, goals scored and conceded in
// them, and whether the side is climbing or sliding relative to its own season.

export const FORM_WINDOW = 5;

/**
 * @param {Array} matches distilled matches for the team's league
 * @param {string} team
 * @param {number} limit how many recent games to summarise
 * @returns {{
 *   streak: string,        // e.g. "WWLTW", most recent first
 *   played: number,
 *   goalsFor: number,      // in those games
 *   goalsAgainst: number,  // in those games
 *   points: number,
 *   ppg: number|null,
 * }}
 */
export function recentForm(matches, team, limit = FORM_WINDOW) {
  const played = matches
    .filter((m) => m.h === team || m.a === team)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);

  let goalsFor = 0;
  let goalsAgainst = 0;
  let points = 0;
  const results = [];

  for (const m of played) {
    const isHome = m.h === team;
    const scored = isHome ? m.hg : m.ag;
    const conceded = isHome ? m.ag : m.hg;
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > conceded) {
      results.push('W');
      points += 3;
    } else if (scored < conceded) {
      results.push('L');
    } else {
      results.push('T');
      points += 1;
    }
  }

  return {
    streak: results.join(''),
    played: played.length,
    goalsFor,
    goalsAgainst,
    points,
    ppg: played.length ? points / played.length : null,
  };
}

/** How much better or worse than its season average a team's ppg must be to count. */
export const TREND_THRESHOLD = 0.35;

/**
 * Compare recent points-per-game against the season figure.
 * @returns {'ascending'|'descending'|'steady'|'unknown'}
 */
export function formTrend(form, seasonPpg, { minGames = 3, threshold = TREND_THRESHOLD } = {}) {
  if (!form || form.played < minGames || form.ppg === null || seasonPpg === null) {
    return 'unknown';
  }
  const delta = form.ppg - seasonPpg;
  if (delta >= threshold) return 'ascending';
  if (delta <= -threshold) return 'descending';
  return 'steady';
}

export const TREND_ARROW = {
  ascending: '↑',
  descending: '↓',
  steady: '→',
  unknown: '·',
};
