// The visual report: a normalised document rendered to a printable HTML page,
// which Chrome then turns into the PDF.
//
// One renderer for all three sports. The models differ enormously — Poisson
// scorelines, normal margins, negative binomial runs — but what a reader needs
// on the page is the same shape every time: who is playing, when, how likely
// each side is to win, how much scoring to expect, and how much of that rests
// on real results. So each sport maps into the common document in model.js and
// the layout is written once, here.
//
// Design constraints worth stating, because they drove most of the decisions:
//
//   * It is paper. No hover, no tooltips, no scrolling — every number has to be
//     legible standing still, and anything that would have been a tooltip is
//     printed instead.
//   * A card must not straddle a page break. `break-inside: avoid` on every
//     card, and grouped headers repeat.
//   * A missing crest must look deliberate. Images come off a remote host and
//     some teams have none, so the fallback is a lettered monogram rather than
//     a broken-image icon.

const CONFIDENCE_LABEL = {
  baseline: 'league baseline, no results yet',
  low: '1-2 games played',
  medium: '3-4 games played',
  high: '5+ games played',
};

const CONFIDENCE_DOTS = { baseline: 0, low: 1, medium: 2, high: 3 };

/** Accent per sport, so three reports open side by side stay distinguishable. */
const ACCENT = {
  soccer: { hue: '152 55% 32%', soft: '152 45% 94%' },
  basketball: { hue: '24 78% 45%', soft: '24 80% 95%' },
  baseball: { hue: '221 60% 40%', soft: '221 60% 95%' },
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Initials for a team with no crest — two letters reads better than one. */
export function monogram(name) {
  const words = String(name ?? '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function crest(team) {
  const label = escapeHtml(team.name);
  if (team.crest) {
    // onerror swaps in the monogram, so a 404 from the image host degrades to
    // the same fallback as a team with no crest at all.
    return (
      `<span class="crest"><img src="${escapeHtml(team.crest)}" alt="" ` +
      `onerror="this.replaceWith(Object.assign(document.createElement('span'),` +
      `{className:'mono',textContent:${JSON.stringify(monogram(team.name))}}))"></span>`
    );
  }
  return `<span class="crest"><span class="mono">${escapeHtml(monogram(label))}</span></span>`;
}

function bar(segments) {
  if (!segments?.length) return '';
  const cells = segments
    .map((s) => {
      const pct = Math.max(0, Math.min(100, s.pct * 100));
      // Below about 12% there is no room for text without it colliding.
      const inner = pct >= 12 ? `${s.label} ${Math.round(pct)}%` : '';
      return (
        `<span class="seg seg-${s.tone}" style="width:${pct.toFixed(2)}%">` +
        `<span>${escapeHtml(inner)}</span></span>`
      );
    })
    .join('');
  return `<div class="bar">${cells}</div>`;
}

function formPills(form) {
  if (!form || !form.streak) return '<span class="muted">no results yet</span>';
  const pills = [...form.streak]
    .map((r) => `<span class="pill pill-${r.toLowerCase()}">${escapeHtml(r)}</span>`)
    .join('');
  const sub = form.sub ? `<span class="form-sub">${escapeHtml(form.sub)}</span>` : '';
  return `<span class="form">${pills}${sub}</span>`;
}

function confidenceMark(level) {
  const filled = CONFIDENCE_DOTS[level] ?? 0;
  const dots = [0, 1, 2]
    .map((i) => `<i class="${i < filled ? 'on' : ''}"></i>`)
    .join('');
  return (
    `<span class="conf" title="${escapeHtml(CONFIDENCE_LABEL[level] ?? '')}">${dots}` +
    `<span class="conf-label">${escapeHtml(CONFIDENCE_LABEL[level] ?? level)}</span></span>`
  );
}

function statBlocks(stats) {
  if (!stats?.length) return '';
  return (
    '<div class="stats">' +
    stats
      .map(
        (s) =>
          `<div class="stat${s.tone ? ` stat-${s.tone}` : ''}">` +
          `<div class="stat-v">${escapeHtml(s.value)}</div>` +
          `<div class="stat-k">${escapeHtml(s.label)}</div></div>`,
      )
      .join('') +
    '</div>'
  );
}

function tagChips(tags) {
  if (!tags?.length) return '';
  return (
    '<div class="tags">' +
    tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('') +
    '</div>'
  );
}

function card(c) {
  return `
    <article class="card${c.strong ? ' strong' : ''}">
      <div class="card-top">
        <span class="time">${escapeHtml(c.time)}</span>
        ${c.note ? `<span class="note">${escapeHtml(c.note)}</span>` : ''}
        ${confidenceMark(c.confidence)}
      </div>
      <div class="teams">
        <div class="team">${crest(c.home)}<span class="tname">${escapeHtml(c.home.name)}</span><span class="ha">H</span></div>
        <div class="vs">v</div>
        <div class="team away"><span class="ha">A</span><span class="tname">${escapeHtml(c.away.name)}</span>${crest(c.away)}</div>
      </div>
      ${bar(c.bars)}
      ${statBlocks(c.stats)}
      <div class="forms">
        <div class="form-row"><span class="form-k">${escapeHtml(c.home.name)}</span>${formPills(c.form?.home)}</div>
        <div class="form-row"><span class="form-k">${escapeHtml(c.away.name)}</span>${formPills(c.form?.away)}</div>
      </div>
      ${tagChips(c.tags)}
    </article>`;
}

function group(g) {
  const logo = g.logo
    ? `<img class="glogo" src="${escapeHtml(g.logo)}" alt="" onerror="this.remove()">`
    : '';
  return `
    <section class="group">
      <header class="ghead">
        ${logo}
        <span class="gflag">${g.flag ?? ''}</span>
        <span class="gname">${escapeHtml(g.label)}</span>
        ${g.sub ? `<span class="gsub">${escapeHtml(g.sub)}</span>` : ''}
        <span class="gcount">${g.cards.length} game${g.cards.length === 1 ? '' : 's'}</span>
      </header>
      <div class="cards">${g.cards.map(card).join('')}</div>
    </section>`;
}

function highlight(h) {
  if (!h.cards.length) {
    return `
      <section class="hl empty">
        <h2>${escapeHtml(h.title)}</h2>
        <p class="empty-note">${escapeHtml(h.emptyNote ?? 'Nothing today.')}</p>
      </section>`;
  }
  return `
    <section class="hl">
      <h2>${escapeHtml(h.title)}</h2>
      ${h.blurb ? `<p class="blurb">${escapeHtml(h.blurb)}</p>` : ''}
      <div class="cards">${h.cards.map(card).join('')}</div>
    </section>`;
}

export function renderHtml(doc) {
  const accent = ACCENT[doc.sport] ?? ACCENT.soccer;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)} — ${escapeHtml(doc.date)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }

  :root {
    --accent: hsl(${accent.hue});
    --accent-soft: hsl(${accent.soft});
    --ink: #16181d;
    --ink-2: #4a5060;
    --ink-3: #7b8291;
    --line: #e3e6ec;
    --bg-card: #fff;
    --win: #1f8f4e;
    --draw: #b8860b;
    --loss: #c0392b;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 10pt/1.45 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* --- masthead ------------------------------------------------------- */
  .mast {
    border-top: 4px solid var(--accent);
    background: var(--accent-soft);
    padding: 14px 16px;
    margin-bottom: 16px;
  }
  .mast h1 { margin: 0; font-size: 19pt; letter-spacing: -0.4px; }
  .mast .sub { color: var(--ink-2); margin-top: 3px; font-size: 9.5pt; }
  .kpis { display: flex; gap: 18px; margin-top: 11px; flex-wrap: wrap; }
  .kpi .v { font-size: 15pt; font-weight: 700; color: var(--accent); line-height: 1.1; }
  .kpi .k { font-size: 7.8pt; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.6px; }

  h2 { font-size: 12.5pt; margin: 0 0 3px; letter-spacing: -0.2px; }
  .blurb, .empty-note { color: var(--ink-2); font-size: 8.8pt; margin: 0 0 9px; max-width: 62em; }
  .empty-note { font-style: italic; }

  .hl { margin-bottom: 18px; break-inside: avoid; }
  .hl.empty { padding-bottom: 4px; }

  /* --- competition groups ---------------------------------------------- */
  .group { margin-bottom: 15px; break-inside: avoid-page; }
  .ghead {
    display: flex; align-items: center; gap: 8px;
    border-bottom: 2px solid var(--accent);
    padding-bottom: 4px; margin-bottom: 8px;
  }
  .glogo { height: 17px; width: auto; max-width: 30px; object-fit: contain; }
  .gflag { font-size: 12pt; line-height: 1; }
  .gname { font-weight: 700; font-size: 10.5pt; }
  .gsub { color: var(--ink-3); font-size: 8.4pt; }
  .gcount { margin-left: auto; color: var(--ink-3); font-size: 8pt; }

  /* --- cards ------------------------------------------------------------ */
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .card {
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 9px 10px;
    background: var(--bg-card);
    break-inside: avoid;
  }
  .card.strong { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }

  .card-top { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .time { font-weight: 700; font-size: 10pt; font-variant-numeric: tabular-nums; }
  .note { font-size: 7.6pt; color: var(--ink-3); }
  .conf { margin-left: auto; display: flex; align-items: center; gap: 3px; }
  .conf i {
    width: 5px; height: 5px; border-radius: 50%;
    background: #d5d9e0; display: inline-block;
  }
  .conf i.on { background: var(--accent); }
  .conf-label { font-size: 6.8pt; color: var(--ink-3); margin-left: 2px; }

  .teams { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
  .team { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .team.away { justify-content: flex-end; }
  .tname { font-weight: 600; font-size: 9.6pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ha {
    font-size: 6.6pt; color: var(--ink-3); border: 1px solid var(--line);
    border-radius: 3px; padding: 0 3px; flex: none;
  }
  .vs { color: var(--ink-3); font-size: 8pt; flex: none; }
  .crest { width: 20px; height: 20px; flex: none; display: flex; align-items: center; justify-content: center; }
  .crest img { max-width: 20px; max-height: 20px; object-fit: contain; }
  .mono {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent-soft); color: var(--accent);
    font-size: 7.4pt; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }

  /* --- probability bar -------------------------------------------------- */
  .bar { display: flex; height: 17px; border-radius: 4px; overflow: hidden; margin-bottom: 7px; }
  .seg { display: flex; align-items: center; justify-content: center; min-width: 0; }
  .seg span {
    font-size: 7.2pt; font-weight: 700; color: #fff;
    white-space: nowrap; overflow: hidden;
  }
  .seg-home { background: var(--accent); }
  .seg-draw { background: #9aa2b1; }
  .seg-away { background: #33415c; }

  /* --- stat blocks ------------------------------------------------------ */
  .stats { display: flex; gap: 5px; margin-bottom: 7px; }
  .stat {
    flex: 1; text-align: center; background: #f6f7f9;
    border-radius: 5px; padding: 4px 2px; min-width: 0;
  }
  .stat-v { font-weight: 700; font-size: 9.6pt; font-variant-numeric: tabular-nums; }
  .stat-k { font-size: 6.6pt; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.3px; }
  .stat-hot { background: var(--accent-soft); }
  .stat-hot .stat-v { color: var(--accent); }

  /* --- form ------------------------------------------------------------- */
  .forms { display: flex; flex-direction: column; gap: 2px; }
  .form-row { display: flex; align-items: center; gap: 5px; font-size: 7.8pt; }
  .form-k { color: var(--ink-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .form { display: flex; align-items: center; gap: 2px; flex: none; }
  .pill {
    width: 12px; height: 12px; border-radius: 3px; color: #fff;
    font-size: 6.6pt; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .pill-w { background: var(--win); }
  .pill-d, .pill-t { background: var(--draw); }
  .pill-l { background: var(--loss); }
  .form-sub { color: var(--ink-3); font-size: 7.2pt; margin-left: 4px; font-variant-numeric: tabular-nums; }
  .muted { color: var(--ink-3); font-size: 7.6pt; font-style: italic; }

  .tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
  .tag {
    font-size: 6.8pt; background: var(--accent-soft); color: var(--accent);
    border-radius: 3px; padding: 1px 5px; font-weight: 600;
  }

  /* --- back matter ------------------------------------------------------ */
  .legend { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 10px; break-inside: avoid; }
  .legend h2 { font-size: 10pt; }
  .legend dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 6px 0 0; font-size: 8.2pt; }
  .legend dt { font-weight: 700; }
  .legend dd { margin: 0; color: var(--ink-2); }

  .caveat {
    margin-top: 12px; padding: 9px 11px; border-radius: 6px;
    background: #fff8e6; border: 1px solid #f0dca8;
    font-size: 8.4pt; break-inside: avoid;
  }
  .caveat h3 { margin: 0 0 3px; font-size: 8.8pt; }
  .caveat p { margin: 0 0 5px; }
  .caveat p:last-child { margin-bottom: 0; }

  .foot { margin-top: 14px; color: var(--ink-3); font-size: 7.4pt; border-top: 1px solid var(--line); padding-top: 7px; }
</style>
</head>
<body>
  <div class="mast">
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="sub">${escapeHtml(doc.subtitle)}</div>
    <div class="kpis">
      ${doc.kpis
        .map((k) => `<div class="kpi"><div class="v">${escapeHtml(k.value)}</div><div class="k">${escapeHtml(k.label)}</div></div>`)
        .join('')}
    </div>
  </div>

  ${doc.highlights.map(highlight).join('')}
  ${doc.groups.map(group).join('')}

  <div class="legend">
    <h2>How to read this</h2>
    <dl>
      ${doc.legend.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
    </dl>
  </div>

  ${doc.caveats
    .map(
      (c) =>
        `<div class="caveat"><h3>${escapeHtml(c.title)}</h3>` +
        c.body.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
        '</div>',
    )
    .join('')}

  <div class="foot">${escapeHtml(doc.footer)}</div>
</body>
</html>`;
}
