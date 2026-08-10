#!/usr/bin/env node
// WNBA slate: projected points, spread, total and win probability per game,
// with recent form and head-to-head from cached results.
//
// Separate entry point from the soccer report because the model is genuinely
// different — normal margin and total rather than a Poisson scoreline grid —
// and because it runs on its own schedule.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPORT, fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { parseTournamentUrl } from './leagues.js';
import { DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import { buildStandings, headToHead, headToHeadSummary, recentForm } from './basketball/standings.js';
import { baselineRow, leagueContext, projectGame } from './basketball/model.js';
import { renderJson, renderMarkdown } from './basketball/report.js';

export const WNBA_PATH = 'usa/wnba';
export const DEFAULT_CACHE = 'data/wnba-history.json';

/** Keep only finished WNBA games, in the same compact shape the soccer cache uses. */
export function distilWnbaDay(matches) {
  const out = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    if (`${country}/${slug}` !== WNBA_PATH) continue;
    out.push({
      l: WNBA_PATH,
      h: m.home,
      a: m.away,
      hg: m.homeScore,
      ag: m.awayScore,
      ts: m.kickoff ? Math.floor(m.kickoff.getTime() / 1000) : 0,
    });
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    dayOffset: 0,
    tz: process.env.REPORT_TZ ?? 'America/New_York',
    format: 'both',
    outDir: 'reports',
    cache: DEFAULT_CACHE,
    retain: DEFAULT_RETAIN_DAYS,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--day-offset') args.dayOffset = Number(next());
    else if (a === '--tz') args.tz = next();
    else if (a === '--format') args.format = next();
    else if (a === '--out') args.outDir = next();
    else if (a === '--cache') args.cache = next();
    else if (a === '--retain') args.retain = Number(next());
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
flashscore-worker — WNBA slate with projected spread, total and win probability

  node src/wnba.js [options]

  --day-offset N   0 = today (default), 1 = tomorrow, -1 = yesterday
  --tz ZONE        IANA timezone for tip-off times (default $REPORT_TZ or America/New_York)
  --format md|json|both
  --out DIR        output root (default reports/; files land in <root>/wnba/)
  --cache PATH     results history cache (default ${DEFAULT_CACHE})
  --retain N       days of results history to keep (default ${DEFAULT_RETAIN_DAYS})
  --quiet          write files only, no stdout

Player props and injuries are not produced: the feed carries team scores and
quarter splits only. See the README.

Environment: FS_HOST, FS_PROJECT, FS_SIGN, FS_LANG, FS_REFERER override the
feed endpoint. Current defaults:
  host=${DEFAULTS.host} project=${DEFAULTS.project} lang=${DEFAULTS.lang}
`;

function findRow(rows, name) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  if (!target) return null;
  return (
    rows.find((r) => norm(r.team) === target) ??
    rows.find((r) => {
      const t = norm(r.team);
      return t.includes(target) || target.includes(t);
    }) ??
    null
  );
}

export async function buildWnbaReport(args, deps = {}) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getHistory = deps.updateHistory ?? updateHistory;
  const stats = {
    totalGames: 0,
    daysCached: 0,
    daysFetched: 0,
    daysFailed: 0,
    teamsKnown: 0,
    errors: [],
  };

  const [fixtures, history] = await Promise.all([
    getFixtures({ dayOffset: args.dayOffset, sport: SPORT.basketball }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      sport: SPORT.basketball,
      distil: distilWnbaDay,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  stats.totalGames = fixtures.length;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  const rows = buildStandings(history.matches);
  stats.teamsKnown = rows.length;
  const ctx = leagueContext(rows);

  const games = fixtures
    .filter((m) => {
      const { country, slug } = parseTournamentUrl(m.tournament?.url);
      return `${country}/${slug}` === WNBA_PATH;
    })
    .map((m) => {
      const homeRow = findRow(rows, m.home) ?? baselineRow(m.home);
      const awayRow = findRow(rows, m.away) ?? baselineRow(m.away);
      const h2h = headToHead(history.matches, homeRow.team, awayRow.team);
      return {
        id: m.id,
        tipoff: m.kickoff,
        home: m.home,
        away: m.away,
        projection: projectGame(m, homeRow, awayRow, ctx),
        form: {
          home: recentForm(history.matches, homeRow.team),
          away: recentForm(history.matches, awayRow.team),
        },
        h2h,
        h2hSummary: headToHeadSummary(h2h, homeRow.team),
      };
    })
    .sort((a, b) => (a.tipoff?.getTime() ?? 0) - (b.tipoff?.getTime() ?? 0));

  const date = new Date(Date.now() + args.dayOffset * 86400000).toISOString().slice(0, 10);
  return { date, tz: args.tz, games, stats };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const data = await buildWnbaReport(args);
  const outDir = path.join(args.outDir, 'wnba');
  await mkdir(outDir, { recursive: true });

  if (args.format === 'md' || args.format === 'both') {
    const md = renderMarkdown(data);
    await writeFile(path.join(outDir, `${data.date}.md`), md);
    if (!args.quiet) process.stdout.write(`${md}\n`);
  }
  if (args.format === 'json' || args.format === 'both') {
    await writeFile(path.join(outDir, `${data.date}.json`), renderJson(data));
  }

  if (data.stats.errors.length) {
    process.stderr.write(
      `\n${data.stats.errors.length} non-fatal errors:\n` +
        data.stats.errors.slice(0, 20).map((e) => `  - ${e}`).join('\n') +
        '\n',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
