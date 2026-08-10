import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leagueContext, rankFixtures, scoreFixture, teamRates } from '../src/score.js';

/** Build a synthetic 20-team table with a given set of named teams merged in. */
function makeTable(teams) {
  const filler = [];
  for (let i = teams.length; i < 20; i += 1) {
    filler.push({
      team: `Filler ${i}`,
      rank: i + 1,
      played: 20,
      wins: 7,
      draws: 6,
      losses: 7,
      goalsFor: 27,
      goalsAgainst: 27,
      points: 27,
    });
  }
  return [...teams, ...filler];
}

const ELITE = {
  team: 'Elite',
  rank: 1,
  played: 20,
  wins: 16,
  draws: 2,
  losses: 2,
  goalsFor: 55,
  goalsAgainst: 12,
  points: 50,
};
const STRUGGLER = {
  team: 'Struggler',
  rank: 20,
  played: 20,
  wins: 1,
  draws: 3,
  losses: 16,
  goalsFor: 11,
  goalsAgainst: 58,
  points: 6,
};
const MID_A = {
  team: 'Mid A',
  rank: 9,
  played: 20,
  wins: 8,
  draws: 5,
  losses: 7,
  goalsFor: 27,
  goalsAgainst: 27,
  points: 29,
};
const MID_B = { ...MID_A, team: 'Mid B', rank: 10, points: 28 };

test('leagueContext derives goals per match from the table', () => {
  const table = makeTable([ELITE, STRUGGLER]);
  const ctx = leagueContext(table);
  assert.equal(ctx.size, 20);
  // 20 teams x 20 games = 400 team-games = 200 matches.
  const totalGoals = table.reduce((s, r) => s + r.goalsFor, 0);
  assert.equal(ctx.goalsPerMatch, totalGoals / 200);
  assert.ok(ctx.maxPpg > ctx.minPpg);
});

test('a top side hosting the bottom side scores high on mismatch', () => {
  const table = makeTable([ELITE, STRUGGLER]);
  const ctx = leagueContext(table);
  const s = scoreFixture({ home: 'Elite', away: 'Struggler' }, ELITE, STRUGGLER, ctx);

  assert.ok(s.mismatchIndex >= 70, `expected a big edge, got ${s.mismatchIndex}`);
  assert.ok(s.tags.includes('MISMATCH'));
  assert.ok(s.tags.includes('TOP_VS_BOTTOM'));
  assert.equal(s.favourite, 'Elite');
  assert.ok(s.projected.home > s.projected.away);
});

test('two mid-table sides of equal shape score low on mismatch', () => {
  const table = makeTable([MID_A, MID_B]);
  const ctx = leagueContext(table);
  const s = scoreFixture({ home: 'Mid A', away: 'Mid B' }, MID_A, MID_B, ctx);

  assert.ok(s.mismatchIndex < 30, `expected an even game, got ${s.mismatchIndex}`);
  assert.ok(!s.tags.includes('TOP_VS_BOTTOM'));
});

test('a strong attack against a leaky defence flags high goals', () => {
  const bigAttack = { ...ELITE, team: 'Big Attack', goalsFor: 62, goalsAgainst: 30 };
  const sieve = { ...STRUGGLER, team: 'Sieve', goalsFor: 24, goalsAgainst: 61 };
  const table = makeTable([bigAttack, sieve]);
  const ctx = leagueContext(table);
  const s = scoreFixture({ home: 'Big Attack', away: 'Sieve' }, bigAttack, sieve, ctx);

  assert.ok(s.goalsIndex >= 60, `expected a shootout, got ${s.goalsIndex}`);
  assert.ok(s.tags.includes('ATK_VS_LEAKY'));
  assert.ok(s.projected.total > 3);
});

test('two grinding defences score low on goals', () => {
  const wall = {
    team: 'Wall', rank: 4, played: 20, wins: 9, draws: 8, losses: 3,
    goalsFor: 18, goalsAgainst: 10, points: 35,
  };
  const bore = {
    team: 'Bore', rank: 6, played: 20, wins: 8, draws: 8, losses: 4,
    goalsFor: 17, goalsAgainst: 12, points: 32,
  };
  const ctx = leagueContext(makeTable([wall, bore]));
  const s = scoreFixture({ home: 'Wall', away: 'Bore' }, wall, bore, ctx);
  assert.ok(s.goalsIndex < 40, `expected a tight game, got ${s.goalsIndex}`);
  assert.ok(!s.tags.includes('HIGH_GOALS'));
});

test('early-season rates are shrunk toward the league average', () => {
  const ctx = leagueContext(makeTable([ELITE, STRUGGLER]));
  const hotStart = { ...ELITE, played: 2, wins: 2, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, points: 6 };

  const raw = hotStart.goalsFor / hotStart.played; // 4.5 per game
  const shrunk = teamRates(hotStart, ctx).gfpg;
  assert.ok(shrunk < raw, 'shrinkage should pull the rate down');
  assert.ok(shrunk > ctx.goalsPerTeamGame, 'but it should stay above league average');
});

test('fixtures with too few games played are damped and tagged', () => {
  const ctx = leagueContext(makeTable([ELITE, STRUGGLER]));
  const youngElite = { ...ELITE, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 1, points: 9 };
  const youngStruggler = { ...STRUGGLER, played: 3, wins: 0, draws: 0, losses: 3, goalsFor: 1, goalsAgainst: 9, points: 0 };

  const s = scoreFixture({ home: 'Elite', away: 'Struggler' }, youngElite, youngStruggler, ctx);
  assert.ok(s.tags.includes('LOW_SAMPLE'));

  const full = scoreFixture({ home: 'Elite', away: 'Struggler' }, ELITE, STRUGGLER, ctx);
  assert.ok(
    s.mismatchIndex < full.mismatchIndex,
    'a three-game sample should not outrank a full season of the same story',
  );
});

test('both indices stay within 0-100 even when the table is partial', () => {
  // A standings feed that returned only five of twenty rows: the ranks on the
  // fixture still say 1st and 19th, so the raw gap ratio would exceed 1.
  const partial = [ELITE, STRUGGLER, MID_A, MID_B, { ...MID_A, team: 'Mid C', rank: 11 }];
  const ctx = leagueContext(partial);
  const s = scoreFixture({ home: 'Elite', away: 'Struggler' }, ELITE, STRUGGLER, ctx);

  assert.ok(s.mismatchIndex <= 100, `mismatch out of range: ${s.mismatchIndex}`);
  assert.ok(s.goalsIndex <= 100, `goals out of range: ${s.goalsIndex}`);
  assert.ok(s.mismatchIndex >= 0 && s.goalsIndex >= 0);
});

test('rankFixtures sorts best-first and honours the minimum', () => {
  const make = (rankScore) => ({ score: { rankScore } });
  const pool = [make(10), make(90), make(50), make(70), make(20)];

  const strict = rankFixtures(pool, { min: 2, threshold: 60 });
  assert.deepEqual(strict.map((f) => f.score.rankScore), [90, 70]);

  // Only two clear the threshold, but the caller asked for four: top up by rank.
  const topped = rankFixtures(pool, { min: 4, threshold: 60 });
  assert.deepEqual(topped.map((f) => f.score.rankScore), [90, 70, 50, 20]);
});
