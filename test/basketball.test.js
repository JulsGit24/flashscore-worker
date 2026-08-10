import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MODEL,
  baselineRow,
  confidenceFor,
  defaultTotalLines,
  leagueContext,
  normalCdf,
  projectGame,
  teamRatings,
} from '../src/basketball/model.js';
import {
  buildStandings,
  headToHead,
  headToHeadSummary,
  recentForm,
} from '../src/basketball/standings.js';
import { buildWnbaReport, distilWnbaDay } from '../src/wnba.js';
import { renderJson, renderMarkdown } from '../src/basketball/report.js';

const DAY = 86400;
const d = (n) => 1_750_000_000 + n * DAY;
const g = (h, a, hg, ag, ts) => ({ l: 'usa/wnba', h, a, hg, ag, ts });

const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// --- maths -------------------------------------------------------------------

test('normalCdf matches known values', () => {
  assert.ok(close(normalCdf(0), 0.5));
  assert.ok(close(normalCdf(1.6448536), 0.95, 1e-4), 'the 95th percentile');
  assert.ok(close(normalCdf(-1.6448536), 0.05, 1e-4));
  // Scaled and shifted.
  assert.ok(close(normalCdf(110, 100, 10), normalCdf(1)));
});

test('normalCdf degenerates sensibly at zero spread', () => {
  assert.equal(normalCdf(5, 4, 0), 1);
  assert.equal(normalCdf(3, 4, 0), 0);
});

test('defaultTotalLines brackets the projection on round numbers', () => {
  const lines = defaultTotalLines(163.2);
  assert.equal(lines.length, 3);
  assert.ok(lines[0] < 163.2 && lines[2] > 163.2, 'the projection sits inside the bracket');
  for (const l of lines) assert.ok(String(l).endsWith('.5'), `${l} should be a half-point line`);
});

// --- ratings -----------------------------------------------------------------

const LEAGUE = [
  { team: 'Elite', rank: 1, played: 20, wins: 16, losses: 4, pointsFor: 1800, pointsAgainst: 1560 },
  { team: 'Mid', rank: 4, played: 20, wins: 10, losses: 10, pointsFor: 1640, pointsAgainst: 1640 },
  { team: 'Weak', rank: 8, played: 20, wins: 4, losses: 16, pointsFor: 1520, pointsAgainst: 1780 },
];

test('leagueContext measures scoring per team game', () => {
  const ctx = leagueContext(LEAGUE);
  const points = LEAGUE.reduce((s, r) => s + r.pointsFor, 0);
  const played = LEAGUE.reduce((s, r) => s + r.played, 0);
  assert.ok(close(ctx.pointsPerTeamGame, points / played));
  assert.ok(close(ctx.totalPerGame, (points / played) * 2));
});

test('a team with no games rates exactly at the league average', () => {
  const ctx = leagueContext(LEAGUE);
  const r = teamRatings(baselineRow('Unknown'), ctx);
  assert.ok(close(r.offence, 1), `offence ${r.offence}`);
  assert.ok(close(r.defence, 1), `defence ${r.defence}`);
  assert.equal(r.played, 0);
});

test('shrinkage pulls a small sample toward the league average', () => {
  const ctx = leagueContext(LEAGUE);
  const hot = { team: 'Hot', played: 2, wins: 2, losses: 0, pointsFor: 220, pointsAgainst: 140 };
  const raw = 220 / 2;
  const shrunk = teamRatings(hot, ctx).pointsFor;
  assert.ok(shrunk < raw, 'a 110-point average should not survive two games intact');
  assert.ok(shrunk > ctx.pointsPerTeamGame, 'but it should stay above average');
});

test('confidenceFor tiers on the weaker of the two samples', () => {
  assert.equal(confidenceFor(0, 20), 'baseline');
  assert.equal(confidenceFor(2, 20), 'low');
  assert.equal(confidenceFor(4, 20), 'medium');
  assert.equal(confidenceFor(9, 12), 'high');
});

// --- projection --------------------------------------------------------------

test('two identical teams differ only by home court', () => {
  const ctx = leagueContext(LEAGUE);
  const p = projectGame({ home: 'Mid', away: 'Mid2' }, LEAGUE[1], { ...LEAGUE[1], team: 'Mid2' }, ctx);

  assert.ok(close(p.margin, MODEL.homeEdge), `margin should be the home edge, got ${p.margin}`);
  assert.ok(p.winProbability.home > 0.5 && p.winProbability.home < 0.62);
  assert.ok(close(p.winProbability.home + p.winProbability.away, 1, 1e-9));
  assert.equal(p.spread.where, 'H');
});

