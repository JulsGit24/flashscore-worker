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

/** "north-macedonia" -> "North Macedonia" */
export function prettyCountry(slug) {
  return String(slug ?? '')
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

/**
 * @param {object} data
 * @param {string} data.date          ISO date the report covers
 * @param {string} data.tz            IANA timezone used for displayed times
 * @param {Array}  data.ranked        scored + ranked fixtures
 * @param {Array}  data.unrankable    in-scope fixtures with no usable league table
 * @param {Array}  data.review        competitions that matched no allowlist entry
 * @param {object} data.stats         counters for the diagnostics footer
 */
export function renderMarkdown(data) {
  const { date, tz, ranked, unrankable, review, stats } = data;
  const out = [];

  out.push(`# Soccer shortlist — ${date}`);
  out.push('');
  out.push(
    `European tier-1 and tier-2 leagues, men’s and women’s. Times in **${tz}**. ` +
      `${ranked.length} games ranked out of ${stats.inScope} in scope.`,
  );
  out.push('');
  out.push(
    '`Goals` and `Edge` are 0-100. `Goals` is how high-scoring the game projects; ' +
      '`Edge` is how lopsided it is. `Proj` is the projected scoreline.',
  );
  out.push('');
  out.push('| # | Time | League | Fixture | Table | Goals | Edge | Proj | Why |');
  out.push('|---:|---|---|---|---|---:|---:|---|---|');

  ranked.forEach((f, i) => {
    const s = f.score;
    const table = `${ordinal(s.detail.home.rank)} v ${ordinal(s.detail.away.rank)}`;
    const proj = `${s.projected.home.toFixed(1)}–${s.projected.away.toFixed(1)}`;
    out.push(
      `| ${i + 1} | ${formatTime(f.kickoff, tz)} | ${prettyCountry(f.league.country)} ${f.league.name}` +
        `${f.league.gender === 'W' ? ' (W)' : ''} | **${f.home}** v **${f.away}** | ${table} | ` +
        `${s.goalsIndex} | ${s.mismatchIndex} | ${proj} | ${tagList(s.tags)} |`,
    );
  });

  out.push('');
  out.push('## Running order');
  out.push('');
  const byTime = [...ranked].sort(
    (a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0),
  );
  for (const f of byTime) {
    out.push(
      `- **${formatTime(f.kickoff, tz)}** — ${f.home} v ${f.away} ` +
        `(${f.league.name}) · goals ${f.score.goalsIndex} · edge ${f.score.mismatchIndex}` +
        `${f.score.favourite ? ` · lean ${f.score.favourite}` : ''}`,
    );
  }

  if (unrankable.length) {
    out.push('');
    out.push('## In scope but not ranked');
    out.push('');
    out.push('Not enough completed results in the derived league table to score these yet.');
    out.push('');
    for (const f of unrankable) {
      out.push(
        `- ${formatTime(f.kickoff, tz)} — ${f.home} v ${f.away} ` +
          `(${f.league?.name ?? f.tournament?.name})${f.why ? ` — ${f.why}` : ''}`,
      );
    }
  }

  if (review.length) {
    out.push('');
    out.push('## Competitions needing review');
    out.push('');
    out.push(
      'European and senior, but not in the tier-1/tier-2 allowlist — usually a cup, ' +
        'or a slug that changed upstream. Add real ones to `src/leagues.data.js`.',
    );
    out.push('');
    for (const c of review) out.push(`- \`${c.country}/${c.slug}\` — ${c.name}`);
  }

  out.push('');
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
  return JSON.stringify(
    {
      date: data.date,
      timezone: data.tz,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      games: data.ranked.map((f, i) => ({
        rank: i + 1,
        kickoff: f.kickoff?.toISOString() ?? null,
        kickoffLocal: formatTime(f.kickoff, data.tz),
        country: f.league.country,
        league: f.league.name,
        tier: f.league.tier,
        gender: f.league.gender,
        home: f.home,
        away: f.away,
        homeRank: f.score.detail.home.rank,
        awayRank: f.score.detail.away.rank,
        goalsIndex: f.score.goalsIndex,
        mismatchIndex: f.score.mismatchIndex,
        rankScore: f.score.rankScore,
        projected: f.score.projected,
        favourite: f.score.favourite,
        tags: f.score.tags,
      })),
      unrankable: data.unrankable.map((f) => ({
        kickoff: f.kickoff?.toISOString() ?? null,
        league: f.league?.name ?? f.tournament?.name ?? null,
        home: f.home,
        away: f.away,
        why: f.why ?? null,
      })),
      needsReview: data.review,
    },
    null,
    2,
  );
}
