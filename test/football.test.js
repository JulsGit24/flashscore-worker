import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  COMPETITIONS,
  KEY_NUMBERS,
  MIN_GAMES_FOR_DERIVED_SD,
  baselineRow,
  competitionOf,
  confidenceFor,
  defaultTotalLines,
  keyNumbers,
  leagueContext,
  linesAtProbability,
  projectGame,
  teamRatings,
} from '../src/football/model.js';
import { buildStandings, headToHead, headToHeadSummary, recentForm } from '../src/football/standings.js';
import { buildFootballReport, distilFootballDay, writeCheckMarker } from '../src/football.js';
import { renderJson, renderMarkdown } from '../src/football/report.js';
import { footballDocument } from '../src/visual/model.js';
import { renderHtml } from '../src/visual/render.js';
import { SPORT } from '../src/flashscore.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- the two competitions are genuinely different ----------------------------

test('NFL and college carry their own constants, and college is much wider', () => {
  // The probe measured mean |margin| of 12.2 in the NFL against 21.8 in
  // college. One set of constants for "football" would be wrong for both.
  assert.ok(COMPETITIONS.ncaa.marginSd > COMPETITIONS.nfl.marginSd * 1.3);
  assert.ok(COMPETITIONS.ncaa.fallbackPointsPerTeam > COMPETITIONS.nfl.fallbackPointsPerTeam);
  assert.equal(COMPETITIONS.nfl.tiesPossible, true);
  assert.equal(COMPETITIONS.ncaa.tiesPossible, false);
});

test('an unknown competition is refused rather than silently defaulted', () => {
  assert.throws(() => competitionOf('xfl'), /unknown competition/);
});

test('American football is sport 5', () => {
  assert.equal(SPORT.americanFootball, 5);
});

// --- league context ----------------------------------------------------------

const rowsOf = (specs) =>
  specs.map(([team, played, pf, pa], i) => ({
    team,
    played,
    pointsFor: pf,
    pointsAgainst: pa,
    wins: 0,
    losses: 0,
    ties: 0,
    rank: i + 1,
  }));

test('scoring rate is measured from the table, with a fallback when it is empty', () => {
  const ctx = leagueContext(rowsOf([['A', 4, 100, 80]]), [], 'nfl');
  assert.ok(close(ctx.pointsPerTeamGame, 25));
  assert.equal(leagueContext([], [], 'nfl').pointsPerTeamGame, COMPETITIONS.nfl.fallbackPointsPerTeam);
});

test('the spreads are the prior until there are enough games, then measured', () => {
  const rows = rowsOf([['A', 4, 100, 80]]);

  const thin = leagueContext(rows, [{ hg: 20, ag: 17 }], 'nfl');
  assert.equal(thin.marginSd, COMPETITIONS.nfl.marginSd);
  assert.equal(thin.derivedFrom, 0, 'one game must not be allowed to set the spread');

  // A deliberately tight set of results: every game decided by 3, so the
  // measured spread must come out far below the prior.
  const tight = Array.from({ length: MIN_GAMES_FOR_DERIVED_SD }, (_, i) => ({
    hg: 21,
    ag: i % 2 === 0 ? 18 : 24,
  }));
  const derived = leagueContext(rows, tight, 'nfl');
  assert.equal(derived.derivedFrom, MIN_GAMES_FOR_DERIVED_SD);
  assert.ok(derived.marginSd < COMPETITIONS.nfl.marginSd, 'measured spread should beat the prior');
  assert.ok(derived.marginSd > 0);
});

test('a team with no games sits exactly at league average', () => {
  const ctx = leagueContext(rowsOf([['A', 4, 100, 80]]), [], 'nfl');
  const r = teamRatings(baselineRow('Nobody'), ctx);
  assert.ok(close(r.offence, 1, 1e-12));
  assert.ok(close(r.defence, 1, 1e-12));
});

test('confidence tiers follow the thinner side, on a football-length season', () => {
  // 17 games, not 82 — four is already a meaningful sample here.
  assert.equal(confidenceFor(0, 10, 'nfl'), 'baseline');
  assert.equal(confidenceFor(1, 10, 'nfl'), 'low');
  assert.equal(confidenceFor(3, 10, 'nfl'), 'medium');
  assert.equal(confidenceFor(4, 10, 'nfl'), 'high');
});

