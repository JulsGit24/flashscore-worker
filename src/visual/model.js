// Adapters: each sport's report data mapped into the one document shape that
// render.js knows how to draw.
//
// The three models have nothing in common internally — a Poisson scoreline
// grid, a normal margin, a negative binomial run distribution — but what a
// reader needs on paper is identical in shape: who, when, how likely, how much
// scoring, and how much of that is real rather than prior. Keeping the mapping
// here means the layout is written once and a fourth sport is an adapter rather
// than a redesign.

import { countryFlag, imageUrl } from '../images.js';
import { competitionLabel, formatTime, groupFixtures } from '../report.js';

const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`);

/** Tag codes are written for a machine; these are for a person. */
const TAG_TEXT = {
  HIGH_GOALS: 'goals expected',
  MISMATCH: 'mismatch',
  TOP_VS_BOTTOM: 'top v bottom',
  WIDE_GAP: 'wide table gap',
  LOW_SAMPLE: 'few games played',
  ATTACK_VS_DEFENCE: 'best attack v weak defence',
  PREV_SEASON: "last season's table",
};

const prettyTag = (t) => TAG_TEXT[t] ?? String(t).toLowerCase().replace(/_/g, ' ');

/** Goals for and against across the last five, as a compact suffix. */
function formSub(form, unit = 'goals') {
  if (!form || !form.played) return '';
  const f = form.goalsFor ?? form.pointsFor;
  const a = form.goalsAgainst ?? form.pointsAgainst;
  if (f === undefined || a === undefined) return '';
  return `${f}-${a} ${unit}`;
}

// --- soccer ------------------------------------------------------------------

export function soccerDocument(data) {
  const { date, tz, all, ranked, stats } = data;

  const toCard = (f) => {
    const s = f.score;
    const p = s.probabilities;
    return {
      time: formatTime(f.kickoff, tz),
      confidence: s.confidence,
      strong: s.pick?.where !== 'D' && s.pick?.probability >= (data.strongPickThreshold ?? 0.7),
      home: { name: f.home, crest: imageUrl(f.homeImage) },
      away: { name: f.away, crest: imageUrl(f.awayImage) },
      bars: [
        { label: '1', pct: p.home, tone: 'home' },
        { label: 'X', pct: p.draw, tone: 'draw' },
        { label: '2', pct: p.away, tone: 'away' },
      ],
      stats: [
        { label: 'goals', value: s.projected.total.toFixed(1), tone: s.projected.total >= 3 ? 'hot' : null },
        { label: 'score', value: `${s.projected.home.toFixed(1)}–${s.projected.away.toFixed(1)}` },
        { label: 'over 2.5', value: pct(p.over25) },
        { label: 'btts', value: pct(p.btts) },
        { label: 'under 1.5', value: pct(p.under15) },
      ],
      form: {
        home: { streak: f.form?.home?.streak ?? '', sub: formSub(f.form?.home) },
        away: { streak: f.form?.away?.streak ?? '', sub: formSub(f.form?.away) },
      },
      tags: (s.tags ?? []).map(prettyTag),
      note: f.tableFromPreviousSeason ? "last season's table" : null,
    };
  };

  const picks = ranked
    .filter((f) => f.score?.pick?.where !== 'D' && f.score?.pick?.probability >= (data.strongPickThreshold ?? 0.7))
    .slice(0, 6)
    .map(toCard);

  const goals = [...ranked]
    .sort((a, b) => b.score.projected.total - a.score.projected.total)
    .slice(0, 6)
    .map(toCard);

  const groups = groupFixtures(all).map((g) => ({
    label: competitionLabel(g.league),
    sub: g.league.kind === 'international' ? 'international' : `tier ${g.league.tier}`,
    flag: countryFlag(g.league.country),
    logo: imageUrl(g.fixtures[0]?.tournament?.image),
    cards: g.fixtures.map(toCard),
  }));

  return {
    sport: 'soccer',
    date,
    title: `Soccer shortlist — ${data.regionLabel}`,
    subtitle: `${date} · all times ${tz} · ${all.length} games in scope`,
    kpis: [
      { value: String(all.length), label: 'games' },
      { value: String(picks.length), label: `at ${pct(data.strongPickThreshold ?? 0.7)}+` },
      { value: String(groups.length), label: 'competitions' },
      { value: String(stats.tablesLoaded ?? 0), label: 'tables derived' },
    ],
    highlights: [
      {
        title: `Strong favourites (${pct(data.strongPickThreshold ?? 0.7)}+)`,
        blurb:
          'One side at or above the threshold, on at least some real results. ' +
          'A call built purely on the league baseline is an artefact of the prior, not a read on the game.',
        emptyNote: `No game today has a side at ${pct(data.strongPickThreshold ?? 0.7)} or better with enough games played behind it.`,
        cards: picks,
      },
      {
        title: 'Most goals expected',
        blurb: 'Highest projected combined goals, from the two sides’ scoring and conceding rates.',
        emptyNote: 'Nothing today projects above the high-goals threshold.',
        cards: goals,
      },
    ],
    groups,
    legend: LEGEND_SOCCER,
    caveats: [
      {
        title: 'What is behind these numbers',
        body: [
          'League tables are derived by replaying past days of results, because the feed exposes no standings endpoint. A league early in its season, or newly added, will show few games played and its numbers lean on the league average instead.',
          'Line-ups, injuries and suspensions are not in this model — the feed does not carry them.',
        ],
      },
    ],
    footer:
      `${stats.totalFixtures} fixtures worldwide · ${all.length} in scope · ` +
      `${stats.tablesLoaded} league tables derived from ${stats.daysCached} days of results · ` +
      `generated ${new Date().toISOString()}`,
  };
}

const LEGEND_SOCCER = [
  ['1 / X / 2', 'Home win, draw, away win. The bar is drawn to scale.'],
  ['goals', 'Projected combined goals for the match.'],
  ['score', 'Projected goals, home–away.'],
  ['over 2.5', 'Chance of three or more goals.'],
  ['btts', 'Chance both teams score.'],
  ['under 1.5', 'Chance of nought or one goal in total.'],
  ['W D L', 'Last five results, most recent first, with goals for and against across them.'],
  ['dots', 'How much rests on these teams’ own results: three dots = 5+ games each, none = league baseline.'],
];

// --- WNBA --------------------------------------------------------------------

export function wnbaDocument(data) {
  const { date, tz, games, stats } = data;
  const cover = data.coverProbability ?? 0.7;

  const toCard = (g) => {
    const p = g.projection;
    return {
      time: formatTime(g.tipoff, tz),
      confidence: p.confidence,
      strong: Math.max(p.winProbability.home, p.winProbability.away) >= cover,
      home: { name: g.home, crest: imageUrl(g.homeImage) },
      away: { name: g.away, crest: imageUrl(g.awayImage) },
      bars: [
        { label: 'H', pct: p.winProbability.home, tone: 'home' },
        { label: 'A', pct: p.winProbability.away, tone: 'away' },
      ],
      stats: [
        { label: 'projected', value: `${p.points.home.toFixed(0)}–${p.points.away.toFixed(0)}` },
        { label: 'total', value: p.total.projected.toFixed(1), tone: 'hot' },
        { label: 'spread', value: `${p.spread.line.toFixed(1)}` },
        { label: `over ${pct(cover)}`, value: g.lines?.totalOver?.toFixed(1) ?? '—' },
        { label: 'gap', value: p.strengthGap.toFixed(1) },
      ],
      form: {
        home: { streak: g.form?.home?.streak ?? '', sub: formSub(g.form?.home, 'pts') },
        away: { streak: g.form?.away?.streak ?? '', sub: formSub(g.form?.away, 'pts') },
      },
      tags: [
        p.spread.favourite ? `${p.spread.favourite} favoured` : null,
        g.h2hSummary?.played ? `h2h ${g.h2hSummary.aWins}-${g.h2hSummary.bWins}` : null,
      ].filter(Boolean),
    };
  };

  const picks = games
    .filter((g) => Math.max(g.projection.winProbability.home, g.projection.winProbability.away) >= cover)
    .map(toCard);

  return {
    sport: 'basketball',
    date,
    title: 'WNBA slate',
    subtitle: `${date} · all times ${tz} · ${games.length} games`,
    kpis: [
      { value: String(games.length), label: 'games' },
      { value: String(picks.length), label: `at ${pct(cover)}+` },
      { value: String(stats.teamsKnown ?? 0), label: 'teams tracked' },
      { value: String(stats.gamesWithQuarters ?? 0), label: 'with quarter splits' },
    ],
    highlights: [
      {
        title: `Strong favourites (${pct(cover)}+)`,
        blurb: 'Win probability from the projected margin, with the home edge applied.',
        emptyNote: `No game today has a side at ${pct(cover)} or better.`,
        cards: picks,
      },
    ],
    groups: games.length
      ? [{ label: 'WNBA', sub: 'USA', flag: countryFlag('usa'), logo: null, cards: games.map(toCard) }]
      : [],
    legend: [
      ['H / A', 'Home and away win probability. Basketball has no draws, so the two fill the bar.'],
      ['projected', 'Projected points, home–away.'],
      ['total', 'Projected combined points.'],
      ['spread', 'Projected margin, quoted on the favourite.'],
      ['over 70%', 'The total that is 70% likely to be beaten — the line, not the odds.'],
      ['gap', 'Net rating difference: points scored minus allowed, per game, between the sides.'],
      ['W L', 'Last five results, most recent first, with points for and against across them.'],
      ['dots', 'How much rests on these teams’ own results: three dots = 5+ games each, none = league baseline.'],
    ],
    caveats: [
      {
        title: 'Not in this report',
        body: [
          'Player props and injury status are absent, and the strength gap above is a team measure, not a roster one.',
          'The feed carries team scores and quarter splits only. Its per-match endpoint returns quarter lines and nothing at player level, and the WNBA’s own stats endpoints time out from a datacenter host. Props need a keyed feed.',
        ],
      },
    ],
    footer:
      `${stats.totalGames} basketball games worldwide · ${games.length} WNBA · ` +
      `${stats.teamsKnown} teams from ${stats.daysCached} days of results · ` +
      `generated ${new Date().toISOString()}`,
  };
}

// --- MLB ---------------------------------------------------------------------

export function mlbDocument(data) {
  const { date, tz, games, stats } = data;
  const cover = data.coverProbability ?? 0.7;

  const toCard = (g) => {
    const p = g.projection;
    const over85 = p.total.overUnder.find((o) => o.line === 8.5);
    return {
      time: formatTime(g.first, tz),
      confidence: p.confidence,
      strong: Math.max(p.winProbability.home, p.winProbability.away) >= cover,
      home: { name: g.home, crest: imageUrl(g.homeImage) },
      away: { name: g.away, crest: imageUrl(g.awayImage) },
      bars: [
        { label: 'H', pct: p.winProbability.home, tone: 'home' },
        { label: 'A', pct: p.winProbability.away, tone: 'away' },
      ],
      stats: [
        { label: 'runs', value: `${p.runs.home.toFixed(1)}–${p.runs.away.toFixed(1)}` },
        { label: 'total', value: p.total.projected.toFixed(1), tone: 'hot' },
        { label: 'over 8.5', value: over85 ? pct(over85.over) : '—' },
        { label: 'RL -1.5', value: pct(p.runLine.coverProbability) },
        { label: 'F5 total', value: p.firstFive.total.projected.toFixed(1) },
      ],
      form: {
        home: { streak: g.form?.home?.streak ?? '', sub: formSub(g.form?.home, 'runs') },
        away: { streak: g.form?.away?.streak ?? '', sub: formSub(g.form?.away, 'runs') },
      },
      tags: [
        `${p.runLine.favourite} -1.5`,
        g.lines?.totalOver ? `over ${g.lines.totalOver.toFixed(1)} at ${pct(cover)}` : null,
        g.h2hSummary?.played ? `h2h ${g.h2hSummary.aWins}-${g.h2hSummary.bWins}` : null,
      ].filter(Boolean),
    };
  };

  const picks = games
    .filter(
      (g) =>
        Math.max(g.projection.winProbability.home, g.projection.winProbability.away) >= cover &&
        g.projection.confidence !== 'baseline',
    )
    .map(toCard);

  const byTotal = [...games]
    .sort((a, b) => b.projection.total.projected - a.projection.total.projected)
    .slice(0, 6)
    .map(toCard);

  return {
    sport: 'baseball',
    date,
    title: 'MLB slate',
    subtitle: `${date} · all times ${tz} · ${games.length} games`,
    kpis: [
      { value: String(games.length), label: 'games' },
      { value: String(picks.length), label: `at ${pct(cover)}+` },
      { value: String(stats.teamsKnown ?? 0), label: 'teams tracked' },
      { value: String(stats.daysCached ?? 0), label: 'days of results' },
    ],
    highlights: [
      {
        title: `Strong favourites (${pct(cover)}+)`,
        blurb: 'Win probability with extra innings resolved.',
        emptyNote:
          `No game today has a side at ${pct(cover)} or better. This is normal rather than a gap in the data: ` +
          'baseball is the least predictable of the three sports here, and a very good team beating a very bad ' +
          'one is roughly a 65% proposition.',
        cards: picks,
      },
      {
        title: 'Most runs expected',
        blurb: 'Highest projected combined runs.',
        emptyNote: 'No games today.',
        cards: byTotal,
      },
    ],
    groups: games.length
      ? [{ label: 'MLB', sub: 'USA', flag: countryFlag('usa'), logo: null, cards: games.map(toCard) }]
      : [],
    legend: [
      ['H / A', 'Home and away win probability, extra innings included. Baseball has no draws.'],
      ['runs', 'Projected runs, home–away.'],
      ['total', 'Projected combined runs.'],
      ['over 8.5', 'Chance the total clears the standard line. Near a coin flip is correct — the run distribution is right-skewed, so its median sits below its mean.'],
      ['RL -1.5', 'Chance the favourite wins by two or more.'],
      ['F5 total', 'First five innings. A proportional split of the game projection, not measured inning data.'],
      ['W L', 'Last five results, most recent first, with runs for and against across them.'],
      ['dots', 'How much rests on these teams’ own results: three dots = 5+ games each, none = league baseline.'],
    ],
    caveats: [
      {
        title: 'Starting pitchers are not in this model',
        body: [
          'In baseball the starting pitcher is the single largest per-game factor there is — larger than anything the team run rates behind these numbers can capture. The feed carries no probable-pitcher data.',
          'So treat a game with an ace against a bullpen day as under-modelled here. Park factors, weather, bullpen usage and injuries are absent for the same reason.',
        ],
      },
    ],
    footer:
      `${stats.totalGames} baseball games worldwide · ${games.length} MLB on ${date} · ` +
      `${stats.otherDays ?? 0} dropped as belonging to a neighbouring day · ` +
      `${stats.teamsKnown} teams from ${stats.daysCached} days of results · ` +
      `generated ${new Date().toISOString()}`,
  };
}
