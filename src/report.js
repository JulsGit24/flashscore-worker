import { TREND_ARROW } from './form.js';

/** Confidence shown as a filled-ness symbol, weakest to strongest. */
const CONFIDENCE_MARK = {
  baseline: '○',
  low: '◔',
  medium: '◑',
  high: '●',
};
const CONFIDENCE_ORDER = ['baseline', 'low', 'medium', 'high'];

export function meetsConfidence(confidence, minimum) {
  return CONFIDENCE_ORDER.indexOf(confidence) >= CONFIDENCE_ORDER.indexOf(minimum);
}

const TAG_LABEL = {
  HIGH_GOALS: 'goals',
  MISMATCH: 'mismatch',
  ATK_VS_LEAKY: 'attack v leaky',
  TOP_VS_BOTTOM: 'top v bottom',
  WIDE_TABLE_GAP: 'wide gap',
  LOW_SAMPLE: 'few games played',
};

export function formatTime(date, tz) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
}

function tagList(tags) {
  return tags.map((t) => TAG_LABEL[t] ?? t).join(', ');
}

/** Slugs whose display name is not just a title-cased slug. */
const COUNTRY_OVERRIDES = {
  usa: 'USA',
  'south-korea': 'South Korea',
  'trinidad-and-tobago': 'Trinidad and Tobago',
  'bosnia-and-herzegovina': 'Bosnia and Herzegovina',
  'czech-republic': 'Czech Republic',
  'dominican-republic': 'Dominican Republic',
  'el-salvador': 'El Salvador',
  'costa-rica': 'Costa Rica',
  'faroe-islands': 'Faroe Islands',
  'north-macedonia': 'North Macedonia',
  'northern-ireland': 'Northern Ireland',
  'san-marino': 'San Marino',
};

/** "north-macedonia" -> "North Macedonia", "usa" -> "USA" */
export function prettyCountry(slug) {
  const key = String(slug ?? '');
  if (COUNTRY_OVERRIDES[key]) return COUNTRY_OVERRIDES[key];
  return key
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ordinal(n) {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const pct = (p) => (p === undefined || p === null ? '—' : `${Math.round(p * 100)}%`);

/** "WWLTW ↑" — blank when the team has no cached results. */
function formCell(form, trend) {
  if (!form || form.played === 0) return '—';
  return `${form.streak} ${TREND_ARROW[trend] ?? '·'}`;
}

/** "8-3" — goals scored and conceded across the form window. */
function goalsCell(form) {
  if (!form || form.played === 0) return '—';
  return `${form.goalsFor}-${form.goalsAgainst}`;
}

/**
 * Group fixtures by country then league, ordering the groups by their earliest
 * kickoff so the document as a whole still reads earliest to latest.
 */
export function groupFixtures(fixtures) {
  const groups = new Map();
  for (const f of fixtures) {
    const key = `${f.league.country}/${f.league.slug}`;
    if (!groups.has(key)) {
      groups.set(key, { country: f.league.country, league: f.league, fixtures: [] });
    }
    groups.get(key).fixtures.push(f);
  }
  for (const g of groups.values()) {
    g.fixtures.sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));
    g.earliest = g.fixtures[0]?.kickoff?.getTime() ?? 0;
  }
  return [...groups.values()].sort(
    (a, b) => a.earliest - b.earliest || a.country.localeCompare(b.country),
  );
}

/**
 * Fixtures where one side is at or above the strong-favourite threshold. A
 * minimum confidence applies: a 70% call built purely on the league baseline
 * would be an artefact of the prior, not a read on the game.
 */
export function strongPicks(ranked, threshold, minConfidence = 'low') {
  return ranked
    .filter(
      (f) =>
        f.score?.pick &&
        f.score.pick.where !== 'D' &&
        f.score.pick.probability >= threshold &&
        meetsConfidence(f.score.confidence, minConfidence),
    )
    .sort((a, b) => b.score.pick.probability - a.score.pick.probability);
}

