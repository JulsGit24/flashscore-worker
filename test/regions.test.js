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
  minConfidence: 'low',
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

test('Asia is limited to Japan, Korea and China, plus the AFC pseudo-country', () => {
  // "asia" is not a country — it is where the feed files AFC club competitions.
  assert.deepEqual([...REGION_COUNTRIES.asia].sort(), ['asia', 'china', 'japan', 'south-korea']);
});

test('confederation pseudo-countries are filed under the right report', async () => {
  const { regionOf } = await import('../src/leagues.data.js');
  assert.equal(regionOf('europe'), 'europe');
  assert.equal(regionOf('south-america'), 'americas');
  assert.equal(regionOf('north-central-america'), 'americas');
  assert.equal(regionOf('asia'), 'asia');
  // Oceania and the catch-all "world" bucket stay out of every report.
  assert.equal(regionOf('australia-oceania'), null);
  assert.equal(regionOf('world'), null);
});

test('international competitions classify with a kind and no tier', async () => {
  const { classifyCompetition } = await import('../src/leagues.js');
  const cases = [
    ['europe', 'champions-league', 'europe'],
    ['europe', 'conference-league', 'europe'],
    ['europe', 'champions-league-women', 'europe'],
    ['north-central-america', 'leagues-cup', 'americas'],
    ['asia', 'afc-champions-league-elite', 'asia'],
  ];
  for (const [country, slug, region] of cases) {
    const v = classifyCompetition({ country, slug, name: slug });
    assert.equal(v.include, true, `${country}/${slug}`);
    assert.equal(v.league.kind, 'international', `${country}/${slug} kind`);
    assert.equal(v.league.tier, null, 'an international competition has no tier');
    assert.equal(v.league.region, region);
  }
});

test('a pre-season invitational is not treated as a continental tie', async () => {
  const { classifyCompetition } = await import('../src/leagues.js');
  const v = classifyCompetition({
    country: 'europe',
    slug: 'emirates-cup',
    name: 'EUROPE: Emirates Cup',
  });
  assert.equal(v.include, false);
  assert.equal(v.reason, 'not-competitive');
});

test('continental youth competitions are still excluded', async () => {
  const { classifyCompetition } = await import('../src/leagues.js');
  assert.equal(
    classifyCompetition({
      country: 'north-central-america',
      slug: 'concacaf-championship-u20',
      name: 'NORTH & CENTRAL AMERICA: CONCACAF Championship U20',
    }).reason,
    'not-senior-football',
  );
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

test('countries outside every region are recorded as a diagnostic', async () => {
  const data = await buildReport({ ...BASE, region: 'europe' }, deps);
  assert.deepEqual(data.stats.outOfRegion, ['nigeria']);
});

test('explicitly excluded slugs are dropped even though they look top-flight', async () => {
  const { classifyCompetition } = await import('../src/leagues.js');
  // Chile's second tier is Primera B; its "Segunda División" is the third.
  assert.equal(
    classifyCompetition({
      country: 'chile',
      slug: 'segunda-division',
      name: 'CHILE: Segunda Division',
    }).reason,
    'tier-3-or-below',
  );
  // Uruguay's Segunda División really is the second tier, and still gets in.
  assert.equal(
    classifyCompetition({
      country: 'uruguay',
      slug: 'segunda-division',
      name: 'URUGUAY: Segunda Division',
    }).include,
    true,
  );
});

test('international competitions render in their own block, after the domestic ones', async () => {
  const { groupFixtures, renderMarkdown, competitionLabel } = await import('../src/report.js');

  const mk = (url, name, home, away, hour) => ({
    tournament: { url, name },
    home,
    away,
    homeScore: null,
    awayScore: null,
    kickoff: new Date(day(10) * 1000 + hour * 3600 * 1000),
  });
  const data = await buildReport(
    { ...BASE, region: 'europe' },
    {
      // The continental tie kicks off first, so ordering by time alone would
      // put it at the top; the domestic block must still come first.
      fetchDayFixtures: async () => [
        mk('/football/europe/champions-league/', 'EUROPE: Champions League', 'Celje', 'Ararat', 1),
        mk('/football/england/premier-league/', 'ENGLAND: Premier League', 'Arsenal', 'Chelsea', 5),
      ],
      updateHistory: async () => ({ matches: [], daysCached: 7, daysFetched: 0, daysFailed: 0 }),
    },
  );

  assert.equal(data.all.length, 2, 'a continental tie is in scope for its region');

  const groups = groupFixtures(data.all);
  assert.deepEqual(
    groups.map((g) => g.league.kind ?? 'domestic'),
    ['domestic', 'international'],
  );

  const md = renderMarkdown(data);
  assert.match(md, /### England — Premier League · tier 1/);
  assert.match(md, /### Champions League · international/);
  assert.ok(
    md.indexOf('England — Premier League') < md.indexOf('Champions League · international'),
    'the domestic block comes first',
  );
  // An international competition is never labelled with a country or a tier.
  assert.ok(!md.includes('Europe — Champions League'));
  assert.equal(competitionLabel({ kind: 'international', name: 'Champions League' }), 'Champions League');
  assert.equal(
    competitionLabel({ country: 'england', name: 'Premier League' }),
    'England Premier League',
  );
});

test('a continental tie lands only in its own region report', async () => {
  const deps2 = {
    fetchDayFixtures: async () => [
      {
        tournament: { url: '/football/europe/champions-league/', name: 'EUROPE: Champions League' },
        home: 'Celje',
        away: 'Ararat',
        homeScore: null,
        awayScore: null,
        kickoff: new Date(day(10) * 1000),
      },
      {
        tournament: { url: '/football/north-central-america/leagues-cup/', name: 'N&C AMERICA: Leagues Cup' },
        home: 'Columbus Crew',
        away: 'Atlas',
        homeScore: null,
        awayScore: null,
        kickoff: new Date(day(10) * 1000),
      },
    ],
    updateHistory: async () => ({ matches: [], daysCached: 7, daysFetched: 0, daysFailed: 0 }),
  };

  const europe = await buildReport({ ...BASE, region: 'europe' }, deps2);
  const americas = await buildReport({ ...BASE, region: 'americas' }, deps2);
  assert.deepEqual(europe.all.map((f) => f.home), ['Celje']);
  assert.deepEqual(americas.all.map((f) => f.home), ['Columbus Crew']);
});
