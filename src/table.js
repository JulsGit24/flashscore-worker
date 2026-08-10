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
 * Given match timestamps for one league, return the cutoff after which matches
 * belong to the current season.
 */
export function findSeasonStart(timestamps, gapDays = SEASON_GAP_DAYS) {
  const sorted = [...timestamps].filter(Boolean).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  let cutoff = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] >= gapDays * DAY) cutoff = sorted[i];
  }
  return cutoff;
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

/** Build every league table from a flat list of distilled matches. */
export function buildTables(matches, options = {}) {
  const tables = new Map();
  for (const [league, rows] of groupByLeague(matches)) {
    tables.set(league, buildTable(rows, options));
  }
  return tables;
}