function fixtureRow(f, tz) {
  const s = f.score;
  const p = s.probabilities;

  return (
    `| ${formatTime(f.kickoff, tz)} | ${f.home} *(H)* | ${f.away} *(A)* | ` +
    `${pct(p.home)} | ${pct(p.draw)} | ${pct(p.away)} | ` +
    `${s.projected.home.toFixed(1)}–${s.projected.away.toFixed(1)} | ` +
    `${s.projected.total.toFixed(1)} | ${pct(p.over25)} | ${pct(p.under15)} | ${pct(p.btts)} | ` +
    `${CONFIDENCE_MARK[s.confidence] ?? '?'} | ` +
    `${formCell(f.form?.home, f.trend?.home)} | ${formCell(f.form?.away, f.trend?.away)} | ` +
    `${goalsCell(f.form?.home)} | ${goalsCell(f.form?.away)} | ${tagList(s.tags)} |`
  );
}

const TABLE_HEAD = [
  '| Time | Home | Away | 1 | X | 2 | xG | Tot | O2.5 | U1.5 | BTTS | ? | Form H | Form A | L5 H | L5 A | Notes |',
  '|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|:-:|---|---|---|---|---|',
];

/**
 * @param {object} data
 * @param {string} data.date          ISO date the report covers
 * @param {string} data.tz            IANA timezone used for displayed times
 * @param {Array}  data.all           every in-scope fixture, scored or not
 * @param {Array}  data.ranked        scored fixtures, best first
 * @param {number} data.strongPickThreshold
 * @param {Array}  data.review        competitions that matched no allowlist entry
 * @param {object} data.stats         counters for the diagnostics footer
 */
export function renderMarkdown(data) {
  const { date, tz, all, ranked, review, stats } = data;
  const label = data.regionLabel ?? 'Europe';
  const threshold = data.strongPickThreshold ?? 0.7;
  const out = [];

  out.push(`# Soccer shortlist — ${label} — ${date}`);
  out.push('');
  out.push(
    `Tier-1 and tier-2 leagues across ${label}, men’s and women’s. All times ` +
      `**${tz}**, earliest first. ${all.length} fixtures, ${ranked.length} with ` +
      'enough data to score.',
  );
  out.push('');

  // --- legend --------------------------------------------------------------
  out.push('<details><summary>Column guide</summary>');
  out.push('');
  out.push('| Column | Meaning |');
  out.push('|---|---|');
  out.push('| **1 / X / 2** | Home win, draw, away win |');
  out.push('| **xG** | Projected goals, home–away |');
  out.push('| **Tot** | Projected total goals |');
  out.push('| **O2.5** | Three goals or more. Under 2.5 is 100 − this |');
  out.push('| **U1.5** | Fewer than two goals in the match |');
  out.push('| **BTTS** | Both teams to score |');
  out.push(
    '| **?** | How much the numbers rest on these teams’ own results: ' +
      '● 5+ games each · ◑ 3-4 · ◔ 1-2 · ○ none, pure league baseline |',
  );
  out.push('| **Form** | Last 5 results, most recent first. W win, T tie, L loss |');
  out.push('| **↑ ↓ →** | Points per game over those 5 vs the season: rising, sliding, steady |');
  out.push('| **L5** | Goals scored–conceded across those 5 games |');
  out.push('| **last season** | Marked on a league whose table is too thin this season, so last season’s record is used instead |');
  out.push('');
  out.push('</details>');
  out.push('');

  // --- strong favourites ---------------------------------------------------
  const minConfidence = data.minConfidenceForPicks ?? 'low';
  const strong = strongPicks(ranked, threshold, minConfidence);
  out.push(`## Strong favourites (${pct(threshold)}+)`);
  out.push('');
  if (strong.length) {
    out.push('| Time | League | Fixture | Side | Win% | xG | Tot |');
    out.push('|---|---|---|---|---:|---|---:|');
    for (const f of strong) {
      const side = f.score.pick.where === 'H' ? `${f.home} (H)` : `${f.away} (A)`;
      out.push(
        `| ${formatTime(f.kickoff, tz)} | ${prettyCountry(f.league.country)} ${f.league.name} | ` +
          `${f.home} v ${f.away} | **${side}** | **${pct(f.score.pick.probability)}** | ` +
          `${f.score.projected.home.toFixed(1)}–${f.score.projected.away.toFixed(1)} | ` +
          `${f.score.projected.total.toFixed(1)} |`,
      );
    }
  } else {
    out.push(
      `_No fixture today has a side at ${pct(threshold)} or better with at least ` +
        `${minConfidence} confidence._`,
    );
  }
  out.push('');

  // --- goal-heavy ----------------------------------------------------------
  const goalGames = ranked
    .filter((f) => f.score.tags.includes('HIGH_GOALS'))
    .sort((a, b) => b.score.projected.total - a.score.projected.total);
  out.push('## Most goals expected');
  out.push('');
  if (goalGames.length) {
    out.push('| Time | League | Fixture | Tot | BTTS | Why |');
    out.push('|---|---|---|---:|---:|---|');
    for (const f of goalGames) {
      out.push(
        `| ${formatTime(f.kickoff, tz)} | ${prettyCountry(f.league.country)} ${f.league.name} | ` +
          `${f.home} v ${f.away} | **${f.score.projected.total.toFixed(1)}** | ` +
          `${pct(f.score.probabilities.btts)} | ${tagList(f.score.tags)} |`,
      );
    }
  } else {
    out.push('_No fixture today projects above the high-goals threshold._');
  }
  out.push('');

  // --- full schedule by country and league ---------------------------------
  out.push('## Full schedule');
  out.push('');
  for (const group of groupFixtures(all)) {
    const fromLastSeason = group.fixtures.some((f) => f.tableFromPreviousSeason);
    out.push(
      `### ${prettyCountry(group.country)} — ${group.league.name}` +
        `${group.league.gender === 'W' ? ' (Women)' : ''} · tier ${group.league.tier}` +
        `${fromLastSeason ? ' · _last season’s table_' : ''}`,
    );
    out.push('');
    out.push(...TABLE_HEAD);
    for (const f of group.fixtures) out.push(fixtureRow(f, tz));
    out.push('');
  }

  if (review.length) {
    out.push('## Competitions needing review');
    out.push('');
    out.push(
      'European and senior, but not in the tier-1/tier-2 allowlist — usually a cup, ' +
        'or a slug that changed upstream. Add real ones to `src/leagues.data.js`.',
    );
    out.push('');
    for (const c of review) out.push(`- \`${c.country}/${c.slug}\` — ${c.name}`);
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    `Fetched ${stats.totalFixtures} fixtures worldwide · ${stats.inScope} in scope · ` +
      `${stats.tablesLoaded} league tables derived from ${stats.daysCached} days of results ` +
      `(${stats.daysFetched} newly fetched, ${stats.daysFailed} failed) · ` +
      `generated ${new Date().toISOString()}`,
  );
  out.push('');
  return out.join('\n');
}

