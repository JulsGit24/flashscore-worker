// Team records, form and head-to-head, computed from cached WNBA results.
//
// Same approach as the soccer side: the feed exposes no standings endpoint, so
// the table is derived from finished games. Basketball has no draws, which
// simplifies the record to wins and losses.

import { SEASON_GAP_DAYS, seasonStarts } from '../table.js';

export const FORM_WINDOW = 5;

/** Build the league table from distilled games, most recent season only. */
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
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  const rows = [...teams.values()].sort(
    (a, b) =>
      b.wins / Math.max(1, b.played) - a.wins / Math.max(1, a.played) ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.team.localeCompare(b.team),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/**
 * Recent form for one team: results most recent first, plus scoring in them.
 * @returns {{streak:string, played:number, pointsFor:number, pointsAgainst:number,
 *   winRate:number|null, pointsForAvg:number|null, pointsAgainstAvg:number|null}}
 */
export function recentForm(games, team, limit = FORM_WINDOW) {
  const played = games
    .filter((g) => g.h === team || g.a === team)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);

  let pointsFor = 0;
  let pointsAgainst = 0;
  let wins = 0;
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
    } else {
      results.push('L');
    }
  }

  return {
    streak: results.join(''),
    played: played.length,
    pointsFor,
    pointsAgainst,
    winRate: played.length ? wins / played.length : null,
    pointsForAvg: played.length ? pointsFor / played.length : null,
    pointsAgainstAvg: played.length ? pointsAgainst / played.length : null,
  };
}

/**
 * Every cached meeting between two teams, most recent first. This is the
 * head-to-head basis the report quotes alongside the model.
 */
export function headToHead(games, teamA, teamB, limit = 5) {
  return games
    .filter(
      (g) =>
        (g.h === teamA && g.a === teamB) || (g.h === teamB && g.a === teamA),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((g) => ({
      ts: g.ts,
      home: g.h,
      away: g.a,
      homePoints: g.hg,
      awayPoints: g.ag,
      total: g.hg + g.ag,
      winner: g.hg > g.ag ? g.h : g.a,
    }));
}

/** Summary of a head-to-head set, for the report. */
export function headToHeadSummary(meetings, teamA) {
  if (!meetings.length) return { played: 0, aWins: 0, bWins: 0, averageTotal: null };
  let aWins = 0;
  let totals = 0;
  for (const m of meetings) {
    if (m.winner === teamA) aWins += 1;
    totals += m.total;
  }
  return {
    played: meetings.length,
    aWins,
    bWins: meetings.length - aWins,
    averageTotal: totals / meetings.length,
  };
}
