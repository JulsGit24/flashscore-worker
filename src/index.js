#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchDayFixtures, DEFAULTS } from './flashscore.js';
import { collectLocalDay } from './localtime.js';
import { classifyCompetition, parseTournamentUrl } from './leagues.js';
import { REGIONS, REGION_LABEL, regionOf } from './leagues.data.js';
import { DEFAULT_CACHE, DEFAULT_RETAIN_DAYS, updateHistory } from './history.js';
import { buildTables, groupByLeague } from './table.js';
import { CONFIDENCE, baselineRow, leagueContext, rankFixtures, scoreFixture } from './score.js';
import { formTrend, recentForm } from './form.js';
import { promotionStatus } from './promotion.js';
import { favourite, outcomeProbabilities } from './probabilities.js';
import { renderJson, renderMarkdown } from './report.js';

function parseArgs(argv) {
  const args = {
    dayOffset: 0,
    region: 'europe',
    min: 30,
    threshold: 45,
    tz: process.env.REPORT_TZ ?? 'UTC',
    format: 'both',
    outDir: 'reports',
    cache: DEFAULT_CACHE,
    retain: DEFAULT_RETAIN_DAYS,
    minConfidence: 'low',
    strongPick: 0.7,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--day-offset') args.dayOffset = Number(next());
    else if (a === '--region') args.region = next();
    else if (a === '--min') args.min = Number(next());
    else if (a === '--threshold') args.threshold = Number(next());
    else if (a === '--tz') args.tz = next();
    else if (a === '--format') args.format = next();
    else if (a === '--out') args.outDir = next();
    else if (a === '--cache') args.cache = next();
    else if (a === '--retain') args.retain = Number(next());
    else if (a === '--min-confidence') args.minConfidence = next();
    else if (a === '--strong-pick') args.strongPick = Number(next());
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
flashscore-worker — daily shortlist of high-goal / lopsided fixtures

  node src/index.js [options]

  --region NAME    which report to build: ${REGIONS.join(' | ')} (default europe)
  --day-offset N   0 = today (default), 1 = tomorrow, -1 = yesterday
  --min N          minimum games in the shortlist (default 30)
  --threshold N    rank score a game must clear to be included beyond --min (default 45)
  --tz ZONE        IANA timezone for displayed kickoff times (default $REPORT_TZ or UTC)
  --format md|json|both
  --out DIR        output root (default reports/; files land in <root>/<region>/)
  --cache PATH     season history cache (default ${DEFAULT_CACHE})
  --retain N       days of results history to keep (default ${DEFAULT_RETAIN_DAYS})
  --min-confidence C  lowest confidence a game may have and still be called a
                   strong pick: baseline | low | medium | high (default low)
  --strong-pick P  win probability that counts as a strong favourite (default 0.7)
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
export async function buildReport(args, deps = {}, now = new Date()) {
  const getFixtures = deps.fetchDayFixtures ?? fetchDayFixtures;
  const getHistory = deps.updateHistory ?? updateHistory;
  const stats = {
    totalFixtures: 0,
    inScope: 0,
    tablesLoaded: 0,
    daysCached: 0,
    daysFetched: 0,
    daysFailed: 0,
    outOfRegion: [],
    otherDays: 0,
    errors: [],
  };

  const [day, history] = await Promise.all([
    collectLocalDay({ dayOffset: args.dayOffset, tz: args.tz, now, fetchDay: getFixtures }),
    getHistory({
      cachePath: args.cache,
      retainDays: args.retain,
      onError: (e) => stats.errors.push(e),
    }),
  ]);

  const fixtures = day.onDay;
  stats.totalFixtures = day.all.length;
  stats.otherDays = day.otherDays;
  stats.daysCached = history.daysCached;
  stats.daysFetched = history.daysFetched;
  stats.daysFailed = history.daysFailed;

  const tables = buildTables(history.matches);
  stats.tablesLoaded = tables.size;

  const inScope = [];
  const reviewSeen = new Map();
  // Competitions dropped because their country is in no region. Recorded so a
  // renamed country slug shows up as a diagnostic instead of silently emptying
  // a report.
  const outOfRegionSeen = new Set();

  for (const fixture of fixtures) {
    const { country, slug } = parseTournamentUrl(fixture.tournament?.url);
    const competition = { country, slug, name: fixture.tournament?.name ?? '' };
    const verdict = classifyCompetition(competition);

    if (verdict.include) {
      if (verdict.league.region !== args.region) continue;
      inScope.push({ ...fixture, league: verdict.league, leagueKey: `${country}/${slug}` });
    } else if (verdict.reason === 'needs-review' && verdict.region === args.region) {
      reviewSeen.set(`${country}/${slug}`, competition);
    } else if (verdict.reason === 'out-of-region' && country) {
      outOfRegionSeen.add(country);
    }
  }
  stats.inScope = inScope.length;
  stats.outOfRegion = [...outOfRegionSeen].sort();

  // Recent-form lookups read the same distilled history the tables come from.
  const historyByLeague = groupByLeague(history.matches);

  const scored = [];

  for (const fixture of inScope) {
    const entry = tables.get(fixture.leagueKey);
    const table = entry?.rows;
    fixture.tableFromPreviousSeason = Boolean(entry?.usedPreviousSeason);
    const leagueMatches = historyByLeague.get(fixture.leagueKey) ?? [];
    const homeRow = table ? findRow(table, fixture.home) : null;
    const awayRow = table ? findRow(table, fixture.away) : null;

    // Form is reported even when the fixture cannot be scored — a couple of
    // recent results is still worth seeing next to a game with no table.
    fixture.form = {
      home: recentForm(leagueMatches, homeRow?.team ?? fixture.home),
      away: recentForm(leagueMatches, awayRow?.team ?? fixture.away),
    };
    fixture.trend = {
      home: formTrend(fixture.form.home, homeRow?.played ? homeRow.points / homeRow.played : null),
      away: formTrend(fixture.form.away, awayRow?.played ? awayRow.points / awayRow.played : null),
    };
    // Promoted or relegated, read from which league the side played in last
    // season. Needs two seasons in the cache; reports `unknown` until then.
    fixture.movement = {
      home: promotionStatus(history.matches, homeRow?.team ?? fixture.home, fixture.leagueKey),
      away: promotionStatus(history.matches, awayRow?.team ?? fixture.away, fixture.leagueKey),
    };

    // Every fixture is projected. A side with no results on file falls back to
    // the league baseline, which shrinkage already produces exactly — so the
    // numbers are always there, and `confidence` says how much they are worth.
    const ctx = leagueContext(table ?? []);
    const score = scoreFixture(
      fixture,
      homeRow ?? baselineRow(fixture.home),
      awayRow ?? baselineRow(fixture.away),
      ctx,
    );
    score.probabilities = outcomeProbabilities(score.projected.home, score.projected.away);
    score.pick = favourite(score.probabilities, fixture.home, fixture.away);
    score.basis = table ? 'league table' : 'league baseline';
    scored.push({ ...fixture, score });
  }

  // Baseline-only fixtures all carry identical numbers, so ranking them says
  // nothing — they appear in the schedule with their projection but are kept
  // out of the shortlist, which is meant to separate games from each other.
  const rankable = scored.filter((f) => f.score.confidence !== CONFIDENCE.baseline);
  const ranked = rankFixtures(rankable, { min: args.min, threshold: args.threshold });

  // Every in-scope game appears in the per-league tables, so the report is a
  // usable schedule for the day rather than only a shortlist.
  const all = [...scored].sort(
    (a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0),
  );

  return {
    date: day.date,
    region: args.region,
    regionLabel: REGION_LABEL[args.region] ?? args.region,
    tz: args.tz,
    all,
    ranked,
    strongPickThreshold: args.strongPick,
    minConfidenceForPicks: args.minConfidence,
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

  if (!REGIONS.includes(args.region)) {
    process.stderr.write(
      `Unknown region "${args.region}". Choose one of: ${REGIONS.join(', ')}.\n`,
    );
    process.exit(2);
  }

  const data = await buildReport(args);
  const outDir = path.join(args.outDir, args.region);
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
  if (data.ranked.length === 0) {
    process.stderr.write(
      `\nNo ${args.region} games ranked. Either it is a genuinely empty day, the ` +
        'history cache is still filling, or the feed shape changed — run with ' +
        '--format json and inspect the stats block.\n',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
