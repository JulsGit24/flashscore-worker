// Quarter and half props.
//
// The probe found exactly one per-match detail feed that responds:
//
//   df_sui_1_<matchId>  ->  AC÷1st Quarter¬IG÷16¬IH÷6¬~AC÷2nd Quarter¬IG÷12¬IH÷18¬~…
//
// AC names the period, IG is the home score in it and IH the away score. That
// is enough to build per-team scoring shares by quarter, and from those to
// project points, winners and totals for each quarter and half.

import { fetchFeed, parseFeed } from '../flashscore.js';
import { MODEL, normalCdf } from './model.js';

export const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** An even split, used until a team has enough games to say otherwise. */
export const EVEN_SHARE = 0.25;

/**
 * Standard deviations for a single period's margin, derived rather than
 * guessed: if quarters were independent, the game margin's variance is the sum
 * of four quarter variances, so a quarter's sd is the game's over two, and a
 * half's is the game's over root two. Quarters are not quite independent — a
 * blowout changes how the fourth is played — so treat these as a floor on the
 * real uncertainty.
 */
export const QUARTER_MARGIN_SD = MODEL.marginSd / 2;
export const HALF_MARGIN_SD = MODEL.marginSd / Math.SQRT2;
export const QUARTER_TOTAL_SD = MODEL.totalSd / 2;
export const HALF_TOTAL_SD = MODEL.totalSd / Math.SQRT2;

/** Parse a df_sui feed body into per-quarter scores. */
export function parseQuarters(body) {
  const out = [];
  for (const record of parseFeed(body)) {
    const label = record.AC;
    if (!label) continue;
    const match = /^(\d)(?:st|nd|rd|th)\s+Quarter$/i.exec(label.trim());
    if (!match) continue;
    const home = Number.parseInt(record.IG, 10);
    const away = Number.parseInt(record.IH, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
    out[Number(match[1]) - 1] = { home, away };
  }
  // Only a complete regulation game is usable; overtime periods are ignored
  // because they distort a per-quarter share.
  return out.length === 4 && out.every(Boolean) ? out : null;
}

export async function fetchQuarters(matchId, options = {}) {
  return parseQuarters(await fetchFeed(`df_sui_1_${matchId}`, options));
}

/**
 * Share of a team's points scored in each quarter, and of the points it allows.
 * Shrunk toward an even split so a two-game sample cannot claim a team scores
 * 40% of its points in the third.
 */
export function quarterProfile(games, team, { priorGames = MODEL.priorGames } = {}) {
  const scored = [0, 0, 0, 0];
  const allowed = [0, 0, 0, 0];
  let played = 0;

  for (const g of games) {
    if (!g.quarters) continue;
    const isHome = g.h === team;
    if (!isHome && g.a !== team) continue;
    played += 1;
    g.quarters.forEach((q, i) => {
      scored[i] += isHome ? q.home : q.away;
      allowed[i] += isHome ? q.away : q.home;
    });
  }

  const share = (totals) => {
    const sum = totals.reduce((a, b) => a + b, 0);
    if (sum === 0) return PERIODS.map(() => EVEN_SHARE);
    // Shrinkage in share space: k virtual games sitting at an even split.
    const k = priorGames;
    return totals.map((t) => (t / sum) * (played / (played + k)) + EVEN_SHARE * (k / (played + k)));
  };

  return { played, scoring: share(scored), conceding: share(allowed) };
}

const round = (x, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp;

/**
 * Win / tie / loss for a period margin. A quarter really can be tied, and a
 * continuous distribution gives that probability zero, so a half-point
 * continuity correction carries the tie mass instead of hiding it.
 */
export function periodOutcome(margin, sd) {
  const home = 1 - normalCdf(0.5, margin, sd);
  const away = normalCdf(-0.5, margin, sd);
  return { home, tie: Math.max(0, 1 - home - away), away };
}

/**
 * Project every quarter and half from the whole-game projection plus the two
 * teams' quarter profiles.
 *
 * @param {object} projection projectGame() output
 * @param {object} homeProfile quarterProfile() for the home side
 * @param {object} awayProfile quarterProfile() for the away side
 */
export function projectPeriods(projection, homeProfile, awayProfile) {
  const homeTotal = projection.points.home;
  const awayTotal = projection.points.away;

  const quarters = PERIODS.map((name, i) => {
    // A team's share of its own scoring, tempered by how much the opponent
    // tends to concede in that quarter — the same offence-meets-defence idea
    // the whole-game model uses, applied within the period.
    const homeShare = (homeProfile.scoring[i] + awayProfile.conceding[i]) / 2;
    const awayShare = (awayProfile.scoring[i] + homeProfile.conceding[i]) / 2;
    const home = homeTotal * homeShare;
    const away = awayTotal * awayShare;
    const margin = home - away;
    return {
      period: name,
      points: { home: round(home), away: round(away), total: round(home + away) },
      margin: round(margin),
      outcome: periodOutcome(margin, QUARTER_MARGIN_SD),
    };
  });

  const half = (label, from, to) => {
    const home = quarters.slice(from, to).reduce((s, q) => s + q.points.home, 0);
    const away = quarters.slice(from, to).reduce((s, q) => s + q.points.away, 0);
    const margin = home - away;
    return {
      period: label,
      points: { home: round(home), away: round(away), total: round(home + away) },
      margin: round(margin),
      outcome: periodOutcome(margin, HALF_MARGIN_SD),
    };
  };

  return {
    quarters,
    halves: [half('H1', 0, 2), half('H2', 2, 4)],
    // Which period each side is most likely to take, for the "best quarter" call.
    bestForHome: bestPeriod(quarters, 'home'),
    bestForAway: bestPeriod(quarters, 'away'),
  };
}

function bestPeriod(quarters, side) {
  return quarters.reduce((best, q) => (q.outcome[side] > best.outcome[side] ? q : best)).period;
}
