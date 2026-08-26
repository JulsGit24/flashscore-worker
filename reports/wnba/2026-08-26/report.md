# WNBA slate — 2026-08-26

2 games. All times **America/New_York**, earliest first.

<details><summary>Column guide</summary>

| Column | Meaning |
|---|---|
| **Proj** | Projected points, home–away |
| **Spread** | Projected margin, quoted on the favourite |
| **Total** | Projected combined points, with an 80% range |
| **Win%** | Home / away win probability from the projected margin |
| **Form** | Last 5 results, most recent first |
| **PF/PA** | Points scored and allowed per game across those 5 |
| **H2H** | Cached meetings this season: home wins–away wins, average total |
| **Q1-Q4 / H1-H2** | Projected points, margin and winner for each quarter and half |
| **?** | How much rests on these teams’ own results: ● 5+ games each · ◑ 3-4 · ◔ 1-2 · ○ none, league baseline |

</details>

## Slate

| Tip | Home | Away | Proj | Spread | Total | Win% H | Win% A | Form H | Form A | PF/PA H | PF/PA A | H2H | ? |
|---|---|---|---|---|---:|---:|---:|---|---|---|---|---|:-:|
| 19:00 | Connecticut Sun W *(H)* | Golden State Valkyries W *(A)* | 72.7–81.5 | Golden State Valkyries W -8.7 | 154.2 | 22% | 78% | WLLWW | WWLLL | 81/83 | 73/71 | — | ● |
| 22:00 | Seattle Storm W *(H)* | Toronto Tempo W *(A)* | 91.7–86.2 | Seattle Storm W -5.5 | 177.8 | 68% | 32% | LLLWL | LLWLL | 84/89 | 80/88 | — | ● |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 19:00 | Connecticut Sun W v Golden State Valkyries W | **Golden State Valkyries W -2.5** | **Over 145.5** | **Under 163.5** |
| 22:00 | Seattle Storm W v Toronto Tempo W | **Seattle Storm W +1.5** | **Over 168.5** | **Under 186.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 19:00 | Connecticut Sun W v Golden State Valkyries W | -6.4 | +6.1 | **12.5** | -8.7 | 78% | ● |
| 22:00 | Seattle Storm W v Toronto Tempo W | -3.8 | -6.4 | **2.6** | +5.5 | 68% | ● |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**Connecticut Sun W v Golden State Valkyries W** — quarter sample: 11 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 19.0–21.0 | 39.9 | -2.0 | 33% | 7% | 60% |
| Q2 | 17.3–18.9 | 36.2 | -1.6 | 36% | 7% | 58% |
| Q3 | 17.4–20.9 | 38.3 | -3.5 | 24% | 6% | 70% |
| Q4 | 19.1–20.7 | 39.8 | -1.6 | 36% | 7% | 58% |
| H1 | 36.3–39.9 | 76.2 | -3.6 | 31% | 4% | 65% |
| H2 | 36.5–41.6 | 78.1 | -5.1 | 25% | 4% | 71% |

Best quarter for Connecticut Sun W: **Q4** · for Golden State Valkyries W: **Q3**

**Seattle Storm W v Toronto Tempo W** — quarter sample: 10 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 23.1–22.6 | 45.7 | +0.5 | 50% | 7% | 43% |
| Q2 | 22.4–20.3 | 42.7 | +2.1 | 61% | 6% | 33% |
| Q3 | 23.8–21.4 | 45.2 | +2.5 | 63% | 6% | 30% |
| Q4 | 22.4–21.9 | 44.3 | +0.4 | 50% | 7% | 43% |
| H1 | 45.5–42.9 | 88.4 | +2.6 | 60% | 5% | 35% |
| H2 | 46.2–43.3 | 89.5 | +2.9 | 62% | 5% | 34% |

Best quarter for Seattle Storm W: **Q3** · for Toronto Tempo W: **Q4**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 19:00 | Connecticut Sun W v Golden State Valkyries W | 154.2 | 133–175 | 150.5 → 59% · 155.5 → 47% · 160.5 → 35% |
| 22:00 | Seattle Storm W v Toronto Tempo W | 177.8 | 157–199 | 175.5 → 56% · 180.5 → 44% · 185.5 → 32% |

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

52 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 23 days of results (1 newly fetched, 0 failed) · 96 games with quarter splits · generated 2026-08-26T19:17:53.088Z
