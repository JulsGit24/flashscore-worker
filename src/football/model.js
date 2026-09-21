// Projection model for American football.
//
// The fourth scoring model in the repo, and the second to be normal — but not
// for the same reason twice over, and emphatically not with the same numbers.
//
// A football score is the sum of a dozen or so drive outcomes, so margin and
// total are close to normal, as in basketball. What is different is how far
// apart NFL and college football are. Measured against real finished games from
// the live feed:
//
//     NFL     n=14   19.3 pts/team, sd  9.8, mean |margin| 12.2
//     NCAA    n=77   28.3 pts/team, sd 16.0, mean |margin| 21.8
//
// College margins are nearly twice the NFL's, because the talent range across
// ~130 FBS programmes is far wider than across 32 professional franchises. One
// set of constants for "football" would be wrong for both, so each competition
// carries its own — and, better, the spreads are re-derived from cached results
// once enough have accumulated, so the constants are only a starting point.
//
// The one thing a normal model genuinely misses is key numbers: football margins
// pile up on 3 and 7 because of how scoring is denominated. That is reported
// explicitly rather than papered over — see keyNumbers() and its caveat.
//
// Deterministic and unit-tested; no network.

// The normal machinery is shared with the basketball model rather than copied.
// It is ordinary statistics, not basketball, and a second implementation would
// be a second thing to get wrong.
import { normalCdf, normalQuantile, toHalfPoint } from '../basketball/model.js';

export { normalCdf, normalQuantile, toHalfPoint };

/**
 * Per-competition constants.
 *
 * The scoring rate is measured from the cache at run time; these are the
 * fallbacks for when it is too thin, plus the quantities that a single season
 * cannot estimate well.
 */
export const COMPETITIONS = {
  nfl: {
    key: 'nfl',
    path: 'usa/nfl',
    label: 'NFL',
    fallbackPointsPerTeam: 22,
    /**
     * A season's worth of NFL margins has a standard deviation around 13.5.
     * The probe's 14-game sample implied about 15, which is well within the
     * noise of 14 games; the long-run figure is the better prior and the cache
     * overrides it once it is deep enough.
     */
    marginSd: 13.5,
    totalSd: 10,
    /**
     * Home advantage in points. The NFL's has shrunk markedly — it sat near 3
     * for decades and has run closer to 1.5-2 in recent seasons. Taking the
     * recent figure.
     */
    homeEdge: 1.8,
    /** Ties are possible in the NFL: a game still level after overtime stays tied. */
    tiesPossible: true,
    /**
     * Of the games level at the end of regulation, the fraction still level
     * after overtime. Almost all are resolved: roughly 5-6% of NFL games reach
     * overtime and roughly 0.3% end tied, so about one in twenty survives it.
     *
     * Without this the model would quote a ~3% tie on an even game — the chance
     * of a regulation tie — which is an order of magnitude too high and would
     * quietly steal that mass from both win probabilities.
     */
    overtimeTieRate: 0.06,
    priorGames: 3,
    minGamesForConfidence: 4,
  },
  ncaa: {
    key: 'ncaa',
    path: 'usa/ncaa',
    label: 'NCAA Football',
    fallbackPointsPerTeam: 28,
    /** Wide, and the probe agrees: mean |margin| 21.8 implies sd near 27. */
    marginSd: 20,
    totalSd: 14,
    /** Larger than the NFL's: college crowds and travel tell for more. */
    homeEdge: 3,
    /** College football plays overtime until somebody wins. */
    tiesPossible: false,
    overtimeTieRate: 0,
    priorGames: 3,
    minGamesForConfidence: 4,
  },
};

/** Margins that football scoring piles up on, most important first. */
export const KEY_NUMBERS = [3, 7, 10, 14, 6, 4];

/** Enough finished games before a spread measured from the cache beats the prior. */
export const MIN_GAMES_FOR_DERIVED_SD = 40;

/**
 * League scoring rate and spread.
 *
 * Both are measured from cached results where there are enough of them, and
 * fall back to the competition's constants where there are not. That matters
 * more here than in the other sports: a college season's margin spread is not
 * something a constant can track across rule changes and conference
 * realignment, and it is directly measurable.
 */