test('the stronger side is favoured and the spread is quoted negative on them', () => {
  const ctx = leagueContext(LEAGUE);
  const p = projectGame({ home: 'Elite', away: 'Weak' }, LEAGUE[0], LEAGUE[2], ctx);

  assert.ok(p.margin > 10, `expected a clear favourite, got ${p.margin}`);
  assert.equal(p.spread.favourite, 'Elite');
  assert.ok(p.spread.line < 0, 'the favourite is quoted with a negative number');
  assert.ok(close(Math.abs(p.spread.line), Math.abs(p.margin), 0.11));
  assert.ok(p.winProbability.home > 0.8);
});

test('an away favourite is quoted on the away side', () => {
  const ctx = leagueContext(LEAGUE);
  const p = projectGame({ home: 'Weak', away: 'Elite' }, LEAGUE[2], LEAGUE[0], ctx);
  assert.ok(p.margin < 0, 'the home side should be the underdog here');
  assert.equal(p.spread.favourite, 'Elite');
  assert.equal(p.spread.where, 'A');
  assert.ok(p.winProbability.away > 0.7);
});

test('the projected total sits inside its own 80% range, and over lines fall with the line', () => {
  const ctx = leagueContext(LEAGUE);
  const p = projectGame({ home: 'Elite', away: 'Mid' }, LEAGUE[0], LEAGUE[1], ctx);

  const [lo, hi] = p.total.range;
  assert.ok(lo < p.total.projected && p.total.projected < hi);
  assert.ok(hi - lo > 30, 'a single game total is genuinely uncertain');

  const overs = p.total.overUnder.map((ou) => ou.over);
  assert.ok(overs[0] > overs[1] && overs[1] > overs[2], 'higher lines must be less likely');
  for (const o of overs) assert.ok(o >= 0 && o <= 1);
});

test('two unknown teams project to the league baseline', () => {
  const ctx = leagueContext(LEAGUE);
  const p = projectGame(
    { home: 'A', away: 'B' },
    baselineRow('A'),
    baselineRow('B'),
    ctx,
  );
  assert.equal(p.confidence, 'baseline');
  assert.ok(close(p.margin, MODEL.homeEdge), 'only home court separates them');
  assert.ok(close(p.total.projected, ctx.totalPerGame, 0.11));
});

// --- standings, form, head to head ------------------------------------------

const SEASON = [
  g('Aces', 'Liberty', 90, 84, d(1)),
  g('Liberty', 'Aces', 78, 80, d(5)),
  g('Aces', 'Sky', 100, 70, d(9)),
  g('Sky', 'Liberty', 66, 88, d(12)),
  g('Liberty', 'Sky', 95, 71, d(15)),
  g('Sky', 'Aces', 60, 92, d(18)),
];

test('buildStandings counts wins, losses and points both ways', () => {
  const rows = buildStandings(SEASON);
  const aces = rows.find((r) => r.team === 'Aces');
  assert.deepEqual(
    { played: aces.played, wins: aces.wins, losses: aces.losses },
    { played: 4, wins: 4, losses: 0 },
  );
  assert.equal(aces.pointsFor, 90 + 80 + 100 + 92);
  assert.equal(aces.pointsAgainst, 84 + 78 + 70 + 60);
  assert.equal(aces.rank, 1);
  assert.equal(rows.find((r) => r.team === 'Sky').rank, 3);
});

test('buildStandings drops the previous season', () => {
  const rows = buildStandings([
    g('Aces', 'Sky', 120, 60, d(0)),
    // Off-season gap, then one game of the new season.
    g('Aces', 'Sky', 70, 80, d(200)),
  ]);
  const aces = rows.find((r) => r.team === 'Aces');
  assert.equal(aces.played, 1);
  assert.equal(aces.pointsFor, 70);
});

test('recentForm reads results most recent first with scoring averages', () => {
  const form = recentForm(SEASON, 'Liberty');
  assert.equal(form.streak, 'WWLL', 'four games, newest first: two wins then two losses');
  assert.equal(form.played, 4);
  assert.equal(form.pointsFor, 95 + 88 + 78 + 84);
  assert.ok(close(form.winRate, 0.5));
  assert.ok(close(form.pointsForAvg, (95 + 88 + 78 + 84) / 4));
});

test('recentForm honours the window and handles an unknown team', () => {
  assert.equal(recentForm(SEASON, 'Liberty', 2).streak, 'WW');
  const none = recentForm(SEASON, 'Nobody');
  assert.equal(none.played, 0);
  assert.equal(none.winRate, null);
});

test('headToHead finds meetings in both directions, most recent first', () => {
  const meetings = headToHead(SEASON, 'Aces', 'Liberty');
  assert.equal(meetings.length, 2);
  assert.ok(meetings[0].ts > meetings[1].ts);
  assert.deepEqual(meetings.map((m) => m.winner), ['Aces', 'Aces']);
  assert.deepEqual(meetings.map((m) => m.total), [158, 174]);
});

