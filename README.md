# flashscore-worker

Every morning, produce a shortlist of the day's league games most likely to be
worth watching — either because they project to be high scoring, or because one
side is far stronger than the other.

## Regions

One report per region, each a separate file:

| Region | Covers | Output |
|---|---|---|
| `europe` | UEFA member countries | `reports/europe/YYYY-MM-DD.md` |
| `americas` | South, Central and North America plus the Caribbean | `reports/americas/YYYY-MM-DD.md` |
| `asia` | Japan, South Korea and China only | `reports/asia/YYYY-MM-DD.md` |

The three country sets are disjoint, and a country in none of them is out of
scope everywhere. The day feed is worldwide, so all three reports come from one
fetch and share one results cache.

## What it covers

- **Geography**: the region's countries only.
- **Tiers**: first tier ("main") and second tier ("B") only. Third tier and
  below — League One, 3. Liga, Serie C, Primera Federación, II liga — are
  excluded, as are youth, reserve, and friendly fixtures.
- **Both genders**: men's and women's leagues are treated identically.
- Fixtures both live and still to kick off.

The competition list lives in [`src/leagues.data.js`](src/leagues.data.js).
Anything in-region and senior that isn't in it is reported in a **needs review**
section at the bottom of the report rather than being silently dropped — that's
the signal to add a league or to fix a slug that changed upstream.

## How games are ranked

Two independent 0-100 indices per fixture, from the current league table:

| Index | What it measures |
|---|---|
| **Goals** | Projected total goals, from each side's attack and defence rate relative to their league's average, split by home advantage. |
| **Edge** | How lopsided the game is: table position gap (40%), points-per-game gap (35%), and projected goal difference (25%). |

A fixture ranks on `max(goals, edge) + 0.25 × min(goals, edge)`, so a game
qualifies on either criterion but a game that is both gets a bump.

Two things keep August honest:

- **Shrinkage.** Per-game rates are pulled toward the league average with a
  4-game prior, so a team that has played twice and won 5-0 twice doesn't
  register as the best attack in its league.
- **Low-sample damping.** If either side has played fewer than 5 games, both
  indices are scaled down and the game is tagged `few games played`.

Tags on each row explain why it made the list: `goals`, `mismatch`,
`attack v leaky`, `top v bottom`, `wide gap`, `few games played`.

## What the report contains

Three sections, then the schedule:

1. **Strong favourites** — fixtures where one side is at or above the win
   threshold (default 70%, `--strong-pick`). Draws never qualify.
2. **Most goals expected** — fixtures flagged high-goals, highest total first.
3. **Full schedule** — every in-scope fixture, split into a table per country
   and league, earliest kickoff first. Leagues are ordered by their first
   kickoff so the document as a whole still reads early to late.

Per-fixture columns:

| Column | Meaning |
|---|---|
| **Home / Away** | Marked `(H)` and `(A)` so the venue is never ambiguous |
| **xG** | Projected goals, home–away |
| **Tot** | Projected total goals |
| **BTTS** | Both teams to score |
| **Win%** | Most likely result and its probability: `H`, `A` or `D` |
| **Form H / Form A** | Last 5 results, most recent first — `W` win, `T` tie, `L` loss |
| **↑ ↓ →** | Points per game across those 5 against the season average: rising, sliding, steady |
| **L5 H / L5 A** | Goals scored–conceded across those same 5 games |

Win, draw, BTTS and over-2.5 probabilities come from independent Poisson
distributions over the two projected scorelines (`src/probabilities.js`). That
ignores the mild negative correlation real scorelines show, so the draw
probability runs a point or two low — good enough to rank fixtures, not to price
a bet.

> **On "ascending / descending":** the arrows track *form trend* — a side's
> points per game over its last five against its own season average — not
> promotion or relegation. Promotion status isn't derivable from the feed, which
> only exposes the current season. Say the word if you meant promoted/relegated
> sides and I'll source it differently.

Fixtures with too little data still get a row, with their reason in **Notes**
instead of numbers, so the schedule is complete even when the model is silent.

See [`reports/EXAMPLE-europe.md`](reports/EXAMPLE-europe.md) for the output
format — the Americas and Asia reports are identical in shape.

## Usage

Requires Node 20+. No dependencies.

