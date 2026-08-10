import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMatches, parseFeed } from '../src/flashscore.js';
import { classifyCompetition, parseTournamentUrl } from '../src/leagues.js';

const dayFeed = await readFile(new URL('../fixtures/sample-day-feed.txt', import.meta.url), 'utf8');

test('parseFeed splits records and key/value pairs', () => {
  const records = parseFeed('AA÷1¬AE÷Home¬AF÷Away¬~AA÷2¬AE÷X¬AF÷Y¬~');
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], { AA: '1', AE: 'Home', AF: 'Away' });
});

test('parseFeed keeps values containing the key separator', () => {
  const [record] = parseFeed('ZL÷/soccer/england/premier-league/¬~');
  assert.equal(record.ZL, '/soccer/england/premier-league/');
});

test('extractMatches attaches each match to its preceding tournament header', () => {
  const matches = extractMatches(parseFeed(dayFeed));
  assert.equal(matches.length, 6);
  const [first] = matches;
  assert.equal(first.home, 'Arsenal');
  assert.equal(first.away, 'Sheffield Utd');
  assert.equal(first.tournament.url, '/soccer/england/premier-league/');
  assert.equal(first.tournament.stageId, 'Gj8O2bF5');
  assert.equal(first.kickoff.toISOString(), new Date(1786100400 * 1000).toISOString());

  const brazil = matches.find((m) => m.home === 'Flamengo');
  assert.equal(brazil.tournament.country, 'Brazil');
});

test('parseTournamentUrl pulls country and league slug', () => {
  assert.deepEqual(parseTournamentUrl('/soccer/england/premier-league/'), {
    country: 'england',
    slug: 'premier-league',
  });
  assert.deepEqual(parseTournamentUrl('/football/sweden/allsvenskan/results/'), {
    country: 'sweden',
    slug: 'allsvenskan',
  });
  assert.deepEqual(parseTournamentUrl(null), { country: null, slug: null });
});

test('parseTournamentUrl drops the sport segment for any sport', () => {
  // Basketball shares the shape, so the WNBA must not parse as country
  // "basketball", league "usa".
  assert.deepEqual(parseTournamentUrl('/basketball/usa/wnba/'), {
    country: 'usa',
    slug: 'wnba',
  });
  assert.deepEqual(parseTournamentUrl('/hockey/finland/liiga/'), {
    country: 'finland',
    slug: 'liiga',
  });
  // A path with no sport prefix is read as country-first.
  assert.deepEqual(parseTournamentUrl('/spain/laliga/'), {
    country: 'spain',
    slug: 'laliga',
  });
});

test('classifyCompetition keeps tier 1 and 2, men and women', () => {
  for (const [country, slug] of [
    ['england', 'premier-league'],
    ['england', 'championship'],
    ['netherlands', 'eerste-divisie'],
    ['sweden', 'damallsvenskan'],
    ['germany', 'frauen-bundesliga'],
    ['ukraine', 'premier-league'],
    // Slugs corrected against live feed URLs, and second tiers the feed labels
    // "Division 1" — these must survive the tier-3 regexes.
    ['poland', 'division-1'],
    ['bulgaria', 'efbet-league'],
    ['lithuania', 'toplyga'],
    ['iceland', 'besta-deild-karla'],
    ['faroe-islands', 'premier-league'],
    ['gibraltar', 'national-league'],
    ['belarus', 'vysshaya-liga-women'],
  ]) {
    const verdict = classifyCompetition({ country, slug, name: slug });
    assert.equal(verdict.include, true, `${country}/${slug} should be included`);
  }
});

test('classifyCompetition rejects tier 3 and below', () => {
  const cases = [
    { country: 'england', slug: 'league-one', name: 'ENGLAND: League One' },
    { country: 'england', slug: 'league-two', name: 'ENGLAND: League Two' },
    { country: 'germany', slug: '3-liga', name: 'GERMANY: 3. Liga' },
    { country: 'germany', slug: 'regionalliga-nord', name: 'GERMANY: Regionalliga Nord' },
    { country: 'italy', slug: 'serie-c', name: 'ITALY: Serie C' },
    { country: 'spain', slug: 'primera-federacion', name: 'SPAIN: Primera Federación' },
    { country: 'poland', slug: 'ii-liga', name: 'POLAND: II liga' },
    { country: 'france', slug: 'national-2', name: 'FRANCE: National 2' },
    { country: 'norway', slug: 'division-3-group-4', name: 'NORWAY: Division 3 - Group 4' },
    { country: 'iceland', slug: 'division-2', name: 'ICELAND: Division 2' },
    {
      country: 'england',
      slug: 'isthmian-league-premier-division',
      name: 'ENGLAND: Isthmian League Premier Division',
    },
  ];
  for (const c of cases) {
    const verdict = classifyCompetition(c);
    assert.equal(verdict.include, false, `${c.name} should be excluded`);
    assert.equal(verdict.reason, 'tier-3-or-below', c.name);
  }
});