test('headToHeadSummary counts from the named team perspective', () => {
  const meetings = headToHead(SEASON, 'Aces', 'Liberty');
  const s = headToHeadSummary(meetings, 'Aces');
  assert.deepEqual({ played: s.played, aWins: s.aWins, bWins: s.bWins }, { played: 2, aWins: 2, bWins: 0 });
  assert.ok(close(s.averageTotal, (158 + 174) / 2));

  assert.deepEqual(headToHeadSummary([], 'Aces'), {
    played: 0,
    aWins: 0,
    bWins: 0,
    averageTotal: null,
  });
});

// --- pipeline ----------------------------------------------------------------

test('distilWnbaDay keeps finished WNBA games and nothing else', () => {
  const mk = (url, home, away, hg, ag) => ({
    tournament: { url, name: url },
    home,
    away,
    homeScore: hg,
    awayScore: ag,
    kickoff: new Date(d(0) * 1000),
  });

  const kept = distilWnbaDay([
    mk('/basketball/usa/wnba/', 'Aces', 'Liberty', 90, 84),
    mk('/basketball/usa/wnba/', 'Sky', 'Fever', null, null), // not played
    mk('/basketball/usa/nba/', 'Lakers', 'Celtics', 110, 100), // wrong competition
    mk('/basketball/chile/lnb/', 'A', 'B', 80, 70),
  ]);

  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0], { l: 'usa/wnba', h: 'Aces', a: 'Liberty', hg: 90, ag: 84, ts: d(0) });
});

const ARGS = { dayOffset: 0, tz: 'America/New_York', format: 'both', cache: 'unused', retain: 400 };

const deps = {
  fetchDayFixtures: async () => [
    {
      id: 'x1',
      tournament: { url: '/basketball/usa/wnba/', name: 'USA: WNBA' },
      home: 'Aces',
      away: 'Sky',
      homeScore: null,
      awayScore: null,
      kickoff: new Date(d(20) * 1000),
    },
    {
      id: 'x2',
      tournament: { url: '/basketball/chile/lnb/', name: 'CHILE: LNB' },
      home: 'Otro',
      away: 'Equipo',
      homeScore: null,
      awayScore: null,
      kickoff: new Date(d(20) * 1000),
    },
  ],
  updateHistory: async () => ({
    matches: SEASON,
    daysCached: 30,
    daysFetched: 1,
    daysFailed: 0,
  }),
};

test('the WNBA pipeline keeps only WNBA games and projects them', async () => {
  const data = await buildWnbaReport(ARGS, deps);

  assert.equal(data.stats.totalGames, 2, 'both basketball games were fetched');
  assert.equal(data.games.length, 1, 'only the WNBA one is reported');

  const [game] = data.games;
  assert.equal(game.home, 'Aces');
  assert.equal(game.projection.spread.favourite, 'Aces', 'the 4-0 side is favoured');
  assert.ok(game.projection.winProbability.home > 0.7);
  assert.equal(game.form.home.streak, 'WWWW');
  assert.equal(game.form.away.streak, 'LLLL', 'Sky lost all four of their games');
  assert.equal(game.h2hSummary.played, 2, 'Aces have met Sky twice');
});

test('the WNBA report renders the slate, totals and the not-covered notice', async () => {
  const data = await buildWnbaReport(ARGS, deps);
  const md = renderMarkdown(data);

  assert.match(md, /# WNBA slate/);
  assert.match(md, /## Slate/);
  assert.match(md, /## Totals — over\/under by line/);
  assert.match(md, /## Head to head/);
  assert.match(md, /Aces \*\(H\)\*/);
  assert.match(md, /Sky \*\(A\)\*/);
  // The gaps are stated in the report itself, not only in the chat.
  assert.match(md, /## Not covered/);
  assert.match(md, /Player props and injury status are \*\*not\*\* in this report/);
  assert.ok(!md.includes('Otro'), 'non-WNBA basketball must not appear');

  const json = JSON.parse(renderJson(data));
  assert.equal(json.competition, 'WNBA');
  assert.equal(json.games.length, 1);
  assert.equal(json.notCovered.playerProps, 'feed exposes no player-level data');
  assert.ok(json.games[0].projection.total.overUnder.length === 3);
});

test('an empty slate renders without pretending otherwise', async () => {
  const data = await buildWnbaReport(ARGS, {
    ...deps,
    fetchDayFixtures: async () => [],
  });
  assert.equal(data.games.length, 0);
  const md = renderMarkdown(data);
  assert.match(md, /_No WNBA games scheduled today\._/);
  assert.match(md, /## Not covered/);
});