```bash
npm test                       # 74 offline tests, no network
npm run report                 # today, top 30, written to reports/
node src/index.js --help
node src/index.js --tz Europe/Madrid --min 40
node src/index.js --day-offset 1 --format json
node src/index.js --region americas
node src/index.js --region asia --tz Asia/Tokyo
node src/index.js --strong-pick 0.8    # only call 80%+ a strong favourite
```

Output is written to `reports/<region>/YYYY-MM-DD.md` and `.json`.

## Scheduling it for 5am

[`.github/workflows/daily-report.yml`](.github/workflows/daily-report.yml) runs
at **05:00 America/New_York**, generates all three regional reports, commits
them, and prints each to the Actions job summary.

GitHub cron is UTC and does not follow DST, so the workflow schedules both
09:03 and 10:03 UTC and a `gate` job checks the real New York hour — the slot
that isn't 5am stops before doing any work. To change the target, edit the two
cron lines and the `TZ=America/New_York` check together. Kickoff times are
printed in `America/New_York`; override with a `REPORT_TZ` repository variable
(Settings → Secrets and variables → Actions → Variables).

## Data source

The report reads the Flashscore "ninja" feed that backs flashscoreusa.com — a
delimiter-separated stream, not JSON. `src/flashscore.js` documents the shape
and keeps every field code in one `FIELDS` map so an upstream rename is a
one-line fix.

**League tables are computed, not fetched.** Flashscore's standings endpoint
could not be identified — every candidate stage id and URL shape answers HTTP
200 with a 1-byte `0` body. So the worker replays past day feeds, keeps the
finished in-scope results, and builds the tables itself (`src/history.js`,
`src/table.js`). That leaves exactly one upstream endpoint to depend on, and
guarantees the table is consistent with the fixtures being ranked.

Season boundaries are found per league rather than hardcoded: a gap of 40+ days
in a league's own fixture list is treated as the summer break, so an
autumn-spring league in August starts from zero while a summer-calendar league
keeps its season to date.

**The day feed only serves a 7-day window** (offsets -7..+7; -8 and +8 both
answer with the same 1-byte `0`). So the tables cannot be reconstructed in one
run — the worker caches each day it fetches in `data/history.json`, commits it,
and the season accumulates as the job runs each morning. A team needs 3 results
in the cache before its fixtures can be ranked; until then they are listed under
*In scope but not ranked*.

Ranks are computed on points, then goal difference, then goals scored — they can
differ from the official table where a league applies a points deduction or
head-to-head tiebreaks.

**Last season as a fallback.** When a league's current season is too thin to say
anything — fewer than 3 games for every side — the table is rebuilt to include
the previous season as well, and the league is marked *last season's table* in
the report. Better a stale prior that is labelled than three games of noise
presented as fact.

> **Known limitation.** Starting from an empty cache, the shortlist is a
> filtered fixture list rather than a ranked one for the first few weeks. To get
> ranking immediately, point `src/table.js` at an external standings API instead
> — nothing else in the pipeline needs to change.

Endpoint details can be overridden without touching code:

| Variable | Default | Purpose |
|---|---|---|
| `FS_HOST` | `local-global.flashscore.ninja` | feed host |
| `FS_PROJECT` | `2` | project id in the feed path |
| `FS_SIGN` | `SW9D1eZo` | `x-fsign` request header |
| `FS_LANG` | `en-us` | feed language |
| `FS_REFERER` | `https://www.flashscoreusa.com/` | Referer/Origin headers |

These defaults are confirmed working against the live feed. If Flashscore
rotates them, a run will report 0 fixtures and `fetchFeed` will say the response
did not look like a feed — reset `FS_PROJECT` / `FS_SIGN` from the values the
site's own network tab shows and everything downstream works unchanged.

## Layout

```
src/leagues.data.js  region country sets + tier-1/tier-2 allowlist (men + women)
src/leagues.js       scope filtering: region, tier, seniority
src/flashscore.js    feed client + parser
src/history.js       season results, replayed from past day feeds and cached
src/table.js         league tables + season-boundary detection
src/score.js         the goals and edge model
src/probabilities.js win/draw/BTTS/over-2.5 from the projected scorelines
src/form.js          last-5 streaks, goals in them, and form trend
src/report.js        markdown and JSON rendering
src/index.js         CLI and pipeline
test/                offline tests over recorded feed samples
data/history.json    cached results, all regions (committed; regenerates if deleted)
reports/<region>/    one dated report per region
```
