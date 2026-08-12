import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { COUNTRY_FLAG, countryFlag, imageUrl } from '../src/images.js';
import { escapeHtml, monogram, renderHtml } from '../src/visual/render.js';
import { mlbDocument, soccerDocument, wnbaDocument } from '../src/visual/model.js';
import { writeReportBundle } from '../src/visual/write.js';
import { extractMatches, parseFeed } from '../src/flashscore.js';
import { REGION_COUNTRIES } from '../src/leagues.data.js';

// --- image handles -----------------------------------------------------------

test('a feed image filename becomes an absolute URL', () => {
  assert.equal(
    imageUrl('61kdErlC-tAokhjfk.png'),
    'https://static.flashscore.com/res/image/data/61kdErlC-tAokhjfk.png',
  );
  assert.equal(imageUrl(' UoU2rlWH-b1rYEKF1.png '), imageUrl('UoU2rlWH-b1rYEKF1.png'));
});

test('anything that is not a filename is refused rather than concatenated', () => {
  // A broken image icon is uglier than no image, so these must return null and
  // fall through to the monogram.
  for (const bad of [null, undefined, '', 'not a file', '../../etc/passwd', 'x.png?a=b',
    'https://evil.example/x.png', 'file.exe', 42, {}]) {
    assert.equal(imageUrl(bad), null, `${JSON.stringify(bad)} should not produce a URL`);
  }
});

test('the parser carries image handles through from the feed', () => {
  const feed =
    'ZA÷ENGLAND: Premier League¬ZL÷/soccer/england/premier-league/¬ZY÷England¬OAJ÷comp1.png¬~' +
    'AA÷m1¬AD÷1786100400¬AE÷Arsenal¬AF÷Chelsea¬OA÷home1.png¬OB÷away1.png¬~';
  const [m] = extractMatches(parseFeed(feed));
  assert.equal(m.homeImage, 'home1.png');
  assert.equal(m.awayImage, 'away1.png');
  assert.equal(m.tournament.image, 'comp1.png');
});

test('a feed without image fields still parses, with nulls', () => {
  const feed = 'ZA÷X¬ZL÷/soccer/england/premier-league/¬~AA÷m1¬AD÷1786100400¬AE÷A¬AF÷B¬~';
  const [m] = extractMatches(parseFeed(feed));
  assert.equal(m.homeImage, null);
  assert.equal(m.tournament.image, null);
});

// --- flags -------------------------------------------------------------------

test('every country in every region has a flag', () => {
  for (const countries of Object.values(REGION_COUNTRIES)) {
    for (const c of countries) {
      assert.ok(COUNTRY_FLAG[c], `${c} has no flag`);
    }
  }
});

test('an unknown country gets the neutral flag rather than blank space', () => {
  assert.equal(countryFlag('atlantis'), '🏳️');
  assert.equal(countryFlag(''), '');
  assert.equal(countryFlag('england'), '🏴󠁧󠁢󠁥󠁮󠁧󠁿');
});

// --- rendering primitives ----------------------------------------------------

