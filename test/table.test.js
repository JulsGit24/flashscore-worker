import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTable, buildTables, findSeasonStart, groupByLeague } from '../src/table.js';
import { distilDay } from '../src/history.js';

const DAY = 86400;
const day = (n) => 1_770_000_000 + n * DAY;

const m = (l, h, a, hg, ag, ts) => ({ l, h, a, hg, ag, ts });

test('findSeasonStart ignores bye weeks but cuts at the summer break', () => {
  const lastSeason = [day(0), day(7), day(14), day(28)]; // includes a 2-week bye
  const thisSeason = [day(120), day(127), day(134)];
  assert.equal(findSeasonStart([...lastSeason, ...thisSeason]), day(120));
});

test('findSeasonStart returns the first match when there is no break', () => {
  const stamps = [day(0), day(7), day(14)];
  assert.equal(findSeasonStart(stamps), day(0));
  assert.equal(findSeasonStart([]), 0);
});

test('buildTable computes points, goals and rank', () => {
  const rows = buildTable([
    m('x', 'Alpha', 'Beta', 3, 0, day(0)),
    m('x', 'Beta', 'Gamma', 1, 1, day(7)),
    m('x', 'Gamma', 'Alpha', 0, 2, day(14)),
  ]);

  const alpha = rows.find((r) => r.team === 'Alpha');
  assert.deepEqual(
    { ...alpha },
    { team: 'Alpha', played: 2, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 0, points: 6, rank: 1 },
  );

  const beta = rows.find((r) => r.team === 'Beta');
  assert.equal(beta.points, 1);
  assert.equal(beta.played, 2);
  assert.equal(beta.goalsAgainst, 4);

  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test('buildTable excludes results from the previous season', () => {
  const rows = buildTable([
    // last season: Alpha ran up a huge total
    m('x', 'Alpha', 'Beta', 6, 0, day(0)),
    m('x', 'Alpha', 'Beta', 5, 0, day(7)),
    // summer break, then this season
    m('x', 'Alpha', 'Beta', 0, 1, day(130)),
  ]);
  const alpha = rows.find((r) => r.team === 'Alpha');
  assert.equal(alpha.played, 1, 'only the post-break game should count');
  assert.equal(alpha.goalsFor, 0);
  assert.equal(alpha.points, 0);
});

test('buildTable ranks on points, then goal difference, then goals scored', () => {
  const rows = buildTable([
    m('x', 'GD', 'Weak', 4, 0, day(0)), // 3 pts, +4
    m('x', 'GF', 'Weak', 5, 2, day(1)), // 3 pts, +3
    m('x', 'Weak', 'GD', 0, 0, day(200)),
  ].filter((x) => x.ts < day(100)));
  assert.deepEqual(rows.map((r) => r.team), ['GD', 'GF', 'Weak']);
});

test('buildTable dedupes a fixture that appears in two day feeds', () => {
  const rows = buildTable([
    m('x', 'Alpha', 'Beta', 2, 1, day(0)),
    m('x', 'Alpha', 'Beta', 2, 1, day(0)),
  ]);
  assert.equal(rows.find((r) => r.team === 'Alpha').played, 1);
});

test('groupByLeague and buildTables split leagues apart', () => {
  const matches = [
    m('england/premier-league', 'A', 'B', 1, 0, day(0)),
    m('sweden/allsvenskan', 'C', 'D', 2, 2, day(0)),
  ];
  assert.deepEqual([...groupByLeague(matches).keys()], [
    'england/premier-league',
    'sweden/allsvenskan',
  ]);

  const tables = buildTables(matches);
  assert.equal(tables.size, 2);
  assert.equal(tables.get('england/premier-league').length, 2);
});

test('distilDay keeps finished in-scope games and drops everything else', () => {
  const mk = (url, name, home, away, hg, ag) => ({
    tournament: { url, name },
    home,
    away,
    homeScore: hg,
    awayScore: ag,
    kickoff: new Date(day(0) * 1000),
  });

  const kept = distilDay([
    mk('/football/england/premier-league/', 'ENGLAND: Premier League', 'A', 'B', 2, 1),
    mk('/football/england/premier-league/', 'ENGLAND: Premier League', 'C', 'D', null, null), // not played
    mk('/football/england/league-one/', 'ENGLAND: League One', 'E', 'F', 1, 1), // tier 3
    mk('/football/brazil/serie-a/', 'BRAZIL: Serie A', 'G', 'H', 3, 0), // not European
  ]);

  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0], {
    l: 'england/premier-league',
    h: 'A',
    a: 'B',
    hg: 2,
    ag: 1,
    ts: day(0),
  });
});
