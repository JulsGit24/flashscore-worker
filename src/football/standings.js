// Team records, form and head-to-head for American football.
//
// Close to the basketball and baseball version, with one real difference that
// makes it worth its own file rather than a re-export: **the NFL can tie.**
//
// Those other two treat "not a win" as a loss, which is correct for them —
// basketball has no draws, and a tied baseball game goes to extra innings and
// comes back with a winner. An NFL game tied after overtime simply stays tied.
// It is rare, roughly one a season, but running it through the basketball
// counter would silently credit the away side with a win, corrupting both
// records for the rest of the season. College football has no ties; the same
// code handles both because it counts what actually happened.
//
// Head-to-head is deliberately thin here. NFL sides meet once or twice a year
// and college opponents often not at all, so unlike basketball there is rarely
// a meeting to quote — the report says so rather than implying a gap.

import { SEASON_GAP_DAYS, seasonStarts } from '../table.js';

export const FORM_WINDOW = 5;

/** Build the table from distilled games, most recent season only. */
export function buildStandings(games, { gapDays = SEASON_GAP_DAYS } = {}) {
  const starts = seasonStarts(games.map((g) => g.ts), gapDays);
  const cutoff = starts.length ? starts[starts.length - 1] : 0;
  const current = games.filter((g) => g.ts >= cutoff);

  const teams = new Map();
  const team = (name) => {
    if (!teams.has(name)) {
      teams.set(name, {
        team: name,
        played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      });
    }
    return teams.get(name);
  };

  const seen = new Set();
  for (const g of current) {
    const id = `${g.ts}|${g.h}|${g.a}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const home = team(g.h);
    const away = team(g.a);
    home.played += 1;
    away.played += 1;
    home.pointsFor += g.hg;
    home.pointsAgainst += g.ag;
    away.pointsFor += g.ag;
    away.pointsAgainst += g.hg;

    if (g.hg > g.ag) {
      home.wins += 1;
      away.losses += 1;
    } else if (g.ag > g.hg) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  // A tie counts half, which is how both the NFL and college football rank on
  // win percentage.
  const winPct = (r) => (r.played ? (r.wins + r.ties / 2) / r.played : 0);
  const rows = [...teams.values()].sort(
    (a, b) =>
      winPct(b) - winPct(a) ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.team.localeCompare(b.team),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
    row.winPct = winPct(row);
  });
  return rows;
}

/**
 * Recent form for one team: results most recent first, plus scoring in them.
 * `T` marks a tie, matching the letter the soccer report uses.
 */
export function recentForm(games, team, limit = FORM_WINDOW) {
  const played = games
    .filter((g) => g.h === team || g.a === team)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);

  let pointsFor = 0;
  let pointsAgainst = 0;
  let wins = 0;
  let ties = 0;
  const results = [];

  for (const g of played) {
    const isHome = g.h === team;
    const scored = isHome ? g.hg : g.ag;
    const conceded = isHome ? g.ag : g.hg;
    pointsFor += scored;
    pointsAgainst += conceded;
    if (scored > conceded) {
      results.push('W');
      wins += 1;
    } else if (scored < conceded) {
      results.push('L');
    } else {
      results.push('T');
      ties += 1;
    }
  }

  return {
    streak: results.join(''),
    played: played.length,
    pointsFor,
    pointsAgainst,
    winRate: played.length ? (wins + ties / 2) / played.length : null,
    pointsForAvg: played.length ? pointsFor / played.length : null,
    pointsAgainstAvg: played.length ? pointsAgainst / played.length : null,
  };
}

/** Every cached meeting between two teams, most recent first. */
export function headToHead(games, teamA, teamB, limit = 5) {
  return games
    .filter((g) => (g.h === teamA && g.a === teamB) || (g.h === teamB && g.a === teamA))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((g) => ({
      ts: g.ts,
      home: g.h,
      away: g.a,
      homePoints: g.hg,
      awayPoints: g.ag,
      total: g.hg + g.ag,
      winner: g.hg === g.ag ? null : g.hg > g.ag ? g.h : g.a,
    }));
}

/** Summary of a head-to-head set, for the report. */
export function headToHeadSummary(meetings, teamA) {
  if (!meetings.length) return { played: 0, aWins: 0, bWins: 0, ties: 0, averageTotal: null };
  let aWins = 0;
  let ties = 0;
  let totals = 0;
  for (const m of meetings) {
    if (m.winner === null) ties += 1;
    else if (m.winner === teamA) aWins += 1;
    totals += m.total;
  }
  return {
    played: meetings.length,
    aWins,
    bWins: meetings.length - aWins - ties,
    ties,
    averageTotal: totals / meetings.length,
  };
}
