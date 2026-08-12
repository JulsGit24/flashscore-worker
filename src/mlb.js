#!/usr/bin/env node
// MLB slate: projected runs, win probability, run line, totals and team totals
// per game, with recent form and head-to-head from cached results.
//
// Third entry point in the repo, and a third model — see baseball/model.js for
// why baseball runs are neither Poisson like soccer goals nor normal like
// basketball points.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPORT, fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { parseTournamentUrl } from './leagues.js';
import { DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import { buildStandings, headToHead, headToHeadSummary, recentForm } from './baseball/standings.js';
import { baselineRow, leagueContext, linesAtProbability, projectGame } from './baseball/model.js';
import { renderJson, renderMarkdown } from './baseball/report.js';
import { collectLocalDay } from './localtime.js';

export const MLB_PATH = 'usa/mlb';
export const DEFAULT_CACHE = 'data/mlb-history.json';

/**
 * Versioned separately from the soccer and WNBA caches, since all three capture
 * different things and change on their own schedules.
 *
 * 1: final scores only. Baseball's per-match detail feed has not been probed
 *    from an environment that can reach it, so nothing inning-level is stored;
 *    if that changes, bump this so cached days are refetched rather than read
 *    as empty — the mistake the WNBA cache made at v2.
 */
export const MLB_CACHE_VERSION = 1;

/** Keep only finished MLB games. */
export function distilMlbDay(matches) {
  const finished = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    if (`${country}/${slug}` !== MLB_PATH) continue;
    finished.push({
      id: m.id ?? null,
      l: MLB_PATH,
      h: m.home,
      a: m.away,
      hg: m.homeScore,
      ag: m.awayScore,
      ts: m.kickoff ? Math.floor(m.kickoff.getTime() / 1000) : 0,
    });
  }
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
flashscore-worker — MLB slate with projected runs, win probability and totals

  node src/mlb.js [options]

  --day-offset N   0 = today (default), 1 = tomorrow, -1 = yesterday
  --tz ZONE        IANA timezone for first-pitch times (default $REPORT_TZ or America/New_York)
  --format md|json|both
  --out DIR        output root (default reports/; files land in <root>/mlb/)
  --cache PATH     results history cache (default ${DEFAULT_CACHE})
  --cover-probability P  confidence the quoted lines must clear (default 0.7)
  --retain N       days of results history to keep (default ${DEFAULT_RETAIN_DAYS})
  --quiet          write files only, no stdout

Starting pitchers, injuries, park factors and inning-level data are not
produced: the feed carries final team scores only. See the README.

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

/**
 * @param {object} args
 * @param {object} [deps]  injected for tests
 * @param {Date}   [now]   the instant "today" is measured from; injected so the
 *                         day-boundary behaviour is testable without a clock
 */
export async function buildMlbReport(args, deps = {}, now = new Date()) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getHistory = deps.updateHistory ?? updateHistory;
  const stats = {
    totalGames: 0,
    otherDays: 0,
    daysCached: 0,
    daysFetched: 0,
    daysFailed: 0,
    teamsKnown: 0,
    errors: [],
  };

  // A 7:05pm Eastern first pitch is 23:05 UTC, so a UTC-bucketed day splits the
  // evening slate across two feed files — see localtime.js.
  const [day, history] = await Promise.all([
    collectLocalDay({
      dayOffset: args.dayOffset,
      tz: args.tz,
      sport: SPORT.baseball,
      now,
      fetchDay: getFixtures,
    }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      sport: SPORT.baseball,
      cacheVersion: MLB_CACHE_VERSION,
      distil: distilMlbDay,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  stats.totalGames = day.all.length;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  const rows = buildStandings(history.matches);
  stats.teamsKnown = rows.length;
  const ctx = leagueContext(rows);

  stats.otherDays = day.otherDays;

  const games = day.onDay
    .filter((m) => {
      const { country, slug } = parseTournamentUrl(m.tournament?.url);
      return `${country}/${slug}` === MLB_PATH;
    })
    .map((m) => {
      const homeRow = findRow(rows, m.home) ?? baselineRow(m.home);
      const awayRow = findRow(rows, m.away) ?? baselineRow(m.away);
      const h2h = headToHead(history.matches, homeRow.team, awayRow.team);
      const projection = projectGame(m, homeRow, awayRow, ctx);
      return {
        id: m.id,
        first: m.kickoff,
        home: m.home,
        away: m.away,
        projection,
        lines: linesAtProbability(projection, args.coverProbability ?? 0.7),
        form: {
          home: recentForm(history.matches, homeRow.team),
          away: recentForm(history.matches, awayRow.team),
        },
        h2h,
        h2hSummary: headToHeadSummary(h2h, homeRow.team),
      };
    })
    .sort((a, b) => (a.first?.getTime() ?? 0) - (b.first?.getTime() ?? 0));

  return { date: day.date, tz: args.tz, games, stats, coverProbability: args.coverProbability ?? 0.7 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const data = await buildMlbReport(args);
  const outDir = path.join(args.outDir, 'mlb');
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
