// Projection model for basketball.
//
// Football scores are small counts, so the soccer side of this repo models them
// as Poisson. Basketball scores are large sums of many possessions, so the
// central limit theorem applies and margin and total are close to normal. That
// changes the arithmetic completely: win probability comes from the normal CDF
// of the projected margin rather than from summing a scoreline grid, and the
// natural outputs are a spread and a total rather than 1X2 and both-teams-to-
// score.
//
// Deterministic and unit-tested; no network.

export const MODEL = {
  /** Shrinkage weight, in virtual games at league average. */
  priorGames: 4,
  /** WNBA points per team per game, used when history is too thin to measure. */
  fallbackPointsPerTeam: 82,
  /**
   * Home-court edge in points, split evenly between the two sides. ~3 points is
   * the long-run WNBA figure; it is applied additively after the multiplicative
   * offence/defence adjustment, because home court lifts scoring margin rather
   * than scaling a team's quality.
   */
  homeEdge: 3,
  /**
   * Standard deviations of the two quantities we quote. Both are league-level
   * constants rather than fitted per team: a single game's margin and total
   * scatter far more than any team-level estimate could explain.
   */
  marginSd: 11.5,
  totalSd: 16.5,
  /** Below this many games each, a projection is damped and flagged. */
  minGamesForConfidence: 5,
};

/**
 * Abramowitz & Stegun 7.1.26 — enough precision for probabilities we round to
 * whole percents, and it keeps this module dependency-free.
 */
export function erf(x) {
  const sign = Math.sign(x);
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return sign * y;
}

/**
 * Inverse of the standard normal CDF (Acklam's rational approximation, with a
 * single Halley refinement). Needed to answer the inverse question: not "what
 * are the odds at this line" but "which line carries these odds".
 */
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // One Halley step takes the approximation to near machine precision.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** P(X <= x) for X ~ Normal(mean, sd). */
export function normalCdf(x, mean = 0, sd = 1) {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

/** League-wide scoring rate, and the spread of team quality around it. */
export function leagueContext(rows) {
  const played = rows.reduce((sum, r) => sum + r.played, 0);
  const points = rows.reduce((sum, r) => sum + r.pointsFor, 0);
  const pointsPerTeamGame = played > 0 ? points / played : MODEL.fallbackPointsPerTeam;
  return {
    size: rows.length,
    pointsPerTeamGame,
    totalPerGame: pointsPerTeamGame * 2,
  };
}

/**
 * Shrunk offensive and defensive rates for one team, as multipliers on the
 * league average. A team with no games returns exactly 1.0 on both.
 */
export function teamRatings(row, ctx) {
  const k = MODEL.priorGames;
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
    netRating: scored - allowed,
  };
}

