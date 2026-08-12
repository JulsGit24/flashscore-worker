// Projection model for baseball.
//
// This is the third scoring model in the repo, and it is genuinely a third one.
// Basketball scores are large sums of many possessions, so margin and total are
// near-normal. Soccer goals are small counts and Poisson fits them well.
// Baseball runs are also small counts, but they are decidedly *not* Poisson:
// runs arrive in clusters, because a rally scores several at once. League-wide,
// team runs per game average about 4.5 with a variance near 9.5 — roughly twice
// the mean, where Poisson insists the two are equal.
//
// So runs are modelled as negative binomial, which is Poisson with a free
// dispersion parameter. Everything downstream is then computed *exactly* from
// the discrete distribution rather than through a normal approximation: with a
// mean this small, the difference between "P(total > 8.5)" done properly and
// done through a bell curve is worth several points of probability.
//
// Deterministic and unit-tested; no network.

export const MODEL = {
  /** Shrinkage weight, in virtual games at league average. */
  priorGames: 6,
  /** Runs per team per game, used when history is too thin to measure. */
  fallbackRunsPerTeam: 4.5,
  /**
   * Negative binomial dispersion r. Variance = mu + mu^2/r, so at mu = 4.5 this
   * gives a variance of about 9.6 — the observed major-league figure. As r goes
   * to infinity the distribution collapses back to Poisson.
   */
  dispersion: 4,
  /**
   * Home advantage in runs, split evenly between the sides. Baseball's home
   * edge is small — nothing like basketball's three points — and it has been
   * shrinking: home sides won about 53.5% of games in 2021 and closer to 52.5%
   * by 2024. Calibrated against that: a quarter of a run puts two average
   * teams at 52.6%, which is where the recent seasons sit.
   *
   * Note this is *not* corrected for the home side batting only 8.5 innings
   * when it leads. It does not need to be: the rates are measured from final
   * scores in the cache, which already carry that effect.
   */
  homeEdge: 0.25,
  /**
   * Ties are impossible — a tied game goes to extra innings. The home team
   * bats last there, which is worth a little more than a coin flip.
   */
  extraInningsHomeWin: 0.54,
  /** Below this many games each, a projection is damped and flagged. */
  minGamesForConfidence: 5,
  /**
   * Runs to carry in the distribution per team. The residual tail is
   * normalised back in, which biases the mean down slightly, so this is set
   * well past anything plausible: the negative binomial's tail is much fatter
   * than Poisson's, and truncating at 25 was already costing half a percent of
   * the mean at 7 runs. The grid is 41x41 per game — nothing worth optimising.
   */
  maxRuns: 40,
  /** Innings in a regulation game, used to scale the first-five-innings split. */
  regulationInnings: 9,
};

/**
 * Negative binomial probabilities for 0..maxK runs, built by recurrence so no
 * gamma function is needed:
 *
 *   P(0)   = (r / (r + mu))^r
 *   P(k)   = P(k-1) * (r + k - 1)/k * mu/(r + mu)
 *
 * The result is normalised, so the truncated tail is redistributed rather than
 * quietly lost.
 */
export function negBinomialPmf(mean, dispersion = MODEL.dispersion, maxK = MODEL.maxRuns) {
  const mu = Math.max(mean, 1e-9);
  const r = dispersion;
  const p = mu / (r + mu);

  const out = new Array(maxK + 1);
  out[0] = Math.pow(r / (r + mu), r);
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = out[k - 1] * ((r + k - 1) / k) * p;
  }

  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((v) => v / sum);
}

/**
 * Combine two independent run distributions into the quantities a report
 * actually quotes: who wins, the margin, and the total.
 *
 * Independence is an approximation — the same ballpark and weather push both
 * sides the same way — but it is the standard one, and the alternative needs
 * park factors the feed does not carry.
 */
export function scoreDistribution(homePmf, awayPmf) {
  const n = homePmf.length - 1;

  let homeWin = 0;
  let awayWin = 0;
  let tie = 0;

  // Margin runs from -n to +n; index by margin + n.
  const margin = new Array(2 * n + 1).fill(0);
  const total = new Array(2 * n + 1).fill(0);

  for (let h = 0; h <= n; h += 1) {
    const ph = homePmf[h];
    if (ph === 0) continue;
    for (let a = 0; a <= n; a += 1) {
      const joint = ph * awayPmf[a];
      if (joint === 0) continue;
      margin[h - a + n] += joint;
      total[h + a] += joint;
      if (h > a) homeWin += joint;
      else if (a > h) awayWin += joint;
      else tie += joint;
    }
  }

  return { homeWin, awayWin, tie, margin, total, offset: n };
}