export function leagueContext(rows, games, competition) {
  const cfg = competitionOf(competition);
  const played = rows.reduce((sum, r) => sum + r.played, 0);
  const points = rows.reduce((sum, r) => sum + r.pointsFor, 0);
  const pointsPerTeamGame = played > 0 ? points / played : cfg.fallbackPointsPerTeam;

  let marginSd = cfg.marginSd;
  let totalSd = cfg.totalSd;
  let derivedFrom = 0;

  const finished = (games ?? []).filter((g) => Number.isFinite(g.hg) && Number.isFinite(g.ag));
  if (finished.length >= MIN_GAMES_FOR_DERIVED_SD) {
    marginSd = sd(finished.map((g) => g.hg - g.ag)) || cfg.marginSd;
    totalSd = sd(finished.map((g) => g.hg + g.ag)) || cfg.totalSd;
    derivedFrom = finished.length;
  }

  return {
    competition: cfg.key,
    label: cfg.label,
    size: rows.length,
    pointsPerTeamGame,
    totalPerGame: pointsPerTeamGame * 2,
    marginSd,
    totalSd,
    // 0 means the spreads are the competition's priors, not measured.
    derivedFrom,
  };
}

function sd(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function competitionOf(competition) {
  const cfg = typeof competition === 'string' ? COMPETITIONS[competition] : competition;
  if (!cfg) throw new Error(`unknown competition: ${competition}`);
  return cfg;
}

/** Shrunk offensive and defensive rates, as multipliers on the league average. */
export function teamRatings(row, ctx) {
  const cfg = competitionOf(ctx.competition);
  const k = cfg.priorGames;
  const n = row.played;
  const prior = ctx.pointsPerTeamGame;
  const scored = (row.pointsFor + k * prior) / (n + k);
  const allowed = (row.pointsAgainst + k * prior) / (n + k);
  return {
    played: n,
    rank: row.rank ?? null,
    pointsFor: scored,
    pointsAgainst: allowed,
    offence: scored / prior,
    defence: allowed / prior,
    pointDifferential: scored - allowed,
  };
}

/** A team with no results on file: every counter zero, so ratings shrink to 1.0. */
export function baselineRow(team) {
  return { team, rank: null, played: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
}

export function confidenceFor(homePlayed, awayPlayed, competition = 'nfl') {
  const cfg = competitionOf(competition);
  const games = Math.min(homePlayed ?? 0, awayPlayed ?? 0);
  if (games === 0) return 'baseline';
  if (games < 2) return 'low';
  if (games < cfg.minGamesForConfidence) return 'medium';
  return 'high';
}

/**
 * The chance the final margin lands exactly on each key number.
 *
 * Computed by discretising the normal with a half-point continuity correction,
 * which is honest arithmetic but a known understatement: real football margins
 * pile up on 3 and 7 far more than any smooth curve predicts, because scores
 * are built from 3s and 7s. Reported anyway, with that caveat printed next to
 * it, because "the model says 8%, reality says more" is far more useful than
 * silence on the one number a football bettor cares most about.
 */
export function keyNumbers(margin, marginSd, numbers = KEY_NUMBERS) {
  return numbers.map((n) => {
    const at = (m) => normalCdf(m + 0.5, margin, marginSd) - normalCdf(m - 0.5, margin, marginSd);
    // Either side wins by n.
    return { margin: n, probability: at(n) + at(-n) };
  });
}

/**
 * Project one game.
 *
 * @param {{home: string, away: string}} game
 * @param {object} homeRow standings row for the home side
 * @param {object} awayRow standings row for the away side
 * @param {object} ctx     leagueContext(rows, games, competition)
 */
export function projectGame(game, homeRow, awayRow, ctx, options = {}) {
  const cfg = competitionOf(ctx.competition);
  const H = teamRatings(homeRow, ctx);
  const A = teamRatings(awayRow, ctx);
  const base = ctx.pointsPerTeamGame;

  const homePoints = Math.max(0, base * H.offence * A.defence + cfg.homeEdge / 2);
  const awayPoints = Math.max(0, base * A.offence * H.defence - cfg.homeEdge / 2);

  const margin = homePoints - awayPoints;
  const total = homePoints + awayPoints;

  // Landing exactly on zero is a tie *at the end of regulation*, not a tie.
  // Overtime then resolves nearly all of them — in college, all of them. What
  // survives is the small residue; the rest goes back to the two sides, split
  // evenly, because overtime is close to a coin flip once it starts.
  const regulationTie =
    normalCdf(0.5, margin, ctx.marginSd) - normalCdf(-0.5, margin, ctx.marginSd);
  const homeOutright = 1 - normalCdf(0.5, margin, ctx.marginSd);
  const awayOutright = normalCdf(-0.5, margin, ctx.marginSd);

  const tie = cfg.tiesPossible ? regulationTie * (cfg.overtimeTieRate ?? 0) : 0;
  const resolvedInOvertime = regulationTie - tie;

  const homeWin = homeOutright + resolvedInOvertime / 2;
  const awayWin = awayOutright + resolvedInOvertime / 2;

  const z80 = 1.2815515655446004;
  const lines = options.totalLines ?? defaultTotalLines(total);
  const overUnder = lines.map((line) => ({
    line,
    over: 1 - normalCdf(line, total, ctx.totalSd),
  }));

  // First half. A proportional split of the game projection, not measured
  // half-by-half data — the feed carries final scores only. Second halves run
  // slightly higher in reality (clock management, tempo), so calling it an even
  // split is itself an approximation, and it is labelled as one.
  const halfScale = 0.5;

  return {
    competition: cfg.key,
    confidence: confidenceFor(H.played, A.played, cfg.key),
    points: { home: round(homePoints), away: round(awayPoints), total: round(total) },
    margin: round(margin),
    // Betting convention: the favourite is quoted with a negative number.
    spread: {
      favourite: margin >= 0 ? game.home : game.away,
      line: round(-Math.abs(margin)),
      where: margin >= 0 ? 'H' : 'A',
    },
    winProbability: { home: homeWin, away: awayWin, tie },
    // Before overtime is applied — useful for sanity-checking the model.
    regulation: { tie: regulationTie },
    total: {
      projected: round(total),
      range: [round(total - z80 * ctx.totalSd), round(total + z80 * ctx.totalSd)],
      overUnder,
    },
    firstHalf: {
      points: {
        home: round(homePoints * halfScale),
        away: round(awayPoints * halfScale),
        total: round(total * halfScale),
      },
      note: 'proportional split of the full-game projection, not measured half data',
    },
    keyNumbers: keyNumbers(margin, ctx.marginSd),
    ratings: { home: H, away: A },
    // Points scored minus allowed per game. The measurable stand-in for a roster
    // gap, since the feed carries no player data.
    strengthGap: round(Math.abs(H.pointDifferential - A.pointDifferential)),
  };
}

/** Round lines either side of the projection, the way a book would post them. */
export function defaultTotalLines(total) {
  const centre = Math.round(total / 3) * 3 + 0.5;
  return [centre - 6, centre - 3, centre, centre + 3, centre + 6].filter((l) => l > 0);
}

/**
 * The lines that clear `probability` for this game: the total to go over, the
 * total to stay under, and the spread the favourite covers.
 *
 * The inverse of the usual question — not the odds at a posted line, but the
 * line that carries these odds.
 */
export function linesAtProbability(projection, ctx, probability = 0.7) {
  const total = projection.total.projected;
  const margin = Math.abs(projection.margin);

  const solve = (mean, sdev, direction) => {
    const z = normalQuantile(direction === 'over' ? 1 - probability : probability);
    return toHalfPoint(mean + sdev * z, direction);
  };

  return {
    probability,
    totalOver: solve(total, ctx.totalSd, 'over'),
    totalUnder: solve(total, ctx.totalSd, 'under'),
    spread: {
      side: projection.spread.favourite,
      where: projection.spread.where,
      // Negative means the favourite gives points; positive means even the
      // favourite needs a head start to clear the bar at this confidence.
      line: -solve(margin, ctx.marginSd, 'over'),
    },
    moneylineCovers:
      Math.max(projection.winProbability.home, projection.winProbability.away) >= probability,
  };
}

function round(x, dp = 1) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