/** A team with no results on file: every counter zero, so ratings shrink to 1.0. */
export function baselineRow(team) {
  return { team, rank: null, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
}

export function confidenceFor(homePlayed, awayPlayed) {
  const games = Math.min(homePlayed ?? 0, awayPlayed ?? 0);
  if (games === 0) return 'baseline';
  if (games < 3) return 'low';
  if (games < MODEL.minGamesForConfidence) return 'medium';
  return 'high';
}

/**
 * Project one game.
 *
 * @param {{home: string, away: string}} game
 * @param {object} homeRow standings row for the home side
 * @param {object} awayRow standings row for the away side
 * @param {object} ctx     leagueContext(rows)
 * @param {{totalLines?: number[]}} [options]
 */
export function projectGame(game, homeRow, awayRow, ctx, options = {}) {
  const H = teamRatings(homeRow, ctx);
  const A = teamRatings(awayRow, ctx);
  const base = ctx.pointsPerTeamGame;

  const homePoints = base * H.offence * A.defence + MODEL.homeEdge / 2;
  const awayPoints = base * A.offence * H.defence - MODEL.homeEdge / 2;

  const margin = homePoints - awayPoints;
  const total = homePoints + awayPoints;

  // P(home wins) = P(margin > 0). Ties are impossible in basketball, so the
  // two win probabilities sum to 1 with nothing left over.
  const homeWin = 1 - normalCdf(0, margin, MODEL.marginSd);

  // An 80% central interval on the total, so the projection carries its own
  // error bar rather than pretending to a precision it does not have.
  const z80 = 1.2815515655446004;
  const totalRange = [total - z80 * MODEL.totalSd, total + z80 * MODEL.totalSd];

  const lines = options.totalLines ?? defaultTotalLines(total);
  const overUnder = lines.map((line) => ({
    line,
    over: 1 - normalCdf(line, total, MODEL.totalSd),
  }));

  return {
    confidence: confidenceFor(H.played, A.played),
    points: { home: round(homePoints), away: round(awayPoints), total: round(total) },
    margin: round(margin),
    // Betting convention: the favourite is quoted with a negative number.
    spread: {
      favourite: margin >= 0 ? game.home : game.away,
      line: round(-Math.abs(margin)),
      where: margin >= 0 ? 'H' : 'A',
    },
    winProbability: { home: homeWin, away: 1 - homeWin },
    total: { projected: round(total), range: totalRange.map((v) => round(v)), overUnder },
    ratings: { home: H, away: A },
    // Team-strength gap in points per game. Not a roster comparison — the feed
    // carries no player data — but the measurable proxy for one: how far apart
    // the two sides are once scoring and conceding are both accounted for.
    strengthGap: round(Math.abs(H.netRating - A.netRating)),
  };
}

/**
 * The line a side clears with probability `p`.
 *
 * This is the inverse of the usual question. Rather than "what are the odds of
 * over 170.5", it answers "which total is 70% likely to be beaten" — so the
 * report can quote a number you can actually take rather than a number the
 * market happened to post.
 */
export function lineAtProbability({ mean, sd, probability, direction }) {
  // P(X > L) = p  =>  L = mean + sd * z(1 - p)
  // P(X < L) = p  =>  L = mean + sd * z(p)
  const z = normalQuantile(direction === 'over' ? 1 - probability : probability);
  return mean + sd * z;
}

/**
 * Snap to a half point, always in the direction that keeps the stated
 * probability honest. An "over" line moves down to the nearest half point at or
 * below the exact answer — a lower bar is easier to clear — and an "under" line
 * moves up. So the quoted probability is a floor, never a ceiling.
 */
export function toHalfPoint(x, direction) {
  return direction === 'over'
    ? Math.floor(x - 0.5) + 0.5
    : Math.ceil(x - 0.5) + 0.5;
}

/**
 * Lines that clear `probability` for this game: the total to go over, the total
 * to stay under, and the spread the favourite covers.
 */
export function linesAtProbability(projection, probability = 0.7) {
  const total = projection.total.projected;
  const margin = projection.margin;

  const overRaw = lineAtProbability({
    mean: total,
    sd: MODEL.totalSd,
    probability,
    direction: 'over',
  });
  const underRaw = lineAtProbability({
    mean: total,
    sd: MODEL.totalSd,
    probability,
    direction: 'under',
  });
  // The favourite covers -X when the margin exceeds X, so the same inversion
  // applies to the absolute margin.
  const coverRaw = lineAtProbability({
    mean: Math.abs(margin),
    sd: MODEL.marginSd,
    probability,
    direction: 'over',
  });

  return {
    probability,
    totalOver: toHalfPoint(overRaw, 'over'),
    totalUnder: toHalfPoint(underRaw, 'under'),
    // Negative means the favourite gives points; positive means even the
    // favourite needs a head start to clear the bar at this confidence.
    spread: {
      side: projection.spread.favourite,
      where: projection.spread.where,
      line: -toHalfPoint(coverRaw, 'over'),
    },
  };
}

/** Three round lines either side of the projection, the way a book would post them. */
export function defaultTotalLines(total) {
  const centre = Math.round(total / 5) * 5 + 0.5;
  return [centre - 5, centre, centre + 5];
}

function round(x, dp = 1) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
