// League tables computed from finished matches.
//
// The tricky part is season boundaries. Looking back ~300 days from August
// catches the tail of the *previous* season for autumn-spring leagues (Premier
// League, Liga Portugal) while correctly catching the current one for
// summer-calendar leagues (Allsvenskan, Eliteserien). Rather than hardcode a
// calendar per country, findSeasonStart looks for the summer break in each
// league's own fixture list and keeps only what follows it.

/** A gap this long in a league's fixtures is a season break, not a bye week. */
export const SEASON_GAP_DAYS = 40;

const DAY = 86400;

/**
 * Every season boundary in a league's fixture list, oldest first. The first
 * entry is the earliest match we hold; each later entry is the first match
 * after a summer break.
 */
export function seasonStarts(timestamps, gapDays = SEASON_GAP_DAYS) {
  const sorted = [...timestamps].filter(Boolean).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const starts = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] >= gapDays * DAY) starts.push(sorted[i]);
  }
  return starts;
}

/**
 * Given match timestamps for one league, return the cutoff after which matches
 * belong to the current season.
 */
export function findSeasonStart(timestamps, gapDays = SEASON_GAP_DAYS) {
  const starts = seasonStarts(timestamps, gapDays);
  return starts.length ? starts[starts.length - 1] : 0;
}

/** Group distilled matches by league key. */
export function groupByLeague(matches) {
  const byLeague = new Map();
  for (const m of matches) {
    if (!byLeague.has(m.l)) byLeague.set(m.l, []);
    byLeague.get(m.l).push(m);
  }
  return byLeague;
}

/**
 * Build one league table. Returns rows in the same shape the scoring model
 * expects from a standings feed.
 */
export function buildTable(matches, { gapDays = SEASON_GAP_DAYS } = {}) {
  const cutoff = findSeasonStart(matches.map((m) => m.ts), gapDays);
  const current = matches.filter((m) => m.ts >= cutoff);

  const teams = new Map();
  const team = (name) => {
    if (!teams.has(name)) {
      teams.set(name, {
        team: name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      });
    }
    return teams.get(name);
  };

  // A fixture can appear in more than one day feed (a match that rolls past
  // midnight, or a re-fetch); dedupe on the pairing plus kickoff.
  const seen = new Set();
  for (const m of current) {
    const id = `${m.ts}|${m.h}|${m.a}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const home = team(m.h);
    const away = team(m.a);
    home.played += 1;
    away.played += 1;
    home.goalsFor += m.hg;
    home.goalsAgainst += m.ag;
    away.goalsFor += m.ag;
    away.goalsAgainst += m.hg;

    if (m.hg > m.ag) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (m.hg < m.ag) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = [...teams.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.team.localeCompare(b.team),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/** A team needs at least this many games before the current season alone is usable. */
export const MIN_GAMES_FOR_CURRENT_SEASON = 3;

/**
 * Build a league table, falling back to the previous season when the current
 * one is too thin to say anything. Early in a campaign — or with a cache that
 * has only just started filling — last season's form is a far better prior than
 * two games of noise, so long as the report says which it used.
 *
 * @returns {{rows: Array, usedPreviousSeason: boolean}}
 */
export function buildSeasonTable(matches, options = {}) {
  const { gapDays = SEASON_GAP_DAYS, minGames = MIN_GAMES_FOR_CURRENT_SEASON } = options;
  const rows = buildTable(matches, { gapDays });
  const best = rows.reduce((max, r) => Math.max(max, r.played), 0);
  if (best >= minGames) return { rows, usedPreviousSeason: false };

  const starts = seasonStarts(matches.map((m) => m.ts), gapDays);
  if (starts.length < 2) return { rows, usedPreviousSeason: false };

  // Re-tabulate from the start of the previous season, which pulls both
  // seasons in — the combined record is what the model then reads.
  const previousStart = starts[starts.length - 2];
  const extended = buildTable(
    matches.filter((m) => m.ts >= previousStart),
    { gapDays: Infinity },
  );
  const extendedBest = extended.reduce((max, r) => Math.max(max, r.played), 0);
  if (extendedBest <= best) return { rows, usedPreviousSeason: false };
  return { rows: extended, usedPreviousSeason: true };
}

/** Build every league table from a flat list of distilled matches. */
export function buildTables(matches, options = {}) {
  const tables = new Map();
  for (const [league, leagueMatches] of groupByLeague(matches)) {
    tables.set(league, buildSeasonTable(leagueMatches, options));
  }
  return tables;
}
