#!/usr/bin/env node
// WNBA slate: projected points, spread, total and win probability per game,
// with recent form and head-to-head from cached results.
//
// Separate entry point from the soccer report because the model is genuinely
// different — normal margin and total rather than a Poisson scoreline grid —
// and because it runs on its own schedule.

import { SPORT, fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { parseTournamentUrl } from './leagues.js';
import { DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import { buildStandings, headToHead, headToHeadSummary, recentForm } from './basketball/standings.js';
import {
  baselineRow,
  leagueContext,
  linesAtProbability,
  projectGame,
} from './basketball/model.js';
import { fetchQuarters, projectPeriods, quarterProfile } from './basketball/quarters.js';
import { renderJson, renderMarkdown } from './basketball/report.js';
import { collectLocalDay } from './localtime.js';
import { writeReportBundle } from './visual/write.js';
import { wnbaDocument } from './visual/model.js';

export const WNBA_PATH = 'usa/wnba';
export const DEFAULT_CACHE = 'data/wnba-history.json';

/**
 * Versioned separately from the soccer cache, since the two capture different
 * things and change on their own schedules.
 *
 * 3: store the match id and the quarter line score. Under v2 a cached day held
 *    neither, and cached days are never refetched — so the quarter props would
 *    have read empty against every game captured before they existed.
 */
export const WNBA_CACHE_VERSION = 3;

/**
 * Keep only finished WNBA games, and pull each one's quarter splits.
 *
 * The quarter feed is per match, so this costs one extra request per cached
 * game — a handful a day for the WNBA. A game whose splits cannot be read is
 * still kept: it counts toward the table and form, just not toward the quarter
 * profiles.
 */
export async function distilWnbaDay(matches, deps = {}) {
  const getQuarters = deps.fetchQuarters ?? fetchQuarters;
  const finished = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    if (`${country}/${slug}` !== WNBA_PATH) continue;
    finished.push({
      id: m.id ?? null,
      l: WNBA_PATH,
      h: m.home,
      a: m.away,
      hg: m.homeScore,
      ag: m.awayScore,
      ts: m.kickoff ? Math.floor(m.kickoff.getTime() / 1000) : 0,
    });
  }

  await Promise.all(
    finished.map(async (game) => {
      if (!game.id) return;
      try {
        game.quarters = await getQuarters(game.id);
      } catch {
        // A missing split is not worth failing a day's capture over.
        game.quarters = null;
      }
    }),
  );
  return finished;
}

function parseArgs(argv) {
  const args = {
    dayOffset: 0,
    tz: process.env.REPORT_TZ ?? 'America/New_York',
    format: 'both',
    outDir: 'reports',
    cache: DEFAULT_CACHE,
    coverProbability: 0.7,
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
    else if (a === '--cover-probability') args.coverProbability = Number(next());
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
  --cover-probability P  confidence the quoted lines must clear (default 0.7)
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

export async function buildWnbaReport(args, deps = {}, now = new Date()) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getHistory = deps.updateHistory ?? updateHistory;
  const stats = {
    totalGames: 0,
    daysCached: 0,
    daysFetched: 0,
    daysFailed: 0,
    teamsKnown: 0,
    gamesWithQuarters: 0,
    otherDays: 0,
    errors: [],
  };

  const [day, history] = await Promise.all([
    collectLocalDay({
      dayOffset: args.dayOffset,
      tz: args.tz,
      sport: SPORT.basketball,
      now,
      fetchDay: getFixtures,
    }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      sport: SPORT.basketball,
      cacheVersion: WNBA_CACHE_VERSION,
      distil: distilWnbaDay,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  const fixtures = day.onDay;
  stats.totalGames = day.all.length;
  stats.otherDays = day.otherDays;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  const rows = buildStandings(history.matches);
  stats.teamsKnown = rows.length;
  stats.gamesWithQuarters = history.matches.filter((m) => m.quarters).length;
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
      const projection = projectGame(m, homeRow, awayRow, ctx);
      const homeProfile = quarterProfile(history.matches, homeRow.team);
      const awayProfile = quarterProfile(history.matches, awayRow.team);
      return {
        id: m.id,
        tipoff: m.kickoff,
        home: m.home,
        away: m.away,
        homeImage: m.homeImage ?? null,
        awayImage: m.awayImage ?? null,
        projection,
        lines: linesAtProbability(projection, args.coverProbability ?? 0.7),
        periods: projectPeriods(projection, homeProfile, awayProfile),
        quarterSample: Math.min(homeProfile.played, awayProfile.played),
        form: {
          home: recentForm(history.matches, homeRow.team),
          away: recentForm(history.matches, awayRow.team),
        },
        h2h,
        h2hSummary: headToHeadSummary(h2h, homeRow.team),
      };
    })
    .sort((a, b) => (a.tipoff?.getTime() ?? 0) - (b.tipoff?.getTime() ?? 0));

  return { date: day.date, tz: args.tz, games, stats, coverProbability: args.coverProbability ?? 0.7 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const data = await buildWnbaReport(args);
  const { dir, pdf, warning } = await writeReportBundle({
    outDir: args.outDir,
    key: 'wnba',
    date: data.date,
    markdown: renderMarkdown(data),
    json: renderJson(data),
    doc: wnbaDocument(data),
  });

  if (!args.quiet) {
    process.stdout.write(`${renderMarkdown(data)}\n`);
    process.stdout.write(`\nWrote ${dir}/report.{md,json${pdf ? ',pdf' : ''}}\n`);
  }
  if (warning) process.stderr.write(`\n${warning}\n`);

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