test('classifyCompetition rejects out-of-region and non-senior football', () => {
  // Africa and Oceania are in no configured region.
  assert.equal(
    classifyCompetition({ country: 'nigeria', slug: 'npfl', name: 'NIGERIA: NPFL' }).reason,
    'out-of-region',
  );
  assert.equal(
    classifyCompetition({ country: 'australia', slug: 'a-league', name: 'AUSTRALIA: A-League' }).reason,
    'out-of-region',
  );
  assert.equal(
    classifyCompetition({
      country: 'england',
      slug: 'premier-league-2-u21',
      name: 'ENGLAND: Premier League 2 U21',
    }).reason,
    'not-senior-football',
  );
  assert.equal(
    classifyCompetition({ country: 'spain', slug: 'friendlies', name: 'Club Friendlies' }).reason,
    'not-senior-football',
  );
});

test('an unknown European league is queued for review, not silently dropped', () => {
  const verdict = classifyCompetition({
    country: 'england',
    slug: 'fa-cup',
    name: 'ENGLAND: FA Cup',
  });
  assert.equal(verdict.include, false);
  assert.equal(verdict.reason, 'needs-review');
});

test('classifyCompetition tags each league with its region', () => {
  const cases = [
    ['england', 'premier-league', 'europe'],
    ['brazil', 'serie-a', 'americas'],
    ['usa', 'mls', 'americas'],
    ['mexico', 'liga-mx', 'americas'],
    ['japan', 'j1-league', 'asia'],
    ['south-korea', 'k-league-1', 'asia'],
    ['china', 'super-league', 'asia'],
  ];
  for (const [country, slug, region] of cases) {
    const verdict = classifyCompetition({ country, slug, name: slug });
    assert.equal(verdict.include, true, `${country}/${slug} should be included`);
    assert.equal(verdict.league.region, region, `${country}/${slug} region`);
  }
});

test('classifyCompetition rejects tier 3 in the Americas and Asia too', () => {
  const cases = [
    { country: 'japan', slug: 'j3-league', name: 'JAPAN: J3 League' },
    { country: 'south-korea', slug: 'k3-league', name: 'SOUTH KOREA: K3 League' },
    { country: 'china', slug: 'league-two', name: 'CHINA: League Two' },
    { country: 'brazil', slug: 'serie-c', name: 'BRAZIL: Serie C' },
    { country: 'usa', slug: 'usl-league-one', name: 'USA: USL League One' },
    { country: 'mexico', slug: 'liga-premier', name: 'MEXICO: Liga Premier' },
    {
      country: 'argentina',
      slug: 'primera-b-metropolitana',
      name: 'ARGENTINA: Primera B Metropolitana',
    },
  ];
  for (const c of cases) {
    assert.equal(classifyCompetition(c).reason, 'tier-3-or-below', c.name);
  }
});

test('second tiers that look like third tiers elsewhere still get in', () => {
  // "China League One" is the second tier; "USL Championship" likewise.
  for (const [country, slug, name] of [
    ['china', 'league-one', 'CHINA: League One'],
    ['usa', 'usl-championship', 'USA: USL Championship'],
    ['south-korea', 'k-league-2', 'SOUTH KOREA: K League 2'],
  ]) {
    assert.equal(classifyCompetition({ country, slug, name }).include, true, name);
  }
});

test('end to end: the sample day feed yields exactly the in-scope games', () => {
  const kept = extractMatches(parseFeed(dayFeed)).filter((m) => {
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    const v = classifyCompetition({ country, slug, name: m.tournament?.name });
    return v.include && v.league.region === 'europe';
  });
  assert.deepEqual(
    kept.map((m) => `${m.home} v ${m.away}`),
    ['Arsenal v Sheffield Utd', 'Brighton v Man City', 'Hammarby v Vittsjo'],
  );
});
