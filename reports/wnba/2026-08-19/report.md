# WNBA slate — 2026-08-19

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
| 19:30 | Washington Mystics W *(H)* | Toronto Tempo W *(A)* | 92.8–81.3 | Washington Mystics W -11.5 | 174.0 | 84% | 16% | WWLLW | LLLLL | 81/77 | 92/101 | — | ● |
| 22:00 | Golden State Valkyries W *(H)* | Minnesota Lynx W *(A)* | 89.6–81.4 | Golden State Valkyries W -8.2 | 171.1 | 76% | 24% | WWWWW | WWWWW | 86/75 | 94/86 | — | ● |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 19:30 | Washington Mystics W v Toronto Tempo W | **Washington Mystics W -4.5** | **Over 164.5** | **Under 183.5** |
| 22:00 | Golden State Valkyries W v Minnesota Lynx W | **Golden State Valkyries W -1.5** | **Over 161.5** | **Under 180.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 19:30 | Washington Mystics W v Toronto Tempo W | +2.2 | -6.5 | **8.7** | +11.5 | 84% | ● |
| 22:00 | Golden State Valkyries W v Minnesota Lynx W | +7.9 | +2.9 | **5.0** | +8.2 | 76% | ● |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**Washington Mystics W v Toronto Tempo W** — quarter sample: 8 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 24.1–20.7 | 44.8 | +3.4 | 69% | 6% | 25% |
| Q2 | 22.1–19.4 | 41.5 | +2.8 | 65% | 6% | 28% |
| Q3 | 23.7–20.2 | 43.9 | +3.5 | 70% | 6% | 24% |
| Q4 | 22.9–21.0 | 43.9 | +1.8 | 59% | 7% | 34% |
| H1 | 46.2–40.1 | 86.3 | +6.1 | 75% | 4% | 21% |
| H2 | 46.6–41.2 | 87.8 | +5.4 | 73% | 4% | 23% |

Best quarter for Washington Mystics W: **Q3** · for Toronto Tempo W: **Q4**

**Golden State Valkyries W v Minnesota Lynx W** — quarter sample: 6 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 23.1–20.8 | 43.9 | +2.3 | 62% | 6% | 31% |
| Q2 | 21.5–20.2 | 41.6 | +1.3 | 56% | 7% | 38% |
| Q3 | 22.5–20.3 | 42.8 | +2.2 | 61% | 6% | 32% |
| Q4 | 22.6–20.1 | 42.7 | +2.4 | 63% | 6% | 30% |
| H1 | 44.6–41.0 | 85.6 | +3.6 | 65% | 4% | 31% |
| H2 | 45.1–40.4 | 85.5 | +4.7 | 70% | 4% | 26% |

Best quarter for Golden State Valkyries W: **Q4** · for Minnesota Lynx W: **Q2**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 19:30 | Washington Mystics W v Toronto Tempo W | 174.0 | 153–195 | 170.5 → 58% · 175.5 → 46% · 180.5 → 35% |
| 22:00 | Golden State Valkyries W v Minnesota Lynx W | 171.1 | 150–192 | 165.5 → 63% · 170.5 → 51% · 175.5 → 39% |

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

53 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 16 days of results (1 newly fetched, 0 failed) · 64 games with quarter splits · generated 2026-08-19T17:36:30.095Z
