import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MODEL,
  baselineRow,
  confidenceFor,
  defaultTotalLines,
  leagueContext,
  lineAtProbability,
  linesAtProbability,
  marginAtLeast,
  negBinomialPmf,
  projectGame,
  scoreDistribution,
  teamOver,
  teamRatings,
  totalOver,
} from '../src/baseball/model.js';
import { buildMlbReport, distilMlbDay, MLB_PATH } from '../src/mlb.js';
import { renderJson, renderMarkdown } from '../src/baseball/report.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- the run distribution ----------------------------------------------------

test('the negative binomial is a probability distribution', () => {
  for (const mean of [0.5, 2, 4.5, 9]) {
    const pmf = negBinomialPmf(mean);
    assert.ok(close(sum(pmf), 1, 1e-12), `mean ${mean} sums to ${sum(pmf)}`);
    assert.ok(pmf.every((p) => p >= 0), 'no negative probabilities');
  }
});

test('its mean is the mean it was asked for', () => {
  for (const mean of [1, 4.5, 7]) {
    const pmf = negBinomialPmf(mean);
    const got = pmf.reduce((acc, p, k) => acc + p * k, 0);
    // Truncation at maxRuns pulls the mean down a hair at the top end.
    assert.ok(Math.abs(got - mean) < 0.02, `asked ${mean}, got ${got}`);
  }
});

test('it is overdispersed relative to Poisson, which is the whole point', () => {
  const mean = 4.5;
  const pmf = negBinomialPmf(mean);
  const m1 = pmf.reduce((acc, p, k) => acc + p * k, 0);
  const m2 = pmf.reduce((acc, p, k) => acc + p * k * k, 0);
  const variance = m2 - m1 * m1;

  // Poisson would put the variance at the mean. Negative binomial with r = 4
  // puts it at mu + mu^2/r — about twice that, matching real baseball.
  const expected = mean + (mean * mean) / MODEL.dispersion;
  assert.ok(Math.abs(variance - expected) < 0.2, `variance ${variance}, expected ~${expected}`);
  assert.ok(variance > mean * 1.8, 'must be clearly wider than Poisson');
});

test('a huge dispersion collapses it back to Poisson', () => {
  const mean = 4;
  const pmf = negBinomialPmf(mean, 1e7);
  const m1 = pmf.reduce((acc, p, k) => acc + p * k, 0);
  const m2 = pmf.reduce((acc, p, k) => acc + p * k * k, 0);
  const variance = m2 - m1 * m1;
  assert.ok(Math.abs(variance - mean) < 0.05, `variance ${variance} should approach the mean`);
});

// --- combining two teams -----------------------------------------------------

test('win, loss and tie probabilities account for all the mass', () => {
  const dist = scoreDistribution(negBinomialPmf(4.6), negBinomialPmf(4.2));
  assert.ok(close(dist.homeWin + dist.awayWin + dist.tie, 1, 1e-9));
  assert.ok(close(sum(dist.margin), 1, 1e-9), 'margin distribution sums to 1');
  assert.ok(close(sum(dist.total), 1, 1e-9), 'total distribution sums to 1');
});

test('the better offence is the more likely winner', () => {
  const dist = scoreDistribution(negBinomialPmf(6), negBinomialPmf(3));
  assert.ok(dist.homeWin > dist.awayWin);
});

test('two identical sides are a coin flip before extra innings', () => {
  const dist = scoreDistribution(negBinomialPmf(4.5), negBinomialPmf(4.5));
  assert.ok(close(dist.homeWin, dist.awayWin, 1e-12));
});

test('ties are common enough to matter — they are not a rounding error', () => {
  const dist = scoreDistribution(negBinomialPmf(4.5), negBinomialPmf(4.5));
  // Regulation ties run around 10%; folding them into a winner silently would
  // move every win probability in the report.
  assert.ok(dist.tie > 0.08 && dist.tie < 0.16, `tie mass ${dist.tie}`);
});

