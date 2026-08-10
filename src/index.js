#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchDayFixtures, fetchStandings, DEFAULTS } from './flashscore.js';
import { classifyCompetition, parseTournamentUrl } from './leagues.js';
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
  --quiet          write files only, no stdout

Environment: FS_HOST, FS_PROJECT, FS_SIGN, FS_LANG, FS_REFERER override the
feed endpoint if Flashscore rotates it. Current defaults:
  host=${DEFAULTS.host} project=${DEFAULTS.project} lang=${DEFAULTS.lang}
`;

/** Fetch standings once per tournament stage, with the in-flight promise shared. */
function standingsLoader(stats, getStandings) {
  const cache = new Map();
  return (stageId) => {
    if (!stageId) return Promise.resolve(null);
    if (!cache.has(stageId)) {
      cache.set(
        stageId,
        getStandings(stageId)
          .then((rows) => {
            if (rows.length) stats.tablesLoaded += 1;
            return rows.length ? rows : null;
          })
          .catch((err) => {
            stats.tableErrors += 1;
            stats.errors.push(`standings ${stageId}: ${err.message}`);
            return null;
          }),
      );
    }
    return cache.get(stageId);
  };
}

/** Match a fixture's team names against standings rows, tolerating minor differences. */
function findRow(table, name) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  return (
    table.find((r) => norm(r.team) === target) ??
    table.find((r) => norm(r.team).includes(target) || target.includes(norm(r.team))) ??
    null
  );
}

/**
 * @param {object} args parsed CLI arguments
 * @param {object} [deps] injection seam so the pipeline can be tested offline
 */
export async function buildReport(args, deps = {}) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getStandings = deps.fetchStandings ?? fetchStandings;
  const stats = {
    totalFixtures: 0,
    inScope: 0,
    tablesLoaded: 0,
    tableErrors: 0,
    errors: [],
  };

  const fixtures = await getFixtures({ dayOffset: args.dayOffset });
  stats.totalFixtures = fixtures.length;

  const inScope = [];
  const reviewSeen = new Map();

  for (const fixture of fixtures) {
    const { country, slug } = parseTournamentUrl(fixture.tournament?.url);
    const competition = { country, slug, name: fixture.tournament?.name ?? '' };
    const verdict = classifyCompetition(competition);

    if (verdict.include) {
      inScope.push({ ...fixture, league: verdict.league });
    } else if (verdict.reason === 'needs-review') {
      reviewSeen.set(`${country}/${slug}`, competition);
    }
  }
  stats.inScope = inScope.length;

  const loadStandings = standingsLoader(stats, getStandings);
  const scored = [];
  const unrankable = [];

  const results = await Promise.all(
    inScope.map(async (fixture) => {
      const table = await loadStandings(fixture.tournament?.stageId);
      if (!table) return { fixture, ok: false };
      const homeRow = findRow(table, fixture.home);
      const awayRow = findRow(table, fixture.away);
      if (!homeRow || !awayRow) return { fixture, ok: false };
      const ctx = leagueContext(table);
      return { fixture, ok: true, score: scoreFixture(fixture, homeRow, awayRow, ctx) };
    }),
  );

  for (const r of results) {
    if (r.ok) scored.push({ ...r.fixture, score: r.score });
    else unrankable.push(r.fixture);
  }

  const ranked = rankFixtures(scored, { min: args.min, threshold: args.threshold });

  const date = new Date(Date.now() + args.dayOffset * 86400000)
    .toISOString()
    .slice(0, 10);

  return {
    date,
    tz: args.tz,
    ranked,
    unrankable,
    review: [...reviewSeen.values()],
    stats,
  };
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
