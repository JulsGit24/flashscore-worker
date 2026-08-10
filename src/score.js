// Turns a fixture + both league tables into two 0-100 indices:
//
//   goalsIndex    — how likely the game is to be high scoring
//   mismatchIndex — how lopsided the two sides are
//
// Everything here is deterministic and unit-tested; no network, no model calls.

export const MODEL = {
  /**
   * Bayesian shrinkage weight, in "virtual games at league average". Early in a
   * season a team with 2 games played has meaningless rates, so their numbers
   * are pulled toward the league mean until real games accumulate. 4 ≈ the
   * point where a team's own form starts to outweigh the prior.
   */
  priorGames: 4,
  /** Below this, a fixture is tagged LOW_SAMPLE and its score is damped. */
  minPlayedForConfidence: 5,
  /** Share of league goals scored by the home side. Long-run European average. */
  homeGoalShare: 0.55,
  /** Goals-per-game mapped onto 0-100: this range covers dull -> shootout. */
  goalsFloor: 2.1,
  goalsCeiling: 4.2,
  /** Expected-goal gap mapped onto 0-100 for the "one-sided" component. */
  edgeFloor: 0.35,
  edgeCeiling: 2.0,
  /** Weights inside mismatchIndex. */
  mismatchWeights: { rank: 0.4, ppg: 0.35, edge: 0.25 },
  /** How much the weaker of the two indices contributes to the final ranking. */
  secondaryWeight: 0.25,
  /** Damping applied to both indices when either side is below the sample floor. */
  lowSampleDamping: 0.85,
};

/**
 * How much of a fixture's numbers come from the two teams' own results rather
 * than from the league prior. Every fixture gets a projection — with no results
 * at all, shrinkage returns exactly the league average, which is a real if
 * uninformative answer — so this says how much weight to put on it.
 */
export const CONFIDENCE = {
  /** Neither side has a result on file: the numbers are the league baseline. */
  baseline: 'baseline',
  /** 1-2 games: mostly prior. */
  low: 'low',
  /** 3-4 games: the sides are starting to separate from the prior. */
  medium: 'medium',
  /** 5+ games each: the model is reading form, not the prior. */
  high: 'high',
};

export function confidenceFor(homePlayed, awayPlayed) {
  const games = Math.min(homePlayed ?? 0, awayPlayed ?? 0);
  if (games === 0) return CONFIDENCE.baseline;
  if (games < 3) return CONFIDENCE.low;
  if (games < MODEL.minPlayedForConfidence) return CONFIDENCE.medium;
  return CONFIDENCE.high;
}

/**
 * A stand-in row for a team with no results on file. Every counter is zero, so
 * teamRates() shrinks it all the way to the league average — which is exactly
 * what "we know nothing about this side" should mean.
 */