test('marginAtLeast and totalOver agree with the raw distribution', () => {
  const dist = scoreDistribution(negBinomialPmf(5), negBinomialPmf(4));
  assert.ok(close(marginAtLeast(dist, -dist.offset), 1, 1e-9), 'everything is >= the minimum');
  assert.ok(close(marginAtLeast(dist, 1), dist.homeWin, 1e-9), 'winning is a margin of 1+');

  // P(total > 8.5) must equal 1 - P(total <= 8).
  let atMost8 = 0;
  for (let t = 0; t <= 8; t += 1) atMost8 += dist.total[t];
  assert.ok(close(totalOver(dist, 8.5), 1 - atMost8, 1e-9));
});

test('a whole-number line and the half point below it ask the same question', () => {
  const dist = scoreDistribution(negBinomialPmf(4.5), negBinomialPmf(4.5));
  // Over 8.5 and "9 or more" are the same event; the half point only removes
  // the push.
  assert.ok(close(totalOver(dist, 8.5), totalOver(dist, 8.0001), 1e-12));
});

// --- inverting the question --------------------------------------------------

test('lineAtProbability returns the most demanding line that still clears the bar', () => {
  const dist = scoreDistribution(negBinomialPmf(4.5), negBinomialPmf(4.5));
  const overFn = (l) => totalOver(dist, l);

  const over = lineAtProbability(overFn, 0.7, 'over', MODEL.maxRuns);
  assert.ok(over !== null);
  assert.ok(overFn(over) >= 0.7, 'the quoted line actually clears 70%');
  assert.ok(overFn(over + 1) < 0.7, 'and the next line up does not');

  const under = lineAtProbability(overFn, 0.7, 'under', MODEL.maxRuns);
  assert.ok(1 - overFn(under) >= 0.7, 'the under line clears 70% too');
  assert.ok(1 - overFn(under - 1) < 0.7, 'and the next line down does not');
});

test('an impossible confidence bar returns null rather than a fake line', () => {
  const dist = scoreDistribution(negBinomialPmf(4.5), negBinomialPmf(4.5));
  const overFn = (l) => totalOver(dist, l);
  // Nothing is 99.9% likely to go over *and* be worth quoting; the over scan
  // starts at 0.5 and stops the moment it fails.
  assert.equal(lineAtProbability(overFn, 0.9999, 'over', MODEL.maxRuns), null);
});

// --- ratings and projection --------------------------------------------------

test('a team with no games sits exactly at league average', () => {
  const ctx = leagueContext([{ played: 10, pointsFor: 45, pointsAgainst: 40 }]);
  const r = teamRatings(baselineRow('Nobody'), ctx);
  assert.ok(close(r.offence, 1, 1e-12));
  assert.ok(close(r.defence, 1, 1e-12));
  assert.equal(r.played, 0);
});

test('leagueContext falls back to a sane rate with no history at all', () => {
  const ctx = leagueContext([]);
  assert.equal(ctx.runsPerTeamGame, MODEL.fallbackRunsPerTeam);
});

test('confidence tiers follow the thinner side', () => {
  assert.equal(confidenceFor(0, 40), 'baseline');
  assert.equal(confidenceFor(2, 40), 'low');
  assert.equal(confidenceFor(4, 40), 'medium');
  assert.equal(confidenceFor(40, 40), 'high');
});

const ctxRows = [
  { team: 'Sluggers', played: 20, pointsFor: 120, pointsAgainst: 70, rank: 1 },
  { team: 'Cellar', played: 20, pointsFor: 60, pointsAgainst: 130, rank: 2 },
];

test('a projection is internally consistent', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);

  assert.ok(close(p.winProbability.home + p.winProbability.away, 1, 1e-9), 'no ties left over');
  assert.ok(close(p.runs.home + p.runs.away, p.total.projected, 0.01));
  assert.ok(p.winProbability.home > p.winProbability.away, 'the far better side is favoured');
  assert.equal(p.runLine.favourite, 'Sluggers');
  assert.equal(p.runLine.line, -1.5);
  assert.ok(close(p.runLine.coverProbability + p.runLine.underdogProbability, 1, 1e-9));
  assert.ok(p.runLine.coverProbability < p.winProbability.home, 'winning by 2 is harder than winning');
});