// --- projection --------------------------------------------------------------

const NFL_ROWS = rowsOf([
  ['Contenders', 6, 180, 90],
  ['Strugglers', 6, 84, 168],
  ['Middling', 6, 132, 132],
]);

function ctxFor(comp) {
  return leagueContext(NFL_ROWS, [], comp);
}

test('a projection is internally consistent', () => {
  const ctx = ctxFor('nfl');
  const p = projectGame({ home: 'Contenders', away: 'Strugglers' }, NFL_ROWS[0], NFL_ROWS[1], ctx);

  const w = p.winProbability;
  assert.ok(close(w.home + w.away + w.tie, 1, 1e-9), 'all the mass is accounted for');
  assert.ok(close(p.points.home + p.points.away, p.total.projected, 0.01));
  assert.ok(w.home > w.away, 'the far better side is favoured');
  assert.equal(p.spread.favourite, 'Contenders');
  assert.ok(p.spread.line < 0, 'the favourite is quoted with a negative number');
});

test('the NFL leaves room for a tie; college does not', () => {
  const nfl = projectGame({ home: 'A', away: 'B' }, NFL_ROWS[2], NFL_ROWS[2], ctxFor('nfl'));
  assert.ok(nfl.winProbability.tie > 0, 'an NFL game can end level');
  // Real NFL ties run near 0.3% of games. The chance of a *regulation* tie is
  // an order of magnitude higher; quoting that as the tie would be wrong.
  assert.ok(nfl.winProbability.tie < 0.01, `tie ${nfl.winProbability.tie} is far too high`);
  assert.ok(
    nfl.regulation.tie > nfl.winProbability.tie * 5,
    'overtime must resolve the great majority of regulation ties',
  );

  const ncaa = projectGame({ home: 'A', away: 'B' }, NFL_ROWS[2], NFL_ROWS[2], ctxFor('ncaa'));
  assert.equal(ncaa.winProbability.tie, 0, 'college plays overtime until somebody wins');
  assert.ok(close(ncaa.winProbability.home + ncaa.winProbability.away, 1, 1e-9));
});

test('home advantage is small, as it is in football', () => {
  const even = NFL_ROWS[2];
  const p = projectGame({ home: 'A', away: 'B' }, even, { ...even, team: 'B' }, ctxFor('nfl'));
  assert.ok(p.winProbability.home > 0.5, 'the home side is favoured');
  assert.ok(p.winProbability.home < 0.56, `home win ${p.winProbability.home} is too large`);
});

test('the same fixture is a wider proposition in college than in the NFL', () => {
  const game = { home: 'Contenders', away: 'Strugglers' };
  const nfl = projectGame(game, NFL_ROWS[0], NFL_ROWS[1], ctxFor('nfl'));
  const ncaa = projectGame(game, NFL_ROWS[0], NFL_ROWS[1], ctxFor('ncaa'));
  // Same edge, wider spread of outcomes, so the favourite is less certain.
  assert.ok(
    ncaa.winProbability.home < nfl.winProbability.home,
    'a wider margin distribution must make the same edge less decisive',
  );
});

test('the first-half split is half the game and flagged as derived', () => {
  const p = projectGame({ home: 'A', away: 'B' }, NFL_ROWS[0], NFL_ROWS[1], ctxFor('nfl'));
  assert.ok(close(p.firstHalf.points.total, p.total.projected / 2, 0.05));
  assert.match(p.firstHalf.note, /not measured half data/);
});

// --- key numbers -------------------------------------------------------------

test('key numbers are real probabilities, and 3 outranks the rest', () => {
  const ks = keyNumbers(3, 13.5);
  const byMargin = Object.fromEntries(ks.map((k) => [k.margin, k.probability]));

  for (const k of ks) assert.ok(k.probability > 0 && k.probability < 1, `${k.margin} out of range`);
  assert.deepEqual(ks.map((k) => k.margin), KEY_NUMBERS);
  // With the game projected at exactly 3, landing on 3 must beat landing on 14.
  assert.ok(byMargin[3] > byMargin[14]);
});