export function baselineRow(team) {
  return {
    team,
    rank: null,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const scale = (x, lo, hi) => clamp01((x - lo) / (hi - lo));

/** League-wide rates used as the prior and as the baseline for strengths. */
export function leagueContext(table) {
  const played = table.reduce((sum, r) => sum + r.played, 0);
  const goals = table.reduce((sum, r) => sum + r.goalsFor, 0);
  // Each match contributes 2 to the sum of `played`, so goals-per-match is
  // goals / (played / 2). Guard against an empty or brand-new table.
  const matches = played / 2;
  const goalsPerMatch = matches > 0 ? goals / matches : 2.7;
  const goalsPerTeamGame = goalsPerMatch / 2;
  const ppgs = table.filter((r) => r.played > 0).map((r) => r.points / r.played);
  return {
    size: table.length,
    goalsPerMatch,
    goalsPerTeamGame,
    maxPpg: ppgs.length ? Math.max(...ppgs) : 3,
    minPpg: ppgs.length ? Math.min(...ppgs) : 0,
  };
}

/** Shrunk per-game rates for one team. */
export function teamRates(row, ctx) {
  const k = MODEL.priorGames;
  const n = row.played;
  const prior = ctx.goalsPerTeamGame;
  return {
    played: n,
    rank: row.rank,
    ppg: (row.points + k * 1.35) / (n + k), // 1.35 pts/game ≈ a mid-table side
    gfpg: (row.goalsFor + k * prior) / (n + k),
    gapg: (row.goalsAgainst + k * prior) / (n + k),
    attack: (row.goalsFor + k * prior) / (n + k) / prior,
    leak: (row.goalsAgainst + k * prior) / (n + k) / prior,
  };
}

/**
 * Score one fixture.
 *
 * @param {{home: string, away: string}} fixture
 * @param {object} homeRow standings row for the home side
 * @param {object} awayRow standings row for the away side
 * @param {object} ctx     leagueContext(table)
 */
export function scoreFixture(fixture, homeRow, awayRow, ctx) {
  const H = teamRates(homeRow, ctx);
  const A = teamRates(awayRow, ctx);

  const homeBase = ctx.goalsPerMatch * MODEL.homeGoalShare;
  const awayBase = ctx.goalsPerMatch * (1 - MODEL.homeGoalShare);
  const homeExp = homeBase * H.attack * A.leak;
  const awayExp = awayBase * A.attack * H.leak;
  const totalExp = homeExp + awayExp;
  const edge = Math.abs(homeExp - awayExp);

  // --- goals ---------------------------------------------------------------
  let goalsIndex = 100 * scale(totalExp, MODEL.goalsFloor, MODEL.goalsCeiling);

  // --- mismatch ------------------------------------------------------------
  // Clamped: a standings feed can return a partial table, so a rank can exceed
  // the number of rows we were given and blow the ratio past 1.
  const rankGap =
    H.rank && A.rank && ctx.size > 1
      ? clamp01(Math.abs(H.rank - A.rank) / (ctx.size - 1))
      : 0;
  const ppgSpread = Math.max(0.25, ctx.maxPpg - ctx.minPpg);
  const ppgGap = clamp01(Math.abs(H.ppg - A.ppg) / ppgSpread);
  const edgeNorm = scale(edge, MODEL.edgeFloor, MODEL.edgeCeiling);
  const w = MODEL.mismatchWeights;
  let mismatchIndex = 100 * (w.rank * rankGap + w.ppg * ppgGap + w.edge * edgeNorm);

  // --- confidence ----------------------------------------------------------
  const lowSample =
    H.played < MODEL.minPlayedForConfidence || A.played < MODEL.minPlayedForConfidence;
  if (lowSample) {
    goalsIndex *= MODEL.lowSampleDamping;
    mismatchIndex *= MODEL.lowSampleDamping;
  }

  const hi = Math.max(goalsIndex, mismatchIndex);
  const lo = Math.min(goalsIndex, mismatchIndex);
  const rankScore = hi + MODEL.secondaryWeight * lo;

  const favourite =
    homeExp === awayExp ? null : homeExp > awayExp ? fixture.home : fixture.away;

  return {
    confidence: confidenceFor(H.played, A.played),
    goalsIndex: round(goalsIndex),
    mismatchIndex: round(mismatchIndex),
    rankScore: round(rankScore),
    projected: { home: round(homeExp, 2), away: round(awayExp, 2), total: round(totalExp, 2) },
    favourite,
    lowSample,
    tags: buildTags({ goalsIndex, mismatchIndex, H, A, ctx, rankGap, lowSample }),
    detail: { home: H, away: A, rankGap: round(rankGap, 3), ppgGap: round(ppgGap, 3) },
  };
}

function buildTags({ goalsIndex, mismatchIndex, H, A, ctx, rankGap, lowSample }) {
  const tags = [];
  if (goalsIndex >= 60) tags.push('HIGH_GOALS');
  if (mismatchIndex >= 55) tags.push('MISMATCH');

  const bestAttack = Math.max(H.attack, A.attack);
  const worstDefence = H.attack >= A.attack ? A.leak : H.leak;
  if (bestAttack >= 1.25 && worstDefence >= 1.25) tags.push('ATK_VS_LEAKY');

  const top = Math.ceil(ctx.size * 0.25);
  const bottom = ctx.size - top + 1;
  if (H.rank && A.rank) {
    const hiRank = Math.min(H.rank, A.rank);
    const loRank = Math.max(H.rank, A.rank);
    if (hiRank <= top && loRank >= bottom) tags.push('TOP_VS_BOTTOM');
  }
  if (rankGap >= 0.6) tags.push('WIDE_TABLE_GAP');
  if (lowSample) tags.push('LOW_SAMPLE');
  return tags;
}

function round(x, dp = 1) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** Sort scored fixtures best-first and keep at least `min`. */
export function rankFixtures(scored, { min = 30, threshold = 45 } = {}) {
  const sorted = [...scored].sort((a, b) => b.score.rankScore - a.score.rankScore);
  const overThreshold = sorted.filter((f) => f.score.rankScore >= threshold);
  return overThreshold.length >= min ? overThreshold : sorted.slice(0, min);
}