export function renderJson(data) {
  const fixture = (f) => ({
    kickoff: f.kickoff?.toISOString() ?? null,
    kickoffLocal: formatTime(f.kickoff, data.tz),
    country: f.league.country,
    league: f.league.name,
    tier: f.league.tier,
    gender: f.league.gender,
    home: f.home,
    away: f.away,
    tableFromPreviousSeason: Boolean(f.tableFromPreviousSeason),
    form: {
      home: f.form?.home ?? null,
      away: f.form?.away ?? null,
      homeTrend: f.trend?.home ?? null,
      awayTrend: f.trend?.away ?? null,
    },
    ...(f.score
      ? {
          homeRank: f.score.detail.home.rank,
          awayRank: f.score.detail.away.rank,
          goalsIndex: f.score.goalsIndex,
          mismatchIndex: f.score.mismatchIndex,
          rankScore: f.score.rankScore,
          projected: f.score.projected,
          probabilities: f.score.probabilities,
          pick: f.score.pick,
          confidence: f.score.confidence,
          basis: f.score.basis,
          tags: f.score.tags,
        }
      : { scored: false, why: f.why ?? null }),
  });

  return JSON.stringify(
    {
      date: data.date,
      region: data.region ?? 'europe',
      timezone: data.tz,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      strongPickThreshold: data.strongPickThreshold ?? 0.7,
      minConfidenceForPicks: data.minConfidenceForPicks ?? 'low',
      strongPicks: strongPicks(
        data.ranked,
        data.strongPickThreshold ?? 0.7,
        data.minConfidenceForPicks ?? 'low',
      ).map(fixture),
      games: data.all.map(fixture),
      needsReview: data.review,
      outOfRegionCountries: data.stats.outOfRegion ?? [],
    },
    null,
    2,
  );
}
