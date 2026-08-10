import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSeasonTable,
  buildTable,
  buildTables,
  findSeasonStart,
  groupByLeague,
  seasonStarts,
} from '../src/table.js';
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
  assert.equal(tables.get('england/premier-league').rows.length, 2);
  assert.equal(tables.get('england/premier-league').usedPreviousSeason, false);
});

test('seasonStarts lists every season boundary oldest first', () => {
  const stamps = [day(0), day(7), day(130), day(137), day(300)];
  assert.deepEqual(seasonStarts(stamps), [day(0), day(130), day(300)]);
  assert.deepEqual(seasonStarts([]), []);
});

test('buildSeasonTable falls back to last season when this one is too thin', () => {
  const matches = [
    // Last season: a full record.
    m('x', 'Alpha', 'Beta', 2, 0, day(0)),
    m('x', 'Beta', 'Alpha', 1, 3, day(7)),
    m('x', 'Alpha', 'Beta', 1, 1, day(14)),
    m('x', 'Beta', 'Alpha', 0, 2, day(21)),
    // Summer break, then one game of the new season.
    m('x', 'Alpha', 'Beta', 0, 1, day(150)),
  ];

  const { rows, usedPreviousSeason } = buildSeasonTable(matches, { minGames: 3 });
  assert.equal(usedPreviousSeason, true, 'one game is not enough to stand alone');
  const alpha = rows.find((r) => r.team === 'Alpha');
  assert.equal(alpha.played, 5, 'both seasons are counted once the fallback trips');
});

test('buildSeasonTable stays on the current season once it has enough games', () => {
  const matches = [
    m('x', 'Alpha', 'Beta', 2, 0, day(0)),
    m('x', 'Beta', 'Alpha', 1, 3, day(7)),
    // Break, then a season with enough played.
    m('x', 'Alpha', 'Beta', 1, 0, day(150)),
    m('x', 'Beta', 'Alpha', 2, 2, day(157)),
    m('x', 'Alpha', 'Beta', 0, 1, day(164)),
  ];

  const { rows, usedPreviousSeason } = buildSeasonTable(matches, { minGames: 3 });
  assert.equal(usedPreviousSeason, false);
  assert.equal(rows.find((r) => r.team === 'Alpha').played, 3);
});

test('buildSeasonTable cannot fall back when there is only one season', () => {
  const matches = [m('x', 'Alpha', 'Beta', 1, 0, day(0))];
  const { rows, usedPreviousSeason } = buildSeasonTable(matches, { minGames: 3 });
  assert.equal(usedPreviousSeason, false);
  assert.equal(rows.find((r) => r.team === 'Alpha').played, 1);
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
    mk('/football/nigeria/npfl/', 'NIGERIA: NPFL', 'G', 'H', 3, 0), // out of region
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

test('distilDay keeps results from every configured region, not just Europe', () => {
  const mk = (url, name, home, away) => ({
    tournament: { url, name },
    home,
    away,
    homeScore: 1,
    awayScore: 0,
    kickoff: new Date(day(0) * 1000),
  });

  const kept = distilDay([
    mk('/football/brazil/serie-a/', 'BRAZIL: Serie A', 'Flamengo', 'Palmeiras'),
    mk('/football/japan/j1-league/', 'JAPAN: J1 League', 'Kashima', 'Urawa'),
    mk('/football/usa/mls/', 'USA: MLS', 'LAFC', 'Seattle'),
  ]);

  assert.deepEqual(kept.map((k) => k.l), ['brazil/serie-a', 'japan/j1-league', 'usa/mls']);
});