test('home advantage exists but is small, as it is in baseball', () => {
  const ctx = leagueContext(ctxRows);
  const even = { team: 'Even', played: 20, pointsFor: 90, pointsAgainst: 90, rank: 1 };
  const p = projectGame({ home: 'A', away: 'B' }, even, { ...even, team: 'B' }, ctx);

  // Calibrated to recent seasons: two average sides put the home team a shade
  // under 53%, nothing like basketball's home court.
  assert.ok(p.winProbability.home > 0.51, 'the home side is favoured');
  assert.ok(p.winProbability.home < 0.545, `home win ${p.winProbability.home} is too large for baseball`);
});

test('extra innings, not regulation, is where the tie mass goes', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);
  const reg = p.regulation;
  assert.ok(reg.tie > 0, 'regulation ties exist');
  assert.ok(close(reg.home + reg.away + reg.tie, 1, 1e-9));
  // The home side takes 54% of the tie mass, so its final number is higher.
  assert.ok(close(p.winProbability.home, reg.home + reg.tie * MODEL.extraInningsHomeWin, 1e-9));
});

test('the first-five split is smaller than the game and flagged as derived', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);
  assert.ok(p.firstFive.total.projected < p.total.projected);
  assert.ok(close(p.firstFive.total.projected, (p.total.projected * 5) / 9, 0.02));
  assert.match(p.firstFive.note, /not measured inning data/);
  // A five-inning game can genuinely be tied, so the tie is not redistributed.
  assert.ok(p.firstFive.winProbability.tie > 0);
});

test('team totals and the game total describe the same projection', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);
  assert.ok(close(p.teamTotals.home.projected, p.runs.home, 0.01));
  assert.ok(close(p.teamTotals.away.projected, p.runs.away, 0.01));
});

test('over probabilities fall as the line rises', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);
  const ou = p.total.overUnder;
  for (let i = 1; i < ou.length; i += 1) {
    assert.ok(ou[i].line > ou[i - 1].line, 'lines ascend');
    assert.ok(ou[i].over <= ou[i - 1].over, 'and the chance of clearing them falls');
  }
});

test('defaultTotalLines are half points around the projection', () => {
  for (const l of defaultTotalLines(8.3)) {
    assert.ok(l > 0);
    assert.ok(close(l % 1, 0.5, 1e-12), `${l} is not a half point`);
  }
});

test('teamOver matches the distribution it came from', () => {
  const pmf = negBinomialPmf(4.5);
  let atMost4 = 0;
  for (let k = 0; k <= 4; k += 1) atMost4 += pmf[k];
  assert.ok(close(teamOver(pmf, 4.5), 1 - atMost4, 1e-12));
});

test('linesAtProbability reports honestly when nothing clears the bar', () => {
  const ctx = leagueContext(ctxRows);
  const p = projectGame({ home: 'Sluggers', away: 'Cellar' }, ctxRows[0], ctxRows[1], ctx);
  const l = linesAtProbability(p, 0.999);
  assert.equal(l.moneylineCovers, false);
  assert.equal(l.runLineCovers, false);
  assert.equal(l.totalOver, null);
});

// --- the pipeline ------------------------------------------------------------

const FIXTURE_TS = 1_700_000_000;

function mlbFixture(home, away, hour, homeScore = null, awayScore = null) {
  return {
    id: `${home}${away}${hour}`,
    tournament: { url: '/baseball/usa/mlb/', name: 'USA: MLB' },
    home,
    away,
    homeScore,
    awayScore,
    kickoff: new Date((FIXTURE_TS + hour * 3600) * 1000),
  };
}

test('distilMlbDay keeps finished MLB games and nothing else', () => {
  const kept = distilMlbDay([
    mlbFixture('Yankees', 'Red Sox', 1, 5, 3),
    mlbFixture('Dodgers', 'Giants', 2), // not finished
    {
      ...mlbFixture('Hanshin', 'Yomiuri', 3, 4, 2),
      tournament: { url: '/baseball/japan/npb/', name: 'JAPAN: NPB' },
    },
  ]);

  assert.equal(kept.length, 1);
  assert.equal(kept[0].h, 'Yankees');
  assert.equal(kept[0].hg, 5);
  assert.equal(kept[0].l, MLB_PATH);
});

