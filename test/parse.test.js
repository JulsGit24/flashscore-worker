import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMatches, extractStandings, parseFeed } from '../src/flashscore.js';
import { classifyCompetition, parseTournamentUrl } from '../src/leagues.js';

const dayFeed = await readFile(new URL('../fixtures/sample-day-feed.txt', import.meta.url), 'utf8');
const tableFeed = await readFile(
  new URL('../fixtures/sample-standings-feed.txt', import.meta.url),
  'utf8',
);

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

test('extractStandings reads per-team rows', () => {
  const rows = extractStandings(parseFeed(tableFeed));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], {
    team: 'Arsenal',
    rank: 1,
    played: 20,
    wins: 15,
    draws: 3,
    losses: 2,
    goalsFor: 48,
    goalsAgainst: 14,
    points: 48,
  });
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

test('classifyCompetition keeps tier 1 and 2, men and women', () => {
  for (const [country, slug] of [
    ['england', 'premier-league'],
    ['england', 'championship'],
    ['netherlands', 'eerste-divisie'],
    ['sweden', 'damallsvenskan'],
    ['germany', 'frauen-bundesliga'],
    ['ukraine', 'premier-league'],
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
  ];
  for (const c of cases) {
    const verdict = classifyCompetition(c);
    assert.equal(verdict.include, false, `${c.name} should be excluded`);
    assert.equal(verdict.reason, 'tier-3-or-below', c.name);
  }
});

test('classifyCompetition rejects non-European and non-senior football', () => {
  assert.equal(
    classifyCompetition({ country: 'brazil', slug: 'serie-a', name: 'BRAZIL: Serie A' }).reason,
    'non-european',
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

test('end to end: the sample day feed yields exactly the in-scope games', () => {
  const kept = extractMatches(parseFeed(dayFeed)).filter((m) => {
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    return classifyCompetition({ country, slug, name: m.tournament?.name }).include;
  });
  assert.deepEqual(
    kept.map((m) => `${m.home} v ${m.away}`),
    ['Arsenal v Sheffield Utd', 'Brighton v Man City', 'Hammarby v Vittsjo'],
  );
});
