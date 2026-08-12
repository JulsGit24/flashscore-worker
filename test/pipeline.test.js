import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMatches, parseFeed } from '../src/flashscore.js';
import { buildReport, findRow } from '../src/index.js';
import { groupFixtures, renderJson, renderMarkdown, strongPicks } from '../src/report.js';

const dayFeed = await readFile(new URL('../fixtures/sample-day-feed.txt', import.meta.url), 'utf8');

const ARGS = {
  dayOffset: 0,
  region: 'europe',
  min: 3,
  threshold: 45,
  tz: 'UTC',
  format: 'both',
  cache: 'unused',
  retain: 400,
  minConfidence: 'low',
  strongPick: 0.7,
};

const DAY = 86400;
// Midnight UTC, so hour offsets stay inside the same calendar day.
const BASE_TS = Date.UTC(2023, 10, 24) / 1000;
const day = (n) => BASE_TS + n * DAY;

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

/**
 * The recorded sample all sits on one UTC day; reports filter to their local
 * day, so every call is anchored to it rather than to whenever the suite runs.
 */
const NOW = extractMatches(parseFeed(dayFeed)).find((m) => m.kickoff).kickoff;

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
  const data = await buildReport(ARGS, deps, NOW);

  assert.equal(data.stats.totalFixtures, 6);
  assert.equal(data.stats.inScope, 3); // 2 Premier League + 1 Damallsvenskan
  assert.equal(data.stats.tablesLoaded, 1);

  assert.deepEqual(
    data.ranked.map((f) => `${f.home} v ${f.away}`),
    ['Arsenal v Sheffield Utd', 'Brighton v Man City'],
  );

  // Damallsvenskan has no derived table, so it falls back to the league
  // baseline: still projected, but flagged as resting on nothing.
  const hammarby = data.all.find((f) => f.home === 'Hammarby');
  assert.equal(hammarby.score.confidence, 'baseline');
  assert.equal(hammarby.score.basis, 'league baseline');
  assert.ok(hammarby.score.probabilities.home > 0, 'a baseline game still gets a win chance');
  assert.equal(
    data.ranked.some((f) => f.home === 'Hammarby'),
    false,
    'baseline-only games stay out of the shortlist',
  );
});

test('the top-versus-bottom game outranks the two-even-teams game', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  const [first, second] = data.ranked;
  assert.ok(first.score.rankScore > second.score.rankScore);
  assert.ok(first.score.tags.includes('TOP_VS_BOTTOM'));
  assert.equal(first.score.favourite, 'Arsenal');
});

test('a fixture whose teams have barely played still gets numbers, marked low', async () => {
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
  }, NOW);

  assert.deepEqual(
    data.all.map((f) => `${f.home}: ${f.score.confidence}`),
    // Ordered by kickoff, not by whether the model had anything to say.
    ['Arsenal: low', 'Hammarby: baseline', 'Brighton: low'],
  );
  for (const f of data.all) {
    const p = f.score.probabilities;
    assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9, `${f.home} probabilities`);
    assert.ok(p.over25 > 0 && p.under15 > 0);
  }
});

test('a baseline fixture reads as a neutral league-average game', async () => {
  const data = await buildReport(ARGS, {
    ...deps,
    updateHistory: async () => ({ matches: [], daysCached: 0, daysFetched: 0, daysFailed: 0 }),
  }, NOW);

  assert.equal(data.ranked.length, 0, 'nothing to separate, so nothing is shortlisted');
  for (const f of data.all) {
    assert.equal(f.score.confidence, 'baseline');
    const p = f.score.probabilities;
    // Home advantage still applies, so the home side leads a coin-flip.
    assert.ok(p.home > p.away, 'home advantage should survive with no data');
    assert.ok(p.home < 0.6, 'but with no data it must not look like a strong pick');
    assert.ok(f.score.projected.total > 2 && f.score.projected.total < 3.5);
  }
});

test('tier-3 competitions never reach the review list', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  assert.deepEqual(data.review, []);
});