/**
 * P(margin >= d) for the home side, where `margin` is the distribution from
 * scoreDistribution. Negative d asks the same question of the away side.
 */
export function marginAtLeast(dist, d) {
  let sum = 0;
  for (let i = d + dist.offset; i < dist.margin.length; i += 1) sum += dist.margin[i];
  return sum;
}

/** P(total > line) for a half-point line. */
export function totalOver(dist, line) {
  let sum = 0;
  for (let t = Math.ceil(line); t < dist.total.length; t += 1) sum += dist.total[t];
  return sum;
}

/** P(X > line) for a single team's runs, at a half-point line. */
export function teamOver(pmf, line) {
  let sum = 0;
  for (let k = Math.ceil(line); k < pmf.length; k += 1) sum += pmf[k];
  return sum;
}

/**
 * The half-point line a quantity clears with probability at least `p`.
 *
 * Computed by scanning the discrete distribution rather than inverting a normal
 * CDF, which is both exact and the only defensible approach at these means.
 * "Over" returns the highest line still clearing the bar — the most demanding
 * line you can take at that confidence. "Under" returns the lowest.
 *
 * Returns null when no line clears it, which happens when `p` is high and the
 * distribution is wide.
 */
export function lineAtProbability(cumulativeOver, probability, direction, maxLine) {
  if (direction === 'over') {
    let best = null;
    for (let line = 0.5; line <= maxLine; line += 1) {
      if (cumulativeOver(line) >= probability) best = line;
      else break;
    }
    return best;
  }
  for (let line = 0.5; line <= maxLine; line += 1) {
    if (1 - cumulativeOver(line) >= probability) return line;
  }
  return null;
}

/** League-wide scoring rate. */
export function leagueContext(rows) {
  const played = rows.reduce((sum, r) => sum + r.played, 0);
  const runs = rows.reduce((sum, r) => sum + r.pointsFor, 0);
  const runsPerTeamGame = played > 0 ? runs / played : MODEL.fallbackRunsPerTeam;
  return {
    size: rows.length,
    runsPerTeamGame,
    totalPerGame: runsPerTeamGame * 2,
  };
}

/**
 * Shrunk offensive and defensive rates for one team, as multipliers on the
 * league average. A team with no games returns exactly 1.0 on both.
 */