const HISTORY = [
  { l: MLB_PATH, h: 'Yankees', a: 'Red Sox', hg: 7, ag: 2, ts: FIXTURE_TS - 86400 * 2 },
  { l: MLB_PATH, h: 'Yankees', a: 'Red Sox', hg: 6, ag: 1, ts: FIXTURE_TS - 86400 * 3 },
  { l: MLB_PATH, h: 'Red Sox', a: 'Yankees', hg: 3, ag: 8, ts: FIXTURE_TS - 86400 * 4 },
  { l: MLB_PATH, h: 'Dodgers', a: 'Giants', hg: 4, ag: 3, ts: FIXTURE_TS - 86400 * 2 },
  { l: MLB_PATH, h: 'Giants', a: 'Dodgers', hg: 2, ag: 5, ts: FIXTURE_TS - 86400 * 3 },
];

const deps = {
  fetchDayFixtures: async () => [
    mlbFixture('Dodgers', 'Giants', 22),
    mlbFixture('Yankees', 'Red Sox', 19),
    {
      ...mlbFixture('Hanshin', 'Yomiuri', 6),
      tournament: { url: '/baseball/japan/npb/', name: 'JAPAN: NPB' },
    },
  ],
  updateHistory: async () => ({
    matches: HISTORY,
    daysCached: 7,
    daysFetched: 0,
    daysFailed: 0,
  }),
};

const ARGS = {
  dayOffset: 0,
  tz: 'America/New_York',
  cache: 'unused',
  retain: 400,
  coverProbability: 0.7,
};

test('the report covers MLB only, earliest first', async () => {
  const data = await buildMlbReport(ARGS, deps);
  assert.deepEqual(
    data.games.map((g) => g.home),
    ['Yankees', 'Dodgers'],
    'sorted by first pitch, and no NPB game',
  );
  assert.equal(data.stats.totalGames, 3, 'the worldwide count still sees every game');
});

test('form and head-to-head come through from the cache', async () => {
  const data = await buildMlbReport(ARGS, deps);
  const game = data.games.find((g) => g.home === 'Yankees');

  assert.equal(game.form.home.streak, 'WWW', 'the Yankees swept the cached meetings');
  assert.equal(game.form.away.streak, 'LLL');
  assert.equal(game.h2hSummary.played, 3);
  assert.equal(game.h2hSummary.aWins, 3);
});

test('a dominant side is favoured, and the numbers stay in range', async () => {
  const data = await buildMlbReport(ARGS, deps);
  for (const g of data.games) {
    const p = g.projection;
    for (const v of [p.winProbability.home, p.winProbability.away, p.runLine.coverProbability]) {
      assert.ok(v >= 0 && v <= 1, `probability ${v} out of range`);
    }
    assert.ok(p.runs.home > 0 && p.runs.away > 0);
  }
  const yankees = data.games.find((g) => g.home === 'Yankees');
  assert.ok(yankees.projection.winProbability.home > 0.5);
});

test('markdown renders, names the sections, and states its limits', async () => {
  const data = await buildMlbReport(ARGS, deps);
  const md = renderMarkdown(data);

  assert.match(md, /^# MLB slate — \d{4}-\d{2}-\d{2}/);
  assert.match(md, /## Strong favourites/);
  assert.match(md, /## Most runs expected/);
  assert.match(md, /## Slate/);
  assert.match(md, /## Team totals/);
  assert.match(md, /## First five innings/);
  assert.match(md, /## Biggest strength gaps/);
  // The starting pitcher is the biggest single factor in a baseball game and
  // this model does not have it. The report must say so.
  assert.match(md, /starting pitcher/i);
  assert.ok(!md.includes('Hanshin'), 'no NPB game leaked into the MLB report');
});

test('an empty slate renders without throwing', async () => {
  const data = await buildMlbReport(ARGS, {
    ...deps,
    fetchDayFixtures: async () => [],
  });
  const md = renderMarkdown(data);
  assert.match(md, /_No MLB games scheduled today\._/);
});

test('the JSON drops the run distribution but keeps the projection', async () => {
  const data = await buildMlbReport(ARGS, deps);
  const json = JSON.parse(renderJson(data));

  assert.equal(json.sport, 'baseball');
  assert.equal(json.competition, 'MLB');
  assert.equal(json.games.length, 2);
  assert.equal(json.games[0].projection.distribution, undefined, 'the raw grid is not shipped');
  assert.ok(json.games[0].projection.winProbability.home > 0);
  assert.ok(json.notCovered.startingPitchers);
});