test('markdown renders sections, per-league grouping and the new columns', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  const md = renderMarkdown(data);

  assert.match(md, /# Soccer shortlist/);
  assert.match(md, /## Strong favourites/);
  assert.match(md, /## Most goals expected/);
  assert.match(md, /## Full schedule/);
  assert.match(md, /### England — Premier League · tier 1/);
  assert.match(md, /### Sweden — Damallsvenskan \(Women\) · tier 1/);
  assert.match(md, /\| Time \| Home \| Away \| 1 \| X \| 2 \| xG \| Tot \| O2\.5 \| U1\.5 \| BTTS \|/);
  assert.match(md, /Arsenal \*\(H\)\*/, 'home side must be marked');
  assert.match(md, /Sheffield Utd \*\(A\)\*/, 'away side must be marked');
  assert.match(md, /league tables derived from 20 days of results/);

  assert.ok(!md.includes('Flamengo'), 'non-European games must not appear');
  assert.ok(!md.includes('Barnsley'), 'tier-3 games must not appear');
  assert.ok(!md.includes('U21'), 'youth games must not appear');
});

test('every in-scope fixture appears in the schedule, scored or not', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  const md = renderMarkdown(data);
  for (const name of ['Arsenal', 'Brighton', 'Hammarby']) {
    assert.ok(md.includes(name), `${name} should be in the full schedule`);
  }
  // The data-less one still gets a full row of numbers, marked as baseline.
  assert.match(md, /Hammarby \*\(H\)\*.*○/);
});

test('the schedule is grouped by league and ordered earliest first inside it', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  const groups = groupFixtures(data.all);

  assert.deepEqual(
    groups.map((g) => `${g.country}/${g.league.slug}`),
    ['england/premier-league', 'sweden/damallsvenskan'],
  );
  const times = groups[0].fixtures.map((f) => f.kickoff.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('json carries probabilities, form and the strong-pick set', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  const json = JSON.parse(renderJson(data));

  assert.equal(json.timezone, 'UTC');
  assert.equal(json.games.length, 3, 'every in-scope fixture is exported');
  assert.equal(json.strongPickThreshold, 0.7);

  const arsenal = json.games.find((g) => g.home === 'Arsenal');
  assert.equal(arsenal.league, 'Premier League');
  assert.equal(arsenal.tier, 1);
  const p = arsenal.probabilities;
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
  assert.ok(p.btts >= 0 && p.btts <= 1);
  assert.equal(arsenal.pick.where, 'H');
  assert.ok(arsenal.form.home.streak.length > 0);

  assert.equal(arsenal.confidence, 'high');
  assert.equal(arsenal.basis, 'league table');
  for (const key of ['over15', 'over25', 'over35', 'under15', 'under25']) {
    assert.ok(key in arsenal.probabilities, `probabilities.${key} should be exported`);
  }

  const hammarby = json.games.find((g) => g.home === 'Hammarby');
  assert.equal(hammarby.confidence, 'baseline');
  assert.equal(hammarby.basis, 'league baseline');
  assert.ok(hammarby.probabilities.home > 0);
});

test('strong picks only include sides at or above the threshold', async () => {
  const data = await buildReport(ARGS, deps, NOW);
  for (const f of strongPicks(data.ranked, 0.7)) {
    assert.ok(f.score.pick.probability >= 0.7);
    assert.notEqual(f.score.pick.where, 'D', 'a draw is never a strong pick');
  }
  assert.equal(strongPicks(data.ranked, 0.999).length, 0);
});

test('a history fetch failure degrades the run instead of killing it', async () => {
  const data = await buildReport(ARGS, {
    ...deps,
    updateHistory: async ({ onError }) => {
      onError('day 2026-08-09: feed 503');
      return { matches: [], daysCached: 0, daysFetched: 0, daysFailed: 1 };
    },
  }, NOW);
  assert.equal(data.ranked.length, 0, 'no history means nothing to rank');
  assert.equal(data.all.length, 3, 'but the schedule is still complete');
  assert.ok(data.all.every((f) => f.score.confidence === 'baseline'));
  assert.deepEqual(data.stats.errors, ['day 2026-08-09: feed 503']);
});

test('findRow tolerates accents and punctuation differences', () => {
  const table = [{ team: 'Malmö FF' }, { team: 'IFK Göteborg' }];
  assert.equal(findRow(table, 'Malmo FF').team, 'Malmö FF');
  assert.equal(findRow(table, 'Goteborg').team, 'IFK Göteborg');
  assert.equal(findRow(table, 'Nobody'), null);
});