test('the key-number mass is a floor, and small enough to be worth the warning', () => {
  // Discretising a smooth curve spreads the mass evenly, so every key number
  // comes out in single digits. Real football clusters far harder on 3 and 7 —
  // the report says so, and this pins the behaviour the warning describes.
  const total = keyNumbers(3, 13.5).reduce((s, k) => s + k.probability, 0);
  assert.ok(total < 0.35, `key numbers total ${total} — a smooth curve should not cluster`);
});

// --- lines -------------------------------------------------------------------

test('lines that clear the bar are quoted on half points', () => {
  const ctx = ctxFor('nfl');
  const p = projectGame({ home: 'Contenders', away: 'Strugglers' }, NFL_ROWS[0], NFL_ROWS[1], ctx);
  const l = linesAtProbability(p, ctx, 0.7);

  for (const v of [l.totalOver, l.totalUnder, Math.abs(l.spread.line)]) {
    assert.ok(close(Math.abs(v % 1), 0.5, 1e-9), `${v} is not a half point`);
  }
  assert.ok(l.totalOver < p.total.projected, 'a 70% over line sits below the projection');
  assert.ok(l.totalUnder > p.total.projected, 'and a 70% under line sits above it');
});

test('default total lines are half points around the projection', () => {
  for (const l of defaultTotalLines(44.2)) {
    assert.ok(l > 0);
    assert.ok(close(Math.abs(l % 1), 0.5, 1e-9), `${l} is not a half point`);
  }
});

// --- standings, and the tie the other sports do not have ---------------------

const TS = 1_780_000_000;
const g = (l, h, a, hg, ag, day) => ({ l, h, a, hg, ag, ts: TS + day * 86400 });

test('a tied NFL game is counted as a tie, not handed to the away side', () => {
  const rows = buildStandings([g('usa/nfl', 'A', 'B', 20, 20, 0)]);
  const A = rows.find((r) => r.team === 'A');
  const B = rows.find((r) => r.team === 'B');

  assert.equal(A.ties, 1);
  assert.equal(B.ties, 1);
  assert.equal(A.wins, 0);
  assert.equal(B.wins, 0, 'the basketball counter would have credited a win here');
  assert.equal(A.losses, 0);
  assert.ok(close(A.winPct, 0.5), 'a tie counts half');
});

test('form marks a tie with T', () => {
  const games = [
    g('usa/nfl', 'A', 'B', 24, 10, 0),
    g('usa/nfl', 'B', 'A', 17, 17, 1),
    g('usa/nfl', 'A', 'C', 3, 30, 2),
  ];
  const form = recentForm(games, 'A');
  assert.equal(form.streak, 'LTW', 'most recent first');
  assert.equal(form.played, 3);
  assert.ok(close(form.winRate, (1 + 0.5) / 3));
});

test('head to head reports a tie as a tie rather than a winner', () => {
  const games = [g('usa/nfl', 'A', 'B', 20, 20, 0), g('usa/nfl', 'B', 'A', 30, 10, 1)];
  const h2h = headToHead(games, 'A', 'B');
  const summary = headToHeadSummary(h2h, 'A');
  assert.equal(summary.played, 2);
  assert.equal(summary.ties, 1);
  assert.equal(summary.aWins, 0);
  assert.equal(summary.bWins, 1);
});

// --- the pipeline ------------------------------------------------------------

const NOW = new Date('2026-09-20T18:00:00Z'); // Sunday, 14:00 New York

function fixture(comp, home, away, iso, id) {
  return {
    id: id ?? `${home}${away}`,
    tournament: {
      url: `/american-football/usa/${comp}/`,
      name: `USA: ${comp.toUpperCase()}`,
      image: 'comp.png',
    },
    home,
    away,
    homeScore: null,
    awayScore: null,
    homeImage: 'h.png',
    awayImage: 'a.png',
    kickoff: new Date(iso),
  };
}

const HISTORY = [
  g('usa/nfl', 'Contenders', 'Strugglers', 31, 10, -7),
  g('usa/nfl', 'Strugglers', 'Contenders', 13, 27, -14),
  g('usa/nfl', 'Contenders', 'Middling', 24, 20, -21),
  g('usa/nfl', 'Middling', 'Strugglers', 28, 14, -21),
  g('usa/ncaa', 'Powerhouse', 'Minnows', 63, 3, -7),
  g('usa/ncaa', 'Minnows', 'Powerhouse', 7, 49, -14),
];

