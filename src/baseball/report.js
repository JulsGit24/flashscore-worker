const CONFIDENCE_MARK = { baseline: '○', low: '◔', medium: '◑', high: '●' };

const pct = (p) => (p === undefined || p === null ? '—' : `${Math.round(p * 100)}%`);
const signed = (x) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));
const line = (l) => (l === null || l === undefined ? '—' : l.toFixed(1));

export function formatTime(date, tz) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
}

function formCell(form) {
  if (!form || form.played === 0) return '—';
  return form.streak;
}

function scoringCell(form) {
  if (!form || form.played === 0) return '—';
  return `${form.pointsFor}-${form.pointsAgainst}`;
}

function h2hCell(summary) {
  if (!summary || summary.played === 0) return '—';
  const avg = summary.averageTotal ? ` · ${summary.averageTotal.toFixed(1)} tot` : '';
  return `${summary.aWins}-${summary.bWins}${avg}`;
}

/**
 * @param {object} data
 * @param {string} data.date
 * @param {string} data.tz
 * @param {Array}  data.games   every MLB game today, each with .projection
 * @param {object} data.stats
 */
export function renderMarkdown(data) {
  const { date, tz, games, stats } = data;
  const cover = data.coverProbability ?? 0.7;
  const out = [];

  out.push(`# MLB slate — ${date}`);
  out.push('');
  out.push(
    `${games.length} game${games.length === 1 ? '' : 's'}. All times **${tz}**, ` +
      'earliest first.',
  );
  out.push('');

  out.push('<details><summary>Column guide</summary>');
  out.push('');
  out.push('| Column | Meaning |');
  out.push('|---|---|');
  out.push('| **Runs** | Projected runs, home–away |');
  out.push('| **Tot** | Projected combined runs |');
  out.push('| **Win%** | Win probability, extra innings included |');
  out.push('| **RL** | Run line: the favourite winning by 2 or more |');
  out.push('| **O/U** | Chance the total goes over the stated line |');
  out.push('| **F5** | First five innings — a proportional split of the game projection, not measured inning data |');
  out.push('| **Form** | Last 5 results, most recent first |');
  out.push('| **RF-RA** | Runs scored and allowed across those 5 |');
  out.push('| **H2H** | Cached meetings this season: home wins–away wins, average total |');
  out.push(
    '| **?** | How much rests on these teams’ own results: ' +
      '● 5+ games each · ◑ 3-4 · ◔ 1-2 · ○ none, league baseline |',
  );
  out.push('');
  out.push('</details>');
  out.push('');

  if (!games.length) {
    out.push('_No MLB games scheduled today._');
    out.push('');
  } else {
    // --- headline sections, mirroring the soccer report ---------------------
    const favourites = games
      .filter((g) => {
        const best = Math.max(g.projection.winProbability.home, g.projection.winProbability.away);
        return best >= cover && g.projection.confidence !== 'baseline';
      })
      .sort(
        (a, b) =>
          Math.max(b.projection.winProbability.home, b.projection.winProbability.away) -
          Math.max(a.projection.winProbability.home, a.projection.winProbability.away),
      );

    out.push(`## Strong favourites (${pct(cover)}+)`);
    out.push('');
    if (!favourites.length) {
      out.push(
        `_No game today has a side at ${pct(cover)} or better with at least low ` +
          'confidence._',
      );
      out.push('');
      out.push(
        'This is normal, and worth saying plainly rather than hiding: baseball ' +
          'is the least predictable of the three sports in this repo. A very ' +
          'good team beating a very bad one is roughly a 65% proposition, so a ' +
          `${pct(cover)} moneyline is genuinely rare — where soccer and ` +
          'basketball produce them most nights.',
      );
    } else {
      out.push('| Time | Game | Side | Win% | RL -1.5 | Gap | ? |');
      out.push('|---|---|---|---:|---:|---:|:-:|');
      for (const g of favourites) {
        const p = g.projection;
        const homeIs = p.winProbability.home >= p.winProbability.away;
        out.push(
          `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
            `**${homeIs ? g.home : g.away}** | ` +
            `**${pct(Math.max(p.winProbability.home, p.winProbability.away))}** | ` +
            `${pct(p.runLine.coverProbability)} | ${p.strengthGap.toFixed(2)} | ` +
            `${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
        );
      }
    }
    out.push('');

    const byRuns = [...games].sort(
      (a, b) => b.projection.total.projected - a.projection.total.projected,
    );
    out.push('## Most runs expected');
    out.push('');
    out.push('| Time | Game | Proj total | Over 8.5 | Under 7.5 | ? |');
    out.push('|---|---|---:|---:|---:|:-:|');
    for (const g of byRuns.slice(0, 8)) {
      const p = g.projection;
      const over85 = p.total.overUnder.find((o) => o.line === 8.5);
      const under75 = p.total.overUnder.find((o) => o.line === 7.5);
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
          `**${p.total.projected.toFixed(2)}** | ${over85 ? pct(over85.over) : '—'} | ` +
          `${under75 ? pct(1 - under75.over) : '—'} | ` +
          `${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
      );
    }
    out.push('');

    // --- full slate ---------------------------------------------------------
    out.push('## Slate');
    out.push('');
    out.push(
      '| Time | Home | Away | Runs | Tot | Win% H | Win% A | RL fav | RL % | ' +
        'F5 tot | Form H | Form A | RF-RA H | RF-RA A | H2H | ? |',
    );
    out.push('|---|---|---|---|---:|---:|---:|---|---:|---:|---|---|---|---|---|:-:|');
    for (const g of games) {
      const p = g.projection;
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} *(H)* | ${g.away} *(A)* | ` +
          `${p.runs.home.toFixed(2)}–${p.runs.away.toFixed(2)} | ` +
          `${p.total.projected.toFixed(2)} | ${pct(p.winProbability.home)} | ` +
          `${pct(p.winProbability.away)} | ${p.runLine.favourite} -1.5 | ` +
          `${pct(p.runLine.coverProbability)} | ${p.firstFive.total.projected.toFixed(2)} | ` +
          `${formCell(g.form.home)} | ${formCell(g.form.away)} | ` +
          `${scoringCell(g.form.home)} | ${scoringCell(g.form.away)} | ` +
          `${h2hCell(g.h2hSummary)} | ${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
      );
    }
    out.push('');

    // --- lines at the confidence bar ---------------------------------------
    out.push(`## Lines that clear ${pct(cover)}`);
    out.push('');
    out.push(
      'The inverse of the usual question: not the odds at a posted line, but ' +
        `the line that is ${pct(cover)} likely to land. Computed from the exact ` +
        'discrete run distribution, quoted on half points so nothing can push. ' +
        `A dash means **nothing clears ${pct(cover)}** at that market — which is ` +
        'the honest answer, not a gap in the data.',
    );
    out.push('');
    out.push(`| Time | Game | Total over | Total under | Moneyline | Run line |`);
    out.push('|---|---|---|---|---|---|');
    for (const g of games) {
      const l = g.lines;
      const p = g.projection;
      const best = Math.max(p.winProbability.home, p.winProbability.away);
      const side = p.winProbability.home >= p.winProbability.away ? g.home : g.away;
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
          `${l.totalOver === null ? '—' : `**Over ${line(l.totalOver)}**`} | ` +
          `${l.totalUnder === null ? '—' : `**Under ${line(l.totalUnder)}**`} | ` +
          `${l.moneylineCovers ? `**${side}** ${pct(best)}` : '—'} | ` +
          `${l.runLineCovers ? `**${p.runLine.favourite} -1.5** ${pct(p.runLine.coverProbability)}` : '—'} |`,
      );
    }
    out.push('');

    // --- team totals --------------------------------------------------------
    out.push('## Team totals');
    out.push('');
    out.push('Each side’s own runs, independent of who wins.');
    out.push('');
    out.push('| Time | Game | Home proj | Home over | Away proj | Away over |');
    out.push('|---|---|---:|---|---:|---|');
    for (const g of games) {
      const t = g.projection.teamTotals;
      const ladder = (side) =>
        side.overUnder.map((o) => `${o.line.toFixed(1)} → ${pct(o.over)}`).join(' · ');
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
          `${t.home.projected.toFixed(2)} | ${ladder(t.home)} | ` +
          `${t.away.projected.toFixed(2)} | ${ladder(t.away)} |`,
      );
    }
    out.push('');

    // --- totals ladder ------------------------------------------------------
    out.push('## Totals — over/under by line');
    out.push('');
    for (const g of games) {
      const lines = g.projection.total.overUnder
        .map((ou) => `${ou.line.toFixed(1)} → ${pct(ou.over)}`)
        .join(' · ');
      out.push(`- **${g.home} v ${g.away}** (proj ${g.projection.total.projected.toFixed(2)}) — ${lines}`);
    }
    out.push('');

    // --- first five ---------------------------------------------------------
    out.push('## First five innings');
    out.push('');
    out.push(
      'A proportional split of the full-game projection — five ninths of the ' +
        'runs — **not** measured inning-by-inning data. The feed behind this ' +
        'report carries final scores only. Treat these as directional.',
    );
    out.push('');
    out.push('| Time | Game | F5 runs | F5 total | Win H | Tie | Win A | Over 4.5 |');
    out.push('|---|---|---|---:|---:|---:|---:|---:|');
    for (const g of games) {
      const f = g.projection.firstFive;
      const o45 = f.total.overUnder.find((o) => o.line === 4.5);
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
          `${f.runs.home.toFixed(2)}–${f.runs.away.toFixed(2)} | ${f.total.projected.toFixed(2)} | ` +
          `${pct(f.winProbability.home)} | ${pct(f.winProbability.tie)} | ` +
          `${pct(f.winProbability.away)} | ${o45 ? pct(o45.over) : '—'} |`,
      );
    }
    out.push('');

    // --- strength gaps ------------------------------------------------------
    const byGap = [...games].sort((a, b) => b.projection.strengthGap - a.projection.strengthGap);
    out.push('## Biggest strength gaps');
    out.push('');
    out.push(
      'Run differential per game is baseball’s net rating. The gap is the ' +
        'distance between the two sides — the measurable stand-in for a roster ' +
        'mismatch, since the feed carries no player data.',
    );
    out.push('');
    out.push('| Time | Game | Diff H | Diff A | Gap | Margin | Win% fav | ? |');
    out.push('|---|---|---:|---:|---:|---:|---:|:-:|');
    for (const g of byGap) {
      const p = g.projection;
      const favWin = Math.max(p.winProbability.home, p.winProbability.away);
      out.push(
        `| ${formatTime(g.first, tz)} | ${g.home} v ${g.away} | ` +
          `${signed(p.ratings.home.runDifferential)} | ${signed(p.ratings.away.runDifferential)} | ` +
          `**${p.strengthGap.toFixed(2)}** | ${signed(p.margin)} | ${pct(favWin)} | ` +
          `${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
      );
    }
    out.push('');

    const h2hGames = games.filter((g) => g.h2h.length);
    if (h2hGames.length) {
      out.push('## Head to head');
      out.push('');
      for (const g of h2hGames) {
        out.push(`**${g.home} v ${g.away}**`);
        out.push('');
        for (const m of g.h2h) {
          const when = new Date(m.ts * 1000).toISOString().slice(0, 10);
          out.push(
            `- ${when} — ${m.home} ${m.homePoints}–${m.awayPoints} ${m.away} (total ${m.total})`,
          );
        }
        out.push('');
      }
    }
  }

  out.push('## Not covered');
  out.push('');
  out.push(
    'Starting pitchers, bullpen usage, park factors, weather and injuries are ' +
      '**not** in this report — and in baseball the starting pitcher is the ' +
      'single largest per-game factor there is, larger than anything the team ' +
      'ratings above can capture.',
  );
  out.push('');
  out.push(
    'That is a limit of the source, not an oversight: the feed carries final ' +
      'scores only. A projection built from team run rates is a real signal, ' +
      'but it is a team-level one, so treat a game with an ace against a ' +
      'bullpen day as under-modelled here. See the README.',
  );
  out.push('');

  out.push('---');
  out.push('');
  out.push(
    `${stats.totalGames} baseball games worldwide · ${games.length} MLB on ${date} · ` +
      `${stats.otherDays ?? 0} dropped as belonging to a neighbouring day · ` +
      `${stats.teamsKnown} teams in the derived table from ${stats.daysCached} days of ` +
      `results (${stats.daysFetched} newly fetched, ${stats.daysFailed} failed) · ` +
      `generated ${new Date().toISOString()}`,
  );
  out.push('');
  return out.join('\n');
}

export function renderJson(data) {
  return JSON.stringify(
    {
      date: data.date,
      sport: 'baseball',
      competition: 'MLB',
      timezone: data.tz,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      notCovered: {
        startingPitchers: 'feed exposes no probable-pitcher data',
        injuries: 'no injury or news feed responded',
        parkAndWeather: 'not carried by the feed',
        inningData: 'feed carries final scores only; the first-five split is proportional',
      },
      coverProbability: data.coverProbability ?? 0.7,
      games: data.games.map((g) => ({
        firstPitch: g.first?.toISOString() ?? null,
        firstPitchLocal: formatTime(g.first, data.tz),
        home: g.home,
        away: g.away,
        // The full run distribution is an implementation detail worth several
        // hundred numbers per game; the report quotes what it supports.
        projection: { ...g.projection, distribution: undefined },
        linesAtProbability: g.lines,
        form: g.form,
        headToHead: g.h2h,
        headToHeadSummary: g.h2hSummary,
      })),
    },
    null,
    2,
  );
}
