#!/usr/bin/env node
// NFL and college football slates: projected score, spread, total, win
// probability and key numbers per game.
//
// One entry point for both competitions, selected with --competition, because
// they are the same sport read the same way — only the constants differ, and
// those live in football/model.js.
//
// Unlike the other reports, this one is schedule-driven rather than daily.
// Nothing is written on a day with no games: the NFL plays three or four days a
// week and college mostly Saturdays, so writing an empty report six days out of
// seven would bury the real ones. A per-day check marker records that the feed
// *was* read, so "no games today" and "the job never ran" stay distinguishable —
// see writeCheckMarker.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SPORT, fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { parseTournamentUrl } from './leagues.js';
import { DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import {
  buildStandings,
  headToHead,
  headToHeadSummary,
  recentForm,
} from './football/standings.js';
import {
  COMPETITIONS,
  baselineRow,
  competitionOf,
  leagueContext,
  linesAtProbability,
  projectGame,
} from './football/model.js';
import { renderJson, renderMarkdown } from './football/report.js';
import { collectLocalDay } from './localtime.js';
import { writeReportBundle } from './visual/write.js';
import { footballDocument } from './visual/model.js';

export const DEFAULT_CACHE = 'data/football-history.json';
export const CHECK_MARKER = 'data/football-checked.json';

/**
 * Versioned separately from the other caches.
 *
 * 1: final scores only, both competitions in one file. The day feed is
 *    per-sport rather than per-competition, so one fetch serves both and
 *    splitting the cache would mean fetching twice.
 */
export const FOOTBALL_CACHE_VERSION = 1;

const PATHS = new Set(Object.values(COMPETITIONS).map((c) => c.path));

/** Keep finished NFL and college games; everything else on sport 5 is dropped. */
export function distilFootballDay(matches) {
  const finished = [];
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const { country, slug } = parseTournamentUrl(m.tournament?.url);
    const key = `${country}/${slug}`;
    if (!PATHS.has(key)) continue;
    finished.push({
      id: m.id ?? null,
      l: key,
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
    competition: 'nfl',
    dayOffset: 0,
    tz: process.env.REPORT_TZ ?? 'America/New_York',
    outDir: 'reports',
    cache: DEFAULT_CACHE,
    marker: CHECK_MARKER,
    coverProbability: 0.7,
    retain: DEFAULT_RETAIN_DAYS,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--competition') args.competition = next();
    else if (a === '--day-offset') args.dayOffset = Number(next());
    else if (a === '--tz') args.tz = next();
    else if (a === '--out') args.outDir = next();
    else if (a === '--cache') args.cache = next();
    else if (a === '--marker') args.marker = next();
    else if (a === '--cover-probability') args.coverProbability = Number(next());
    else if (a === '--retain') args.retain = Number(next());
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
flashscore-worker — NFL and college football slates

  node src/football.js --competition nfl|ncaa [options]

  --competition C  nfl (default) or ncaa
  --day-offset N   0 = today (default), 1 = tomorrow, -1 = yesterday
  --tz ZONE        IANA timezone for kickoff times (default $REPORT_TZ or America/New_York)
  --out DIR        output root (default reports/; files land in <root>/<competition>/<date>/)
  --cache PATH     results history cache (default ${DEFAULT_CACHE})
  --marker PATH    per-day check marker (default ${CHECK_MARKER})
  --cover-probability P  confidence the quoted lines must clear (default 0.7)
  --retain N       days of results history to keep (default ${DEFAULT_RETAIN_DAYS})
  --quiet          write files only, no stdout

Nothing is written on a day with no games. The marker still records that the
feed was read, so "no games" and "the job never ran" stay distinguishable.

Quarterback status, injuries, weather, rest and travel are not produced: the
feed carries final team scores only. See the README.

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
 * @param {Date}   [now]   the instant "today" is measured from
 */
export async function buildFootballReport(args, deps = {}, now = new Date()) {
  const cfg = competitionOf(args.competition);
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

  const [day, history] = await Promise.all([
    collectLocalDay({
      dayOffset: args.dayOffset,
      tz: args.tz,
      sport: SPORT.americanFootball,
      now,
      fetchDay: getFixtures,
    }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      sport: SPORT.americanFootball,
      cacheVersion: FOOTBALL_CACHE_VERSION,
      distil: distilFootballDay,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  stats.totalGames = day.all.length;
  stats.otherDays = day.otherDays;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  // The cache holds both competitions; a team's record must come from its own.
  const ourResults = history.matches.filter((m) => m.l === cfg.path);
  const rows = buildStandings(ourResults);
  stats.teamsKnown = rows.length;
  const ctx = leagueContext(rows, ourResults, cfg.key);

  const games = day.onDay
    .filter((m) => {
      const { country, slug } = parseTournamentUrl(m.tournament?.url);
      return `${country}/${slug}` === cfg.path;
    })
    .map((m) => {
      const homeRow = findRow(rows, m.home) ?? baselineRow(m.home);
      const awayRow = findRow(rows, m.away) ?? baselineRow(m.away);
      const h2h = headToHead(ourResults, homeRow.team, awayRow.team);
      const projection = projectGame(m, homeRow, awayRow, ctx);
      return {
        id: m.id,
        kickoff: m.kickoff,
        home: m.home,
        away: m.away,
        homeImage: m.homeImage ?? null,
        awayImage: m.awayImage ?? null,
        tournamentImage: m.tournament?.image ?? null,
        projection,
        lines: linesAtProbability(projection, ctx, args.coverProbability ?? 0.7),
        form: {
          home: recentForm(ourResults, homeRow.team),
          away: recentForm(ourResults, awayRow.team),
        },
        h2h,
        h2hSummary: headToHeadSummary(h2h, homeRow.team),
      };
    })
    .sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  return {
    date: day.date,
    tz: args.tz,
    ctx,
    games,
    stats,
    coverProbability: args.coverProbability ?? 0.7,
  };
}

/**
 * Record that the feed was read for this date, whether or not it had games.
 *
 * Without this, a day with no NFL game and a day where the job never ran look
 * identical from the outside — an empty reports folder either way. The workflow
 * gate reads it so it stops retrying once the day has genuinely been checked,
 * and the morning routine reads it to say "no games today" rather than "the
 * report is missing".
 */
export async function writeCheckMarker(markerPath, date, counts, retainDays = 60) {
  let existing = {};
  try {
    existing = JSON.parse(await readFile(markerPath, 'utf8'));
    if (typeof existing !== 'object' || existing === null) existing = {};
  } catch {
    // A missing or unreadable marker is a fresh start, not a failure.
  }

  existing[date] = { ...(existing[date] ?? {}), ...counts, checkedAt: new Date().toISOString() };

  const keep = Object.keys(existing)
    .sort()
    .slice(-retainDays);
  const trimmed = Object.fromEntries(keep.map((k) => [k, existing[k]]));

  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify(trimmed, null, 2)}\n`);
  return trimmed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!COMPETITIONS[args.competition]) {
    process.stderr.write(
      `Unknown competition "${args.competition}". Choose one of: ${Object.keys(COMPETITIONS).join(', ')}.\n`,
    );
    process.exit(2);
  }

  const data = await buildFootballReport(args);
  const label = data.ctx.label;

  await writeCheckMarker(args.marker, data.date, { [args.competition]: data.games.length });

  if (!data.games.length) {
    // Deliberately no folder. See the note at the top of this file.
    if (!args.quiet) {
      process.stdout.write(`No ${label} games on ${data.date}; nothing written.\n`);
    }
    return;
  }

  const { dir, pdf, warning } = await writeReportBundle({
    outDir: args.outDir,
    key: args.competition,
    date: data.date,
    markdown: renderMarkdown(data),
    json: renderJson(data),
    doc: footballDocument(data),
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