test('team names are escaped, so a name cannot inject markup', () => {
  assert.equal(escapeHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.equal(escapeHtml('Nott\'m & "Forest"'), 'Nott\'m &amp; &quot;Forest&quot;');
});

test('a monogram is two letters where there are two words', () => {
  assert.equal(monogram('New York Yankees'), 'NY');
  assert.equal(monogram('Arsenal'), 'AR');
  // The feed writes "St.Louis" without a space; the period is a word break, so
  // this reads SL. That is a fine monogram — the point is two stable letters.
  assert.equal(monogram('St.Louis Cardinals'), 'SL');
  assert.equal(monogram(''), '?');
});

// --- documents ---------------------------------------------------------------

const soccerData = {
  date: '2026-08-12',
  tz: 'UTC',
  regionLabel: 'Europe',
  strongPickThreshold: 0.7,
  stats: { totalFixtures: 100, tablesLoaded: 20, daysCached: 7 },
  all: [
    {
      kickoff: new Date('2026-08-12T18:00:00Z'),
      home: 'Arsenal',
      away: 'Chelsea',
      homeImage: 'h.png',
      awayImage: 'a.png',
      tournament: { image: 'comp.png' },
      league: { country: 'england', slug: 'premier-league', tier: 1, name: 'Premier League' },
      form: {
        home: { streak: 'WWDLW', played: 5, goalsFor: 9, goalsAgainst: 4 },
        away: { streak: 'LLDWW', played: 5, goalsFor: 5, goalsAgainst: 7 },
      },
      score: {
        confidence: 'high',
        projected: { home: 2.1, away: 0.9, total: 3.0 },
        probabilities: { home: 0.72, draw: 0.18, away: 0.1, btts: 0.5, over25: 0.6, under15: 0.1 },
        pick: { side: 'Arsenal', where: 'H', probability: 0.72 },
        tags: ['HIGH_GOALS', 'TOP_VS_BOTTOM'],
      },
    },
  ],
};
soccerData.ranked = soccerData.all;

test('the soccer document carries crests, a flag and a competition logo', () => {
  const doc = soccerDocument(soccerData);
  assert.equal(doc.sport, 'soccer');
  assert.match(doc.title, /Europe/);

  const g = doc.groups[0];
  assert.equal(g.flag, COUNTRY_FLAG.england);
  assert.equal(g.logo, imageUrl('comp.png'));

  const c = g.cards[0];
  assert.equal(c.home.crest, imageUrl('h.png'));
  assert.equal(c.away.crest, imageUrl('a.png'));
  assert.equal(c.strong, true, '72% is above the 70% threshold');
  assert.deepEqual(c.bars.map((b) => b.label), ['1', 'X', '2']);
  assert.equal(c.form.home.streak, 'WWDLW');
  assert.match(c.form.home.sub, /9-4 goals/);
});

test('machine tag codes are rewritten for a person', () => {
  const doc = soccerDocument(soccerData);
  const tags = doc.groups[0].cards[0].tags;
  assert.ok(tags.includes('goals expected'), tags.join(','));
  assert.ok(tags.includes('top v bottom'));
  assert.ok(!tags.some((t) => t.includes('_')), 'no raw code should survive');
});

test('outcome bars account for all the probability', () => {
  for (const doc of [soccerDocument(soccerData), mlbDocument(mlbData), wnbaDocument(wnbaData)]) {
    for (const g of doc.groups) {
      for (const c of g.cards) {
        const total = c.bars.reduce((s, b) => s + b.pct, 0);
        assert.ok(Math.abs(total - 1) < 0.02, `${doc.sport} bars sum to ${total}`);
      }
    }
  }
});

const wnbaData = {
  date: '2026-08-12',
  tz: 'UTC',
  coverProbability: 0.7,
  stats: { totalGames: 5, teamsKnown: 12, daysCached: 30, gamesWithQuarters: 4 },
  games: [
    {
      tipoff: new Date('2026-08-12T23:00:00Z'),
      home: 'Aces',
      away: 'Sky',
      homeImage: 'h.png',
      awayImage: null,
      projection: {
        confidence: 'high',
        points: { home: 88, away: 79, total: 167 },
        total: { projected: 167 },
        spread: { favourite: 'Aces', line: -9 },
        winProbability: { home: 0.78, away: 0.22 },
        strengthGap: 6.2,
      },
      lines: { totalOver: 158.5 },
      form: { home: { streak: 'WWW', played: 3, pointsFor: 260, pointsAgainst: 230 }, away: { streak: 'LLL', played: 3, pointsFor: 200, pointsAgainst: 250 } },
      h2hSummary: { played: 2, aWins: 2, bWins: 0 },
    },
  ],
};

const mlbData = {
  date: '2026-08-12',
  tz: 'UTC',
  coverProbability: 0.7,
  stats: { totalGames: 40, teamsKnown: 30, daysCached: 7, otherDays: 12 },
  games: [
    {
      first: new Date('2026-08-12T23:05:00Z'),
      home: 'Yankees',
      away: 'Red Sox',
      homeImage: 'h.png',
      awayImage: 'a.png',
      projection: {
        confidence: 'high',
        runs: { home: 5.2, away: 3.9, total: 9.1 },
        total: { projected: 9.1, overUnder: [{ line: 8.5, over: 0.55 }] },
        runLine: { favourite: 'Yankees', coverProbability: 0.42 },
        winProbability: { home: 0.66, away: 0.34 },
        firstFive: { total: { projected: 5.1 } },
        strengthGap: 1.4,
      },
      lines: { totalOver: 6.5 },
      form: { home: { streak: 'WWLWW', played: 5, pointsFor: 30, pointsAgainst: 18 }, away: { streak: 'LWLLL', played: 5, pointsFor: 15, pointsAgainst: 26 } },
      h2hSummary: { played: 3, aWins: 3, bWins: 0 },
    },
  ],
};

test('the MLB document states the pitcher caveat, every time', () => {
  const doc = mlbDocument(mlbData);
  assert.equal(doc.sport, 'baseball');
  const text = JSON.stringify(doc.caveats);
  assert.match(text, /starting pitcher/i);
});

test('the WNBA document states the props caveat, every time', () => {
  const doc = wnbaDocument(wnbaData);
  assert.equal(doc.sport, 'basketball');
  assert.match(JSON.stringify(doc.caveats), /[Pp]layer props/);
});

test('an empty slate still produces a valid document', () => {
  for (const doc of [
    mlbDocument({ ...mlbData, games: [] }),
    wnbaDocument({ ...wnbaData, games: [] }),
    soccerDocument({ ...soccerData, all: [], ranked: [] }),
  ]) {
    assert.deepEqual(doc.groups, []);
    assert.ok(doc.highlights.every((h) => h.emptyNote), 'every empty section explains itself');
    const html = renderHtml(doc);
    assert.match(html, /<!doctype html>/);
  }
});

// --- the page ----------------------------------------------------------------

test('the page renders every card, with crests and escaped names', () => {
  const html = renderHtml(soccerDocument(soccerData));
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Soccer shortlist — Europe/);
  assert.ok(html.includes(imageUrl('h.png')), 'home crest is on the page');
  assert.ok(html.includes(COUNTRY_FLAG.england), 'the flag is on the page');
  assert.match(html, /@page \{ size: A4/, 'it is laid out for paper');
  assert.match(html, /break-inside: avoid/, 'cards must not straddle a page break');
});

test('a hostile team name cannot inject markup into the page', () => {
  const hostile = structuredClone(soccerData);
  hostile.all[0].home = '<img src=x onerror=alert(1)>';
  hostile.ranked = hostile.all;
  const html = renderHtml(soccerDocument(hostile));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'raw markup must not survive');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

// --- the bundle on disk ------------------------------------------------------

test('a bundle is one dated folder holding the report files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fs-bundle-'));
  const result = await writeReportBundle({
    outDir: root,
    key: 'europe',
    date: '2026-08-12',
    markdown: '# hello',
    json: '{"a":1}',
    doc: soccerDocument(soccerData),
  });

  assert.equal(result.dir, path.join(root, 'europe', '2026-08-12'));
  const files = (await readdir(result.dir)).sort();

  assert.ok(files.includes('report.md'));
  assert.ok(files.includes('report.json'));
  assert.equal(await readFile(path.join(result.dir, 'report.md'), 'utf8'), '# hello');

  // The PDF needs a browser. Where there is one it must be written; where there
  // is not, the HTML must be kept and the caller warned rather than the visual
  // report being silently lost.
  if (result.pdf) {
    assert.ok(files.includes('report.pdf'));
    assert.equal(result.warning, undefined);
  } else {
    assert.ok(files.includes('report.html'), 'the HTML is the fallback');
    assert.match(result.warning, /PDF not written/);
  }
});
