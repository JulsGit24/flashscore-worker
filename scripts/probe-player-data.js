#!/usr/bin/env node
// Diagnostic: can any public WNBA source supply player game logs and injuries?
//
// The Flashscore feed cannot — its only per-match endpoint returns quarter
// scores. Player props need per-player points/rebounds/assists per game plus a
// record against a specific opponent, so this checks the league's own endpoints
// before any of that gets built. Not part of any run.

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const STATS_HEADERS = {
  'user-agent': UA,
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.wnba.com/',
  origin: 'https://www.wnba.com',
  connection: 'keep-alive',
};

async function probe(label, url, headers = STATS_HEADERS) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    const ms = Date.now() - started;
    let shape = '';
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json?.resultSets) && json.resultSets[0]) {
        const rs = json.resultSets[0];
        shape = `resultSets[0]=${rs.name} headers=${(rs.headers ?? []).slice(0, 12).join(',')} rows=${(rs.rowSet ?? []).length}`;
      } else {
        shape = `keys=${Object.keys(json).slice(0, 12).join(',')}`;
      }
    } catch {
      shape = `non-json, first 120: ${text.slice(0, 120).replace(/\s+/g, ' ')}`;
    }
    console.log(`  ${res.ok ? 'HIT ' : 'MISS'} ${label} -> ${res.status} ${text.length}b ${ms}ms`);
    if (shape) console.log(`        ${shape}`);
    return res.ok;
  } catch (err) {
    console.log(`  ERR  ${label} -> ${err.message}`);
    return false;
  }
}

const season = new Date().getUTCFullYear();

console.log('## WNBA stats API — player game logs\n');
await probe(
  'leaguegamelog (players)',
  `https://stats.wnba.com/stats/leaguegamelog?Counter=100&Direction=DESC&LeagueID=10&PlayerOrTeam=P&Season=${season}&SeasonType=Regular+Season&Sorter=DATE`,
);
await probe(
  'leaguedashplayerstats',
  `https://stats.wnba.com/stats/leaguedashplayerstats?LeagueID=10&Season=${season}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&PaceAdjust=N&PlusMinus=N&Rank=N&Outcome=&Location=&Month=0&SeasonSegment=&DateFrom=&DateTo=&OpponentTeamID=0&VsConference=&VsDivision=&GameSegment=&Period=0&LastNGames=0&TeamID=0`,
);
await probe(
  'leaguedashplayerstats vs one opponent',
  `https://stats.wnba.com/stats/leaguedashplayerstats?LeagueID=10&Season=${season}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&PaceAdjust=N&PlusMinus=N&Rank=N&Outcome=&Location=&Month=0&SeasonSegment=&DateFrom=&DateTo=&OpponentTeamID=1611661319&VsConference=&VsDivision=&GameSegment=&Period=0&LastNGames=0&TeamID=0`,
);
await probe(
  'leaguedashplayerstats last 5 games',
  `https://stats.wnba.com/stats/leaguedashplayerstats?LeagueID=10&Season=${season}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&PaceAdjust=N&PlusMinus=N&Rank=N&Outcome=&Location=&Month=0&SeasonSegment=&DateFrom=&DateTo=&OpponentTeamID=0&VsConference=&VsDivision=&GameSegment=&Period=0&LastNGames=5&TeamID=0`,
);

console.log('\n## CDN — scoreboard and box scores\n');
await probe(
  'todays scoreboard',
  'https://cdn.wnba.com/static/json/liveData/scoreboard/todaysScoreboard_10.json',
  { 'user-agent': UA, accept: '*/*' },
);

console.log('\n## injuries / availability\n');
await probe(
  'commonallplayers',
  `https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=${season}&IsOnlyCurrentSeason=1`,
);
await probe('wnba injuries page', 'https://www.wnba.com/injuries', {
  'user-agent': UA,
  accept: 'text/html',
});
