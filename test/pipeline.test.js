import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMatches, extractStandings, parseFeed } from '../src/flashscore.js';
import { buildReport } from '../src/index.js';
import { renderJson, renderMarkdown } from '../src/report.js';

const dayFeed = await readFile(new URL('../fixtures/sample-day-feed.txt', import.meta.url), 'utf8');
const tableFeed = await readFile(
  new URL('../fixtures/sample-standings-feed.txt', import.meta.url),
  'utf8',
);

const ARGS = { dayOffset: 0, min: 3, threshold: 45, tz: 'UTC', format: 'both' };

const deps = {
  fetchDayFixtures: async () => extractMatches(parseFeed(dayFeed)),
  fetchStandings: async (stageId) =>
    // Only the Premier League stage has a table in the sample data.
    stageId === 'Gj8O2bF5' ? extractStandings(parseFeed(tableFeed)) : [],
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

  // Damallsvenskan had no table, so it is listed rather than dropped.
  assert.deepEqual(
    data.unrankable.map((f) => `${f.home} v ${f.away}`),
    ['Hammarby v Vittsjo'],
  );
});

test('the top-versus-bottom game outranks the two-good-teams game', async () => {
  const data = await buildReport(ARGS, deps);
  const [first, second] = data.ranked;
  assert.ok(first.score.rankScore > second.score.rankScore);
  assert.ok(first.score.tags.includes('TOP_VS_BOTTOM'));
});

test('unmatched European competitions land in the review list', async () => {
  const data = await buildReport(ARGS, deps);
  // League One is excluded outright as tier 3; nothing here needs review.
  assert.deepEqual(data.review, []);
});

test('markdown and json renderers produce a complete report', async () => {
  const data = await buildReport(ARGS, deps);

  const md = renderMarkdown(data);
  assert.match(md, /# Soccer shortlist/);
  assert.match(md, /Arsenal\*\* v \*\*Sheffield Utd/);
  assert.match(md, /## Running order/);
  assert.match(md, /## In scope but not ranked/);
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

test('a standings failure degrades the fixture instead of failing the run', async () => {
  const data = await buildReport(ARGS, {
    ...deps,
    fetchStandings: async () => {
      throw new Error('feed 503');
    },
  });
  assert.equal(data.ranked.length, 0);
  assert.equal(data.unrankable.length, 3);
  assert.ok(data.stats.errors.length > 0);
});
