import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport } from '../src/index.js';
import { renderJson, renderMarkdown } from '../src/report.js';
import { LEAGUES, REGIONS, REGION_COUNTRIES, regionOf } from '../src/leagues.data.js';

const BASE = {
  dayOffset: 0,
  min: 3,
  threshold: 45,
  tz: 'UTC',
  format: 'both',
  cache: 'unused',
  retain: 400,
  minPlayed: 3,
  strongPick: 0.7,
};

const DAY = 86400;
const day = (n) => 1_700_000_000 + n * DAY;

/** One fixture per region, plus one that is out of scope entirely. */
function worldFixtures() {
  const mk = (url, name, home, away, hour) => ({
    tournament: { url, name },
    home,
    away,
    homeScore: null,
    awayScore: null,
    kickoff: new Date(day(10) * 1000 + hour * 3600 * 1000),
  });
  return [
    mk('/football/england/premier-league/', 'ENGLAND: Premier League', 'Arsenal', 'Chelsea', 1),
    mk('/football/brazil/serie-a/', 'BRAZIL: Serie A', 'Flamengo', 'Palmeiras', 2),
    mk('/football/usa/mls/', 'USA: MLS', 'LAFC', 'Seattle', 3),
    mk('/football/japan/j1-league/', 'JAPAN: J1 League', 'Kashima', 'Urawa', 4),
    mk('/football/china/super-league/', 'CHINA: Super League', 'Shanghai', 'Beijing', 5),
    mk('/football/nigeria/npfl/', 'NIGERIA: NPFL', 'Enyimba', 'Kano', 6),
    mk('/football/england/league-one/', 'ENGLAND: League One', 'Barnsley', 'Wigan', 7),
  ];
}

const deps = {
  fetchDayFixtures: async () => worldFixtures(),
  updateHistory: async () => ({ matches: [], daysCached: 7, daysFetched: 0, daysFailed: 0 }),
};

test('every league carries a region that exists', () => {
  for (const league of LEAGUES) {
    assert.ok(REGIONS.includes(league.region), `${league.country}/${league.slug}`);
    assert.equal(
      regionOf(league.country),
      league.region,
      `${league.country} is filed under a region its leagues do not share`,
    );
  }
});

test('the three region country sets do not overlap', () => {
  const seen = new Map();
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    for (const c of countries) {
      assert.ok(!seen.has(c), `${c} is in both ${seen.get(c)} and ${region}`);
      seen.set(c, region);
    }
  }
});

test('Asia is limited to Japan, Korea and China', () => {
  assert.deepEqual([...REGION_COUNTRIES.asia].sort(), ['china', 'japan', 'south-korea']);
});

test('each region report contains only its own fixtures', async () => {
  const expected = {
    europe: ['Arsenal v Chelsea'],
    americas: ['Flamengo v Palmeiras', 'LAFC v Seattle'],
    asia: ['Kashima v Urawa', 'Shanghai v Beijing'],
  };

  for (const region of REGIONS) {
    const data = await buildReport({ ...BASE, region }, deps);
    assert.deepEqual(
      data.all.map((f) => `${f.home} v ${f.away}`),
      expected[region],
      `${region} report contents`,
    );
    // Out-of-region and tier-3 games appear in no report at all.
    const names = data.all.map((f) => f.home);
    assert.ok(!names.includes('Enyimba'), `${region} leaked an out-of-region game`);
    assert.ok(!names.includes('Barnsley'), `${region} leaked a tier-3 game`);
  }
});

test('each region report is titled and tagged for that region', async () => {
  const titles = {
    europe: /# Soccer shortlist — Europe —/,
    americas: /# Soccer shortlist — the Americas —/,
    asia: /# Soccer shortlist — Asia —/,
  };
  for (const region of REGIONS) {
    const data = await buildReport({ ...BASE, region }, deps);
    assert.match(renderMarkdown(data), titles[region]);
    assert.equal(JSON.parse(renderJson(data)).region, region);
  }
});

test('the Americas report groups by country, so Brazil and the USA stay apart', async () => {
  const data = await buildReport({ ...BASE, region: 'americas' }, deps);
  const md = renderMarkdown(data);
  assert.match(md, /### Brazil — Serie A · tier 1/);
  assert.match(md, /### USA — MLS · tier 1/);
  assert.ok(!md.includes('Kashima'), 'Asian fixtures must not appear in the Americas report');
});

test('country names render properly, not just title-cased slugs', async () => {
  const { prettyCountry } = await import('../src/report.js');
  assert.equal(prettyCountry('usa'), 'USA');
  assert.equal(prettyCountry('south-korea'), 'South Korea');
  assert.equal(prettyCountry('trinidad-and-tobago'), 'Trinidad and Tobago');
  assert.equal(prettyCountry('japan'), 'Japan');
  assert.equal(prettyCountry('north-macedonia'), 'North Macedonia');
});