const deps = {
  fetchDayFixtures: async () => [
    fixture('nfl', 'Contenders', 'Strugglers', '2026-09-20T17:00:00Z', 'n1'),
    fixture('nfl', 'Middling', 'Contenders', '2026-09-20T20:25:00Z', 'n2'),
    fixture('ncaa', 'Powerhouse', 'Minnows', '2026-09-20T16:00:00Z', 'c1'),
    // A different American football competition on the same sport id.
    {
      ...fixture('nfl', 'Tiger-Cats', 'Alouettes', '2026-09-20T19:00:00Z', 'x1'),
      tournament: { url: '/american-football/canada/cfl/', name: 'CANADA: CFL', image: null },
    },
  ],
  updateHistory: async () => ({
    matches: HISTORY,
    daysCached: 30,
    daysFetched: 1,
    daysFailed: 0,
  }),
};

const ARGS = { competition: 'nfl', dayOffset: 0, tz: 'America/New_York', cache: 'unused', retain: 400, coverProbability: 0.7 };

test('the NFL report covers the NFL only — not the CFL, not college', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  assert.deepEqual(data.games.map((x) => x.home), ['Contenders', 'Middling']);
  assert.equal(data.ctx.competition, 'nfl');
  assert.equal(data.stats.totalGames, 4, 'the worldwide count still sees every game');
});

test('the college report covers college only', async () => {
  const data = await buildFootballReport({ ...ARGS, competition: 'ncaa' }, deps, NOW);
  assert.deepEqual(data.games.map((x) => x.home), ['Powerhouse']);
  assert.equal(data.ctx.competition, 'ncaa');
});

test('a team\'s record comes from its own competition, never the shared cache', async () => {
  // Both competitions live in one cache file because the day feed is per sport.
  // An NFL side must not pick up college results, or vice versa.
  const data = await buildFootballReport(ARGS, deps, NOW);
  assert.equal(data.stats.teamsKnown, 3, 'the three NFL sides, not the college ones');

  const ncaa = await buildFootballReport({ ...ARGS, competition: 'ncaa' }, deps, NOW);
  assert.equal(ncaa.stats.teamsKnown, 2);
});

test('form and crests come through', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  const game = data.games.find((x) => x.home === 'Contenders');
  assert.equal(game.form.home.streak, 'WWW');
  assert.equal(game.form.away.streak, 'LLL');
  assert.equal(game.homeImage, 'h.png');
  assert.equal(game.tournamentImage, 'comp.png');
});

test('probabilities stay in range across both competitions', async () => {
  for (const competition of ['nfl', 'ncaa']) {
    const data = await buildFootballReport({ ...ARGS, competition }, deps, NOW);
    for (const x of data.games) {
      const w = x.projection.winProbability;
      for (const v of [w.home, w.away, w.tie]) {
        assert.ok(v >= 0 && v <= 1, `${competition}: probability ${v} out of range`);
      }
      assert.ok(close(w.home + w.away + w.tie, 1, 1e-9));
    }
  }
});

test('an empty day yields no games, which is how a bye week is meant to read', async () => {
  const data = await buildFootballReport(ARGS, { ...deps, fetchDayFixtures: async () => [] }, NOW);
  assert.deepEqual(data.games, []);
});

// --- rendering ---------------------------------------------------------------

