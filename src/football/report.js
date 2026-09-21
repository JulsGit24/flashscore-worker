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
  return `${form.pointsFor}-${form.pointsAgainst}`;
}

function h2hCell(summary) {
  if (!summary || summary.played === 0) return '—';
  const t = summary.ties ? `-${summary.ties}T` : '';
  const avg = summary.averageTotal ? ` · ${summary.averageTotal.toFixed(0)} tot` : '';
  return `${summary.aWins}-${summary.bWins}${t}${avg}`;
}

/**
 * @param {object} data
 * @param {string} data.date
 * @param {string} data.tz
 * @param {Array}  data.games  every game today, each with .projection
 * @param {object} data.ctx    league context, for the spreads actually used
 * @param {object} data.stats
 */
export function renderMarkdown(data) {
  const { date, tz, games, stats, ctx } = data;
  const label = ctx?.label ?? 'Football';
  const cover = data.coverProbability ?? 0.7;
  const out = [];

  out.push(`# ${label} slate — ${date}`);
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
  out.push('| **Total** | Projected combined points |');
  out.push('| **Win%** | Win probability from the projected margin |');
  out.push('| **1H** | First half — a proportional split of the game projection, not measured half data |');
  out.push('| **Form** | Last 5 results, most recent first. W win, T tie, L loss |');
  out.push('| **PF-PA** | Points scored and allowed across those 5 |');
  out.push('| **H2H** | Cached meetings this season: home wins–away wins |');
  out.push(
    '| **?** | How much rests on these teams’ own results: ' +
      '● 4+ games each · ◑ 2-3 · ◔ 1 · ○ none, league baseline |',
  );
  out.push('');
  out.push('</details>');
  out.push('');

  if (!games.length) {
    out.push(`_No ${label} games scheduled today._`);
    out.push('');
  } else {
    // --- strong favourites --------------------------------------------------
    const favourites = games
      .filter(
        (g) =>
          Math.max(g.projection.winProbability.home, g.projection.winProbability.away) >= cover &&
          g.projection.confidence !== 'baseline',
      )
      .sort(
        (a, b) =>
          Math.max(b.projection.winProbability.home, b.projection.winProbability.away) -
          Math.max(a.projection.winProbability.home, a.projection.winProbability.away),
      );

    out.push(`## Strong favourites (${pct(cover)}+)`);
    out.push('');
    if (!favourites.length) {
      out.push(
        `_No game today has a side at ${pct(cover)} or better with at least low confidence._`,
      );
    } else {
      out.push('| Time | Game | Side | Win% | Spread | Gap | ? |');
      out.push('|---|---|---|---:|---:|---:|:-:|');
      for (const g of favourites) {
        const p = g.projection;
        const homeIs = p.winProbability.home >= p.winProbability.away;
        out.push(
          `| ${formatTime(g.kickoff, tz)} | ${g.home} v ${g.away} | **${homeIs ? g.home : g.away}** | ` +
            `**${pct(Math.max(p.winProbability.home, p.winProbability.away))}** | ` +
            `${p.spread.favourite} ${p.spread.line.toFixed(1)} | ${p.strengthGap.toFixed(1)} | ` +
            `${CONFIDENCE_MARK[p.confidence] ?? '?'} |`,
        );
      }
    }
    out.push('');

    // --- most points --------------------------------------------------------
    const byTotal = [...games].sort(
      (a, b) => b.projection.total.projected - a.projection.total.projected,
    );
    out.push('## Most points expected');
    out.push('');
    out.push('| Time | Game | Proj total | 80% range | ? |');
    out.push('|---|---|---:|---|:-:|');
    for (const g of byTotal.slice(0, 10)) {
      const t = g.projection.total;
      out.push(
        `| ${formatTime(g.kickoff, tz)} | ${g.home} v ${g.away} | **${t.projected.toFixed(1)}** | ` +
          `${t.range[0].toFixed(0)}–${t.range[1].toFixed(0)} | ` +
          `${CONFIDENCE_MARK[g.projection.confidence] ?? '?'} |`,
      );
    }
    out.push('');

    // --- full slate ---------------------------------------------------------
    out.push('## Slate');
    out.push('');
    out.push(
      '| Time | Home | Away | Proj | Spread | Total | Win% H | Win% A | 1H | ' +
        'Form H | Form A | PF-PA H | PF-PA A | H2H | ? |',
    );
    out.push('|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|:-:|');
    for (const g of games) {
      const p = g.projection;
      out.push(
        `| ${formatTime(g.kickoff, tz)} | ${g.home} *(H)* | ${g.away} *(A)* | ` +
          `${p.points.home.toFixed(1)}–${p.points.away.toFixed(1)} | ` +
          `${p.spread.favourite} ${p.spread.line.toFixed(1)} | ${p.total.projected.toFixed(1)} | ` +
          `${pct(p.winProbability.home)} | ${pct(p.winProbability.away)} | ` +
          `${p.firstHalf.points.total.toFixed(1)} | ` +
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
        `the line that is ${pct(cover)} likely to land. Quoted on half points so ` +
        'nothing can push.',
    );
    out.push('');
    out.push(`| Time | Game | Spread ${pct(cover)} | Total over | Total under | Moneyline |`);
    out.push('|---|---|---|---|---|---|');
    for (const g of games) {
      const l = g.lines;
      const p = g.projection;
      const best = Math.max(p.winProbability.home, p.winProbability.away);
      const side = p.winProbability.home >= p.winProbability.away ? g.home : g.away;
      const spread =
        l.spread.line <= 0
          ? `${l.spread.side} ${l.spread.line.toFixed(1)}`
          : `${l.spread.side} +${l.spread.line.toFixed(1)}`;
      out.push(
        `| ${formatTime(g.kickoff, tz)} | ${g.home} v ${g.away} | **${spread}** | ` +
          `**Over ${l.totalOver.toFixed(1)}** | **Under ${l.totalUnder.toFixed(1)}** | ` +
          `${l.moneylineCovers ? `**${side}** ${pct(best)}` : '—'} |`,
      );
    }
    out.push('');

    // --- key numbers --------------------------------------------------------
    out.push('## Key numbers');
    out.push('');
    out.push(
      'Football margins pile up on 3 and 7, because scores are built from field ' +
        'goals and touchdowns. These are the chances the final margin lands ' +
        '**exactly** on each, either way.',
    );
    out.push('');
    out.push(
      '**Read these as a floor.** They come from discretising a smooth normal ' +
        'curve, which spreads mass evenly and so understates the real pile-up on ' +
        '3 and 7. The ordering is right; the exact figures are conservative.',
    );
    out.push('');
    const nums = games[0]?.projection.keyNumbers.map((k) => k.margin) ?? [];
    out.push(`| Time | Game | ${nums.map((n) => `by ${n}`).join(' | ')} |`);
    out.push(`|---|---|${nums.map(() => '---:').join('|')}|`);
    for (const g of games) {
      out.push(
        `| ${formatTime(g.kickoff, tz)} | ${g.home} v ${g.away} | ` +
          `${g.projection.keyNumbers.map((k) => pct(k.probability)).join(' | ')} |`,
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
      out.push(
        `- **${g.home} v ${g.away}** (proj ${g.projection.total.projected.toFixed(1)}) — ${lines}`,
      );
    }
    out.push('');

    // --- strength gaps ------------------------------------------------------
    const byGap = [...games].sort((a, b) => b.projection.strengthGap - a.projection.strengthGap);
    out.push('## Biggest strength gaps');
    out.push('');
    out.push(
      'Point differential per game is football’s net rating. The gap is the ' +
        'distance between the two sides — the measurable stand-in for a roster ' +
        'mismatch, since the feed carries no player data.',
    );
    out.push('');
    out.push('| Time | Game | Diff H | Diff A | Gap | Margin | Win% fav | ? |');
    out.push('|---|---|---:|---:|---:|---:|---:|:-:|');
    for (const g of byGap.slice(0, 15)) {
      const p = g.projection;
      const favWin = Math.max(p.winProbability.home, p.winProbability.away);
      out.push(
        `| ${formatTime(g.kickoff, tz)} | ${g.home} v ${g.away} | ` +
          `${signed(p.ratings.home.pointDifferential)} | ${signed(p.ratings.away.pointDifferential)} | ` +
          `**${p.strengthGap.toFixed(1)}** | ${signed(p.margin)} | ${pct(favWin)} | ` +
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
    'Quarterback status and injuries are **not** in this report, and in football ' +
      'the starting quarterback moves a line further than any other single ' +
      'factor — several points on the spread. The feed carries final team scores ' +
      'only, so a game where a starter is out is under-modelled here.',
  );
  out.push('');
  out.push(
    'Also absent: weather, which matters more in this sport than in any other ' +
      'here; rest days and travel, including the short week a Thursday game ' +
      'imposes; and, for college, the wide gulf between an FBS side and an FCS ' +
      'opponent it may be playing for the first time, where neither has a shared ' +
      'history to measure against.',
  );
  out.push('');

  out.push('---');
  out.push('');
  const spreadNote =
    ctx?.derivedFrom > 0
      ? `margin sd ${ctx.marginSd.toFixed(1)} and total sd ${ctx.totalSd.toFixed(1)} measured from ${ctx.derivedFrom} finished games`
      : `margin sd ${ctx.marginSd.toFixed(1)} and total sd ${ctx.totalSd.toFixed(1)} from the competition prior — not yet enough cached results to measure`;
  out.push(
    `${stats.totalGames} football games worldwide · ${games.length} ${label} on ${date} · ` +
      `${stats.otherDays ?? 0} dropped as belonging to a neighbouring day · ` +
      `${stats.teamsKnown} teams from ${stats.daysCached} days of results · ` +
      `${spreadNote} · generated ${new Date().toISOString()}`,
  );
  out.push('');
  return out.join('\n');
}

export function renderJson(data) {
  return JSON.stringify(
    {
      date: data.date,
      sport: 'american-football',
      competition: data.ctx?.label ?? null,
      competitionKey: data.ctx?.competition ?? null,
      timezone: data.tz,
      generatedAt: new Date().toISOString(),
      stats: data.stats,
      model: {
        pointsPerTeamGame: data.ctx?.pointsPerTeamGame,
        marginSd: data.ctx?.marginSd,
        totalSd: data.ctx?.totalSd,
        spreadsDerivedFromGames: data.ctx?.derivedFrom ?? 0,
      },
      notCovered: {
        quarterback: 'feed exposes no depth chart or injury data',
        injuries: 'no injury or news feed responded',
        weather: 'not carried by the feed',
        restAndTravel: 'not carried by the feed',
        halfData: 'feed carries final scores only; the first-half split is proportional',
      },
      coverProbability: data.coverProbability ?? 0.7,
      games: data.games.map((g) => ({
        kickoff: g.kickoff?.toISOString() ?? null,
        kickoffLocal: formatTime(g.kickoff, data.tz),
        home: g.home,
        away: g.away,
        projection: g.projection,
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
