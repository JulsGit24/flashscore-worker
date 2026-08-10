#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { classifyCompetition, parseTournamentUrl } from './leagues.js';
import { DEFAULT_CACHE, DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import { buildTables } from './table.js';
import { leagueContext, rankFixtures, scoreFixture } from './score.js';
import { renderJson, renderMarkdown } from './report.js';

function parseArgs(argv) {
  const args = {
    dayOffset: 0,
    min: 30,
    threshold: 45,
    tz: process.env.REPORT_TZ ?? 'UTC',
    format: 'both',
    outDir: 'reports',
    cache: DEFAULT_CACHE,
    retain: DEFAULT_RETAIN_DAYS,
    minPlayed: 3,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--day-offset') args.dayOffset = Number(next());
    else if (a === '--min') args.min = Number(next());
    else if (a === '--threshold') args.threshold = Number(next());
    else if (a === '--tz') args.tz = next();
    else if (a === '--format') args.format = next();
    else if (a === '--out') args.outDir = next();
    else if (a === '--cache') args.cache = next();
    else if (a === '--retain') args.retain = Number(next());
    else if (a === '--min-played') args.minPlayed = Number(next());
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
flashscore-worker — daily shortlist of high-goal / lopsided European fixtures

  node src/index.js [options]

  --day-offset N   0 = today (default), 1 = tomorrow, -1 = yesterday
  --min N          minimum games in the shortlist (default 30)
  --threshold N    rank score a game must clear to be included beyond --min (default 45)
  --tz ZONE        IANA timezone for displayed kickoff times (default $REPORT_TZ or UTC)
  --format md|json|both
  --out DIR        output directory (default reports/)
  --cache PATH     season history cache (default ${DEFAULT_CACHE})
  --retain N       days of results history to keep (default ${DEFAULT_RETAIN_DAYS})
  --min-played N   league table games needed before a fixture can be ranked (default 3)
  --quiet          write files only, no stdout

League tables are computed from past day feeds rather than fetched, and cached
in --cache. The feed only serves a 7-day window, so a fresh cache cannot
reconstruct a season on day one — it accumulates as the job runs each morning.

Environment: FS_HOST, FS_PROJECT, FS_SIGN, FS_LANG, FS_REFERER override the
feed endpoint if Flashscore rotates it. Current defaults:
  host=${DEFAULTS.host} project=${DEFAULTS.project} lang=${DEFAULTS.lang}
`;

/** Match a fixture's team names against table rows, tolerating minor differences. */
export function findRow(table, name) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  if (!target) return null;
  return (
    table.find((r) => norm(r.team) === target) ??
    table.find((r) => {
      const t = norm(r.team);
      return t.includes(target) || target.includes(t);
    }) ??
    null
  );
}

/**
 * @param {object} args parsed CLI arguments
 * @param {object} [deps] injection seam so the pipeline can be tested offline
 */
export async function buildReport(args, deps = {}) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getHistory = deps.updateHistory ?? updateHistory;
  const stats = {
    totalFixtures: 0,
    inScope: 0,
    tablesLoaded: 0,
    daysCached: 0,
    daysFetched: 0,
    daysFailed: 0,
    errors: [],
  };

  const [fixtures, history] = await Promise.all([
    getFixtures({ dayOffset: args.dayOffset }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  stats.totalFixtures = fixtures.length;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  const tables = buildTables(history.matches);
  stats.tablesLoaded = tables.size;

  const inScope = [];
  const reviewSeen = new Map();

  for (const fixture of fixtures) {
    const { country, slug } = parseTournamentUrl(fixture.tournament?.url);
    const competition = { country, slug, name: fixture.tournament?.name ?? '' };
    const verdict = classifyCompetition(competition);

    if (verdict.include) {
      inScope.push({ ...fixture, league: verdict.league, leagueKey: `${country}/${slug}` });
    } else if (verdict.reason === 'needs-review') {
      reviewSeen.set(`${country}/${slug}`, competition);
    }
  }
  stats.inScope = inScope.length;

  const scored = [];
  const unrankable = [];

  for (const fixture of inScope) {
    const table = tables.get(fixture.leagueKey);
    const homeRow = table ? findRow(table, fixture.home) : null;
    const awayRow = table ? findRow(table, fixture.away) : null;

    if (!homeRow || !awayRow) {
      unrankable.push({ ...fixture, why: table ? 'team not in table' : 'no results yet' });
      continue;
    }
    if (homeRow.played < args.minPlayed || awayRow.played < args.minPlayed) {
      unrankable.push({ ...fixture, why: 'too few games played' });
      continue;
    }
    const ctx = leagueContext(table);
    scored.push({ ...fixture, score: scoreFixture(fixture, homeRow, awayRow, ctx) });
  }

  const ranked = rankFixtures(scored, { min: args.min, threshold: args.threshold });

  const date = new Date(Date.now() + args.dayOffset * 86400000).toISOString().slice(0, 10);

  return { date, tz: args.tz, ranked, unrankable, review: [...reviewSeen.values()], stats };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const data = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });

  if (args.format === 'md' || args.format === 'both') {
    const md = renderMarkdown(data);
    await writeFile(path.join(args.outDir, `${data.date}.md`), md);
    if (!args.quiet) process.stdout.write(`${md}\n`);
  }
  if (args.format === 'json' || args.format === 'both') {
    await writeFile(path.join(args.outDir, `${data.date}.json`), renderJson(data));
  }

  if (data.stats.errors.length) {
    process.stderr.write(
      `\n${data.stats.errors.length} non-fatal errors:\n` +
        data.stats.errors.slice(0, 20).map((e) => `  - ${e}`).join('\n') +
        '\n',
    );
  }
  if (data.ranked.length === 0) {
    process.stderr.write(
      '\nNo games ranked. Either it is a genuinely empty day, or the feed shape ' +
        'changed — run with --format json and inspect the stats block.\n',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
