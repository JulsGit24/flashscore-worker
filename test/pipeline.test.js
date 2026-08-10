import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMatches, parseFeed } from '../src/flashscore.js';
import { buildReport, findRow } from '../src/index.js';
import { renderJson, renderMarkdown } from '../src/report.js';

const dayFeed = await readFile(new URL('../fixtures/sample-day-feed.txt', import.meta.url), 'utf8');

const ARGS = {
  dayOffset: 0,
  min: 3,
  threshold: 45,
  tz: 'UTC',
  format: 'both',
  cache: 'unused',
  lookback: 300,
  minPlayed: 3,
};

const DAY = 86400;
const day = (n) => 1_700_000_000 + n * DAY;

/**
 * Synthetic Premier League season as a double round robin with a strict
 * pecking order: Arsenal (1st) > Man City (2nd) > Brighton (3rd) >
 * Sheffield Utd (4th, loses everything).
 */
function premierLeagueHistory() {
  const l = 'england/premier-league';
  const order = ['Arsenal', 'Man City', 'Brighton', 'Sheffield Utd'];
  const out = [];
  let n = 0;
  for (const [i, better] of order.entries()) {
    for (const worse of order.slice(i + 1)) {
      // Played home and away; the stronger side wins both.
      out.push({ l, h: better, a: worse, hg: 3, ag: 0, ts: day(n++) });
      out.push({ l, h: worse, a: better, hg: 0, ag: 2, ts: day(n++) });
    }
  }
  return out;
}

const deps = {
  fetchDayFixtures: async () => extractMatches(parseFeed(dayFeed)),
  updateHistory: async () => ({
    matches: premierLeagueHistory(),
    daysCached: 20,
    daysFetched: 1,
    daysFailed: 0,
  }),
};

test('the pipeline keeps only in-scope games and ranks the ones it can score', async () => {
  const data = await buildReport(ARGS, deps);

  assert.equal(data.stats.totalFixtures, 6);
  assert.equal(data.stats.inScope, 3); // 2 Premier League + 1 Damallsvenskan
  assert.equal(data.stats.tablesLoaded, 1);

  assert.deepEqual(
    data.ranked.map((f) => `${f.home} v ${f.away}`),
    ['Arsenal v Sheffield Utd', 'Brighton v Man City'],
  );

  // Damallsvenskan has no derived table, so it is listed rather than dropped.
  assert.deepEqual(
    data.unrankable.map((f) => `${f.home} v ${f.away} (${f.why})`),
    ['Hammarby v Vittsjo (no results yet)'],
  );
});

test('the top-versus-bottom game outranks the two-even-teams game', async () => {
  const data = await buildReport(ARGS, deps);
  const [first, second] = data.ranked;
  assert.ok(first.score.rankScore > second.score.rankScore);
  assert.ok(first.score.tags.includes('TOP_VS_BOTTOM'));
  assert.equal(first.score.favourite, 'Arsenal');
});

test('a fixture whose teams have barely played is listed, not ranked', async () => {
  const data = await buildReport(ARGS, {
    ...deps,
    updateHistory: async () => ({
      matches: [
        { l: 'england/premier-league', h: 'Arsenal', a: 'Sheffield Utd', hg: 4, ag: 0, ts: day(0) },
        { l: 'england/premier-league', h: 'Brighton', a: 'Man City', hg: 1, ag: 1, ts: day(1) },
      ],
      daysCached: 2,
      daysFetched: 1,
      daysFailed: 0,
    }),
  });
  assert.equal(data.ranked.length, 0);
  assert.deepEqual(
    data.unrankable.map((f) => `${f.home}: ${f.why}`),
    [
      'Arsenal: too few games played',
      'Brighton: too few games played',
      'Hammarby: no results yet',
    ],
  );
});

test('tier-3 competitions never reach the review list', async () => {
  const data = await buildReport(ARGS, deps);
  assert.deepEqual(data.review, []);
});

test('markdown and json renderers produce a complete report', async () => {
  const data = await buildReport(ARGS, deps);

  const md = renderMarkdown(data);
  assert.match(md, /# Soccer shortlist/);
  assert.match(md, /Arsenal\*\* v \*\*Sheffield Utd/);
  assert.match(md, /## Running order/);
  assert.match(md, /## In scope but not ranked/);
  assert.match(md, /league tables derived from 20 days of results/);
  assert.ok(!md.includes('Flamengo'), 'non-European games must not appear');
  assert.ok(!md.includes('Barnsley'), 'tier-3 games must not appear');
  assert.ok(!md.includes('U21'), 'youth games must not appear');

  const json = JSON.parse(renderJson(data));
  assert.equal(json.games.length, 2);
  assert.equal(json.games[0].rank, 1);
  assert.equal(json.games[0].league, 'Premier League');
  assert.equal(json.games[0].tier, 1);
  assert.ok(json.games[0].goalsIndex >= 0 && json.games[0].goalsIndex <= 100);
  assert.equal(json.timezone, 'UTC');
});

test('a history fetch failure degrades the run instead of killing it', async () => {
  const data = await buildReport(ARGS, {
    ...deps,
    updateHistory: async ({ onError }) => {
      onError('day 2026-08-09: feed 503');
      return { matches: [], daysCached: 0, daysFetched: 0, daysFailed: 1 };
    },
  });
  assert.equal(data.ranked.length, 0);
  assert.equal(data.unrankable.length, 3);
  assert.deepEqual(data.stats.errors, ['day 2026-08-09: feed 503']);
});

test('findRow tolerates accents and punctuation differences', () => {
  const table = [{ team: 'Malmö FF' }, { team: 'IFK Göteborg' }];
  assert.equal(findRow(table, 'Malmo FF').team, 'Malmö FF');
  assert.equal(findRow(table, 'Goteborg').team, 'IFK Göteborg');
  assert.equal(findRow(table, 'Nobody'), null);
});
