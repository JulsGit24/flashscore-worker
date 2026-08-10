const CONFIDENCE_MARK = { baseline: '○', low: '◔', medium: '◑', high: '●' };

const pct = (p) => (p === undefined || p === null ? '—' : `${Math.round(p * 100)}%`);
const signed = (x) => (x > 0 ? `+${x.toFixed(1)}` : x.toFixed(1));

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
  return `${form.pointsForAvg.toFixed(0)}/${form.pointsAgainstAvg.toFixed(0)}`;
}

function h2hCell(summary, homeName) {
  if (!summary || summary.played === 0) return '—';
  const avg = summary.averageTotal ? ` · ${summary.averageTotal.toFixed(0)} tot` : '';
  return `${summary.aWins}-${summary.bWins}${avg}`;
}

/**
 * @param {object} data
 * @param {string} data.date
 * @param {string} data.tz
 * @param {Array}  data.games   every WNBA game today, each with .projection
 * @param {object} data.stats
 */
export function renderMarkdown(data) {
  const { date, tz, games, stats } = data;
  const out = [];

  out.push(`# WNBA slate — ${date}`);
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
  out.push('| **Proj** | Projected points, home–away |');
  out.push('| **Spread** | Projected margin, quoted on the favourite |');
  out.push('| **Total** | Projected combined points, with an 80% range |');
  out.push('| **Win%** | Home / away win probability from the projected margin |');
  out.push('| **Form** | Last 5 results, most recent first |');
  out.push('| **PF/PA** | Points scored and allowed per game across those 5 |');
  out.push('| **H2H** | Cached meetings this season: home wins–away wins, average total |');
  out.push(
    '| **?** | How much rests on these teams’ own results: ' +
      '● 5+ games each · ◑ 3-4 · ◔ 1-2 · ○ none, league baseline |',
  );
  out.push('');
  out.push('</details>');
  out.push('');

  if (!games.length) {
    out.push('_No WNBA games scheduled today._');
    out.push('');
  } else {
    out.push('## Slate');
    out.push('');
    out.push(
      '| Tip | Home | Away | Proj | Spread | Total | Win% H | Win% A | Form H | Form A | ' +
        'PF/PA H | PF/PA A | H2H | ? |',
    );
    out.push('|---|---|---|---|---|---:|---:|---:|---|---|---|---|---|:-:|');
    for (const g of games) {
      const p = g.projection;
      out.push(
        `| ${formatTime(g.tipoff, tz)} | ${g.home} *(H)* | ${g.away} *(A)* | ` +
          `${p.points.home.toFixed(1)}–${p.points.away.toFixed(1)} | ` +
          `${p.spread.favourite} ${p.spread.line.toFixed(1)} | ` +
          `${p.total.projected.toFixed(1)} | ${pct(p.winProbability.home)} | ` +
          `${pct(p.winProbability.away)} | ${formCell(g.form.home)} | ${formCell(g.form.away)} | ` +
          `${scoringCell(g.form.home)} | ${scoringCell(g.form.away)} | ` +
          `${h2hCell(g.h2hSummary, g.home)} | ${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
      );
    }
    out.push('');

    out.push('## Totals — over/under by line');
    out.push('');
    out.push('| Tip | Game | Proj total | 80% range | ' + 'Over lines |');
    out.push('|---|---|---:|---|---|');
    for (const g of games) {
      const t = g.projection.total;
      const lines = t.overUnder
        .map((ou) => `${ou.line.toFixed(1)} → ${pct(ou.over)}`)
        .join(' · ');
      out.push(
        `| ${formatTime(g.tipoff, tz)} | ${g.home} v ${g.away} | ` +
          `${t.projected.toFixed(1)} | ${t.range[0].toFixed(0)}–${t.range[1].toFixed(0)} | ${lines} |`,
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
          out.push(`- ${when} — ${m.home} ${m.homePoints}–${m.awayPoints} ${m.away} (total ${m.total})`);
        }
        out.push('');
      }
    }
  }

  out.push('## Not covered');
  out.push('');
  out.push(
    'Player props and injury status are **not** in this report. The feed behind ' +
      'it carries team scores and quarter splits only — its per-match detail ' +
      'endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at ' +
      'player level — and every injury and news feed shape probed came back ' +
      'empty. Both need a source with box scores and an injury report; see the ' +
      'README for what that would take.',
  );
  out.push('');

  out.push('---');
  out.push('');
  out.push(
    `${stats.totalGames} basketball games worldwide · ${games.length} WNBA · ` +
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
      sport: 'basketball',
      competition: 'WNBA',
      timezone: data.tz,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      notCovered: {
        playerProps: 'feed exposes no player-level data',
        injuries: 'no injury or news feed responded',
      },
      games: data.games.map((g) => ({
        tipoff: g.tipoff?.toISOString() ?? null,
        tipoffLocal: formatTime(g.tipoff, data.tz),
        home: g.home,
        away: g.away,
        projection: g.projection,
        form: g.form,
        headToHead: g.h2h,
        headToHeadSummary: g.h2hSummary,
      })),
    },
    null,
    2,
  );
}