test('markdown names its sections and states its limits', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  const md = renderMarkdown(data);

  assert.match(md, /^# NFL slate — \d{4}-\d{2}-\d{2}/);
  assert.match(md, /## Strong favourites/);
  assert.match(md, /## Key numbers/);
  assert.match(md, /## Lines that clear/);
  assert.match(md, /## Biggest strength gaps/);
  // The two things a football reader must be told every time.
  assert.match(md, /quarterback/i);
  assert.match(md, /understates/i);
  assert.ok(!md.includes('Tiger-Cats'), 'no CFL game leaked in');
});

test('the footer says whether the spreads were measured or assumed', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  assert.match(renderMarkdown(data), /from the competition prior — not yet enough cached results/);

  const measured = { ...data, ctx: { ...data.ctx, derivedFrom: 120, marginSd: 12.9, totalSd: 9.8 } };
  assert.match(renderMarkdown(measured), /measured from 120 finished games/);
});

test('json carries the model it actually used', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  const json = JSON.parse(renderJson(data));
  assert.equal(json.sport, 'american-football');
  assert.equal(json.competitionKey, 'nfl');
  assert.ok(json.model.marginSd > 0);
  assert.equal(json.model.spreadsDerivedFromGames, 0);
  assert.ok(json.notCovered.quarterback);
});

test('the visual document renders, with both caveats on the page', async () => {
  const data = await buildFootballReport(ARGS, deps, NOW);
  const doc = footballDocument(data);
  assert.equal(doc.sport, 'football');

  const html = renderHtml(doc);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /NFL slate/);
  assert.match(html, /quarterback/i);
  assert.match(html, /Key numbers are a floor/);

  // Bars must still account for all the probability, tie segment included.
  for (const group of doc.groups) {
    for (const c of group.cards) {
      const sum = c.bars.reduce((s, b) => s + b.pct, 0);
      assert.ok(Math.abs(sum - 1) < 0.02, `bars sum to ${sum}`);
    }
  }
});

test('the college document drops the tie segment entirely', async () => {
  const data = await buildFootballReport({ ...ARGS, competition: 'ncaa' }, deps, NOW);
  const doc = footballDocument(data);
  for (const c of doc.groups[0].cards) {
    assert.deepEqual(c.bars.map((b) => b.label), ['H', 'A']);
  }
});

// --- the check marker --------------------------------------------------------

test('the marker separates "no games" from "the job never ran"', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fs-football-'));
  const marker = path.join(dir, 'nested', 'football-checked.json');

  await writeCheckMarker(marker, '2026-09-22', { nfl: 0 });
  let state = JSON.parse(await readFile(marker, 'utf8'));
  assert.equal(state['2026-09-22'].nfl, 0, 'a checked day with no games is recorded as zero');
  assert.ok(state['2026-09-22'].checkedAt);

  // The second competition merges into the same day rather than replacing it.
  await writeCheckMarker(marker, '2026-09-22', { ncaa: 4 });
  state = JSON.parse(await readFile(marker, 'utf8'));
  assert.equal(state['2026-09-22'].nfl, 0);
  assert.equal(state['2026-09-22'].ncaa, 4);
});

test('the marker keeps a bounded window, oldest dropped first', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fs-football-'));
  const marker = path.join(dir, 'm.json');
  for (let i = 1; i <= 8; i += 1) {
    await writeCheckMarker(marker, `2026-09-0${i}`, { nfl: i }, 5);
  }
  const state = JSON.parse(await readFile(marker, 'utf8'));
  assert.deepEqual(Object.keys(state).sort(), ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
});

test('a corrupt marker is replaced rather than crashing the run', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fs-football-'));
  const marker = path.join(dir, 'm.json');
  await (await import('node:fs/promises')).writeFile(marker, 'not json at all');
  const state = await writeCheckMarker(marker, '2026-09-22', { nfl: 1 });
  assert.equal(state['2026-09-22'].nfl, 1);
});

// --- distil ------------------------------------------------------------------

test('only finished NFL and college games are cached', () => {
  const kept = distilFootballDay([
    { ...fixture('nfl', 'A', 'B', '2026-09-20T17:00:00Z'), homeScore: 24, awayScore: 17 },
    fixture('ncaa', 'C', 'D', '2026-09-20T16:00:00Z'), // not finished
    { ...fixture('ncaa', 'E', 'F', '2026-09-20T16:00:00Z'), homeScore: 45, awayScore: 10 },
    {
      ...fixture('nfl', 'G', 'H', '2026-09-20T19:00:00Z'),
      tournament: { url: '/american-football/canada/cfl/', name: 'CFL' },
      homeScore: 30,
      awayScore: 20,
    },
  ]);

  assert.deepEqual(kept.map((k) => `${k.l}:${k.h}`), ['usa/nfl:A', 'usa/ncaa:E']);
});
