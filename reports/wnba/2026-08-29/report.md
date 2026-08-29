# WNBA slate — 2026-08-29

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
| 13:00 | New York Liberty W *(H)* | Chicago Sky W *(A)* | 92.3–82.5 | New York Liberty W -9.8 | 174.8 | 80% | 20% | LLWWL | LLLLW | 81/86 | 83/94 | 0-1 · 179 tot | ● |
| 22:00 | Phoenix Mercury W *(H)* | Toronto Tempo W *(A)* | 91.6–86.1 | Phoenix Mercury W -5.5 | 177.7 | 68% | 32% | LLLLL | LLLWL | 83/90 | 80/88 | — | ● |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 13:00 | New York Liberty W v Chicago Sky W | **New York Liberty W -3.5** | **Over 165.5** | **Under 183.5** |
| 22:00 | Phoenix Mercury W v Toronto Tempo W | **Phoenix Mercury W +1.5** | **Over 168.5** | **Under 186.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 13:00 | New York Liberty W v Chicago Sky W | +3.3 | -3.4 | **6.7** | +9.8 | 80% | ● |
| 22:00 | Phoenix Mercury W v Toronto Tempo W | -4.2 | -6.8 | **2.6** | +5.5 | 68% | ● |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**New York Liberty W v Chicago Sky W** — quarter sample: 13 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 22.6–20.3 | 42.9 | +2.3 | 62% | 6% | 31% |
| Q2 | 22.8–21.2 | 44.0 | +1.6 | 57% | 7% | 36% |
| Q3 | 24.5–19.8 | 44.3 | +4.7 | 77% | 5% | 18% |
| Q4 | 22.4–21.2 | 43.6 | +1.2 | 55% | 7% | 38% |
| H1 | 45.4–41.5 | 86.9 | +3.9 | 66% | 4% | 29% |
| H2 | 46.9–41.0 | 87.9 | +5.9 | 75% | 4% | 22% |

Best quarter for New York Liberty W: **Q3** · for Chicago Sky W: **Q4**

**Phoenix Mercury W v Toronto Tempo W** — quarter sample: 12 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 24.3–21.9 | 46.2 | +2.5 | 63% | 6% | 30% |
| Q2 | 21.6–19.9 | 41.5 | +1.6 | 58% | 7% | 36% |
| Q3 | 22.7–21.8 | 44.6 | +0.9 | 53% | 7% | 41% |
| Q4 | 23.0–22.5 | 45.4 | +0.5 | 50% | 7% | 43% |
| H1 | 45.9–41.8 | 87.7 | +4.1 | 67% | 4% | 29% |
| H2 | 45.7–44.3 | 90.0 | +1.4 | 54% | 5% | 41% |

Best quarter for Phoenix Mercury W: **Q1** · for Toronto Tempo W: **Q4**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 13:00 | New York Liberty W v Chicago Sky W | 174.8 | 154–196 | 170.5 → 60% · 175.5 → 48% · 180.5 → 37% |
| 22:00 | Phoenix Mercury W v Toronto Tempo W | 177.7 | 157–199 | 175.5 → 55% · 180.5 → 43% · 185.5 → 32% |

## Head to head

**New York Liberty W v Chicago Sky W**

- 2026-08-19 — Chicago Sky W 93–86 New York Liberty W (total 179)

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

116 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 26 days of results (1 newly fetched, 0 failed) · 106 games with quarter splits · generated 2026-08-29T19:41:50.698Z
