# flashscore-worker

Every morning, produce a shortlist of the day's European league games most
likely to be worth watching — either because they project to be high scoring,
or because one side is far stronger than the other.

## What it covers

- **Geography**: UEFA member countries only.
- **Tiers**: first tier ("main") and second tier ("B") only. Third tier and
  below — League One, 3. Liga, Serie C, Primera Federación, II liga — are
  excluded, as are youth, reserve, and friendly fixtures.
- **Both genders**: men's and women's leagues are treated identically.
- Fixtures both live and still to kick off.

The competition list lives in [`src/leagues.data.js`](src/leagues.data.js).
Anything European and senior that isn't in it is reported in a **needs review**
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
  register as the best attack in Europe.
- **Low-sample damping.** If either side has played fewer than 5 games, both
  indices are scaled down and the game is tagged `few games played`.

Tags on each row explain why it made the list: `goals`, `mismatch`,
`attack v leaky`, `top v bottom`, `wide gap`, `few games played`.

See [`reports/EXAMPLE.md`](reports/EXAMPLE.md) for the output format.

## Usage

Requires Node 20+. No dependencies.

```bash
npm test                       # 33 offline tests, no network
npm run report                 # today, top 30, written to reports/
node src/index.js --help
node src/index.js --tz Europe/Madrid --min 40
node src/index.js --day-offset 1 --format json
```

Output is written to `reports/YYYY-MM-DD.md` and `reports/YYYY-MM-DD.json`.

## Scheduling it for 5am

[`.github/workflows/daily-report.yml`](.github/workflows/daily-report.yml) runs
at **05:00 America/New_York**, writes `reports/YYYY-MM-DD.md`, commits it, and
prints it to the Actions job summary.

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

Results are cached in `data/history.json` and committed, so the first run
backfills ~300 days and every later run fetches one. Ranks are computed on
points, then goal difference, then goals scored — they can differ from the
official table where a league applies a points deduction or head-to-head
tiebreaks.

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
src/leagues.data.js  European tier-1/tier-2 allowlist (men + women)
src/leagues.js       scope filtering: geography, tier, seniority
src/flashscore.js    feed client + parser
src/history.js       season results, replayed from past day feeds and cached
src/table.js         league tables + season-boundary detection
src/score.js         the goals and edge model
src/report.js        markdown and JSON rendering
src/index.js         CLI and pipeline
test/                offline tests over recorded feed samples
data/history.json    cached results (committed; regenerates if deleted)
```