export function teamRatings(row, ctx) {
  const k = MODEL.priorGames;
  const n = row.played;
  const prior = ctx.runsPerTeamGame;
  const scored = (row.pointsFor + k * prior) / (n + k);
  const allowed = (row.pointsAgainst + k * prior) / (n + k);
  return {
    played: n,
    rank: row.rank ?? null,
    runsFor: scored,
    runsAgainst: allowed,
    offence: scored / prior,
    defence: allowed / prior,
    runDifferential: scored - allowed,
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
 * Totals to quote.
 *
 * The standard major-league ladder (6.5 to 11.5) is always included, because
 * those are the lines actually posted and a report that omits 7.5 because the
 * projection happened to land at 10.2 is not answering the question asked of
 * it. The ladder then extends to cover the projection itself when it falls
 * outside that range.
 */
export function defaultTotalLines(total) {
  const standard = [6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
  const centre = Math.round(total) + 0.5;
  const around = [centre - 1, centre, centre + 1];
  return [...new Set([...standard, ...around])].filter((l) => l > 0).sort((a, b) => a - b);
}

/**
 * Project one game.
 *
 * @param {{home: string, away: string}} game
 * @param {object} homeRow standings row for the home side
 * @param {object} awayRow standings row for the away side
 * @param {object} ctx     leagueContext(rows)
 */
export function projectGame(game, homeRow, awayRow, ctx, options = {}) {
  const H = teamRatings(homeRow, ctx);
  const A = teamRatings(awayRow, ctx);
  const base = ctx.runsPerTeamGame;

  const homeRuns = Math.max(0.1, base * H.offence * A.defence + MODEL.homeEdge / 2);
  const awayRuns = Math.max(0.1, base * A.offence * H.defence - MODEL.homeEdge / 2);

  const homePmf = negBinomialPmf(homeRuns);
  const awayPmf = negBinomialPmf(awayRuns);
  const dist = scoreDistribution(homePmf, awayPmf);

  // Extra innings resolve the tie. The home side bats last, so it takes a
  // little over half of that mass.
  const homeWin = dist.homeWin + dist.tie * MODEL.extraInningsHomeWin;
  const awayWin = dist.awayWin + dist.tie * (1 - MODEL.extraInningsHomeWin);

  const total = homeRuns + awayRuns;
  const margin = homeRuns - awayRuns;
  const homeIsFavourite = homeWin >= awayWin;

  // The run line is baseball's spread, and it is almost always 1.5: the
  // favourite must win by two.
  const runLine = {
    favourite: homeIsFavourite ? game.home : game.away,
    where: homeIsFavourite ? 'H' : 'A',
    line: -1.5,
    // "Covers" means winning by 2 or more.
    coverProbability: homeIsFavourite ? marginAtLeast(dist, 2) : 1 - marginAtLeast(dist, -1),
    // The underdog on +1.5 is the complement.
    underdogProbability: homeIsFavourite ? 1 - marginAtLeast(dist, 2) : marginAtLeast(dist, -1),
  };

  const lines = options.totalLines ?? defaultTotalLines(total);
  const overUnder = lines.map((line) => ({ line, over: totalOver(dist, line) }));

  // First five innings, a market in its own right. This is a proportional
  // split of the full-game projection, not measured inning-by-inning data —
  // the feed carries final scores only — so it is labelled as such wherever it
  // is shown.
  const f5Scale = 5 / MODEL.regulationInnings;
  const f5HomePmf = negBinomialPmf(homeRuns * f5Scale);
  const f5AwayPmf = negBinomialPmf(awayRuns * f5Scale);
  const f5Dist = scoreDistribution(f5HomePmf, f5AwayPmf);
  const f5Total = (homeRuns + awayRuns) * f5Scale;

  return {
    confidence: confidenceFor(H.played, A.played),
    runs: { home: round(homeRuns), away: round(awayRuns), total: round(total) },
    margin: round(margin),
    winProbability: { home: homeWin, away: awayWin },
    // Before extra innings are resolved — useful for sanity-checking the model.
    regulation: { home: dist.homeWin, away: dist.awayWin, tie: dist.tie },
    runLine,
    total: { projected: round(total), overUnder },
    teamTotals: {
      home: { projected: round(homeRuns), overUnder: teamTotalLadder(homePmf, homeRuns) },
      away: { projected: round(awayRuns), overUnder: teamTotalLadder(awayPmf, awayRuns) },
    },
    firstFive: {
      runs: { home: round(homeRuns * f5Scale), away: round(awayRuns * f5Scale), total: round(f5Total) },
      winProbability: {
        home: f5Dist.homeWin,
        away: f5Dist.awayWin,
        tie: f5Dist.tie,
      },
      total: { projected: round(f5Total), overUnder: [3.5, 4.5, 5.5].map((line) => ({ line, over: totalOver(f5Dist, line) })) },
      note: 'proportional split of the full-game projection, not measured inning data',
    },
    ratings: { home: H, away: A },
    // Run differential per game is baseball's net rating. The gap between the
    // two sides is the measurable stand-in for a roster mismatch — the feed
    // carries no player data, so this is a team measure, not a lineup one.
    strengthGap: round(Math.abs(H.runDifferential - A.runDifferential)),
    distribution: dist,
  };
}

function teamTotalLadder(pmf, mean) {
  const centre = Math.round(mean) + 0.5;
  return [centre - 1, centre, centre + 1]
    .filter((l) => l > 0)
    .map((line) => ({ line, over: teamOver(pmf, line) }));
}

/**
 * Lines that clear `probability` for this game: the total to go over, the total
 * to stay under, and each team's own total.
 *
 * The inverse of the usual question. Rather than "what are the odds of over
 * 8.5", it answers "which total is 70% likely to be beaten", so the report can
 * quote a number you can take rather than a number a book happened to post.
 * A null means nothing clears the bar at that confidence, which is common in
 * baseball and is reported honestly rather than rounded away.
 */
export function linesAtProbability(projection, probability = 0.7) {
  const dist = projection.distribution;
  const overFn = (line) => totalOver(dist, line);

  return {
    probability,
    totalOver: lineAtProbability(overFn, probability, 'over', MODEL.maxRuns),
    totalUnder: lineAtProbability(overFn, probability, 'under', MODEL.maxRuns),
    // Does the favourite clear the standard -1.5 at this confidence?
    runLineCovers: projection.runLine.coverProbability >= probability,
    moneylineCovers:
      Math.max(projection.winProbability.home, projection.winProbability.away) >= probability,
  };
}

function round(x, dp = 2) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
