# WNBA slate — 2026-09-23

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
| 20:00 | New York Liberty W *(H)* | Atlanta Dream W *(A)* | 88.6–88.3 | New York Liberty W -0.3 | 176.9 | 51% | 49% | LLWWW | WWWWW | 92/84 | 101/78 | 0-2 · 179 tot | ● |
| 22:00 | Seattle Storm W *(H)* | Dallas Wings W *(A)* | 81.5–89.5 | Dallas Wings W -8.0 | 171.0 | 24% | 76% | LLLLW | LWWWW | 75/90 | 93/79 | 0-1 · 162 tot | ● |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 20:00 | New York Liberty W v Atlanta Dream W | **New York Liberty W +6.5** | **Over 167.5** | **Under 186.5** |
| 22:00 | Seattle Storm W v Dallas Wings W | **Dallas Wings W -1.5** | **Over 161.5** | **Under 180.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 22:00 | Seattle Storm W v Dallas Wings W | -7.3 | +3.8 | **11.1** | -8.0 | 76% | ● |
| 20:00 | New York Liberty W v Atlanta Dream W | +5.9 | +8.8 | **3.0** | +0.3 | 51% | ● |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**New York Liberty W v Atlanta Dream W** — quarter sample: 20 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 22.8–21.8 | 44.6 | +1.0 | 53% | 7% | 40% |
| Q2 | 21.4–21.6 | 43.0 | -0.2 | 45% | 7% | 48% |
| Q3 | 22.8–23.1 | 45.9 | -0.3 | 45% | 7% | 49% |
| Q4 | 21.7–21.8 | 43.5 | -0.2 | 45% | 7% | 48% |
| H1 | 44.2–43.4 | 87.6 | +0.8 | 51% | 5% | 44% |
| H2 | 44.5–44.9 | 89.4 | -0.4 | 46% | 5% | 50% |

Best quarter for New York Liberty W: **Q1** · for Atlanta Dream W: **Q3**

**Seattle Storm W v Dallas Wings W** — quarter sample: 15 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 19.5–24.2 | 43.7 | -4.7 | 18% | 5% | 77% |
| Q2 | 20.5–22.7 | 43.2 | -2.3 | 32% | 6% | 62% |
| Q3 | 20.8–22.0 | 42.8 | -1.2 | 39% | 7% | 55% |
| Q4 | 20.7–20.6 | 41.3 | +0.2 | 48% | 7% | 45% |
| H1 | 40.0–46.9 | 86.9 | -6.9 | 18% | 3% | 78% |
| H2 | 41.5–42.6 | 84.1 | -1.1 | 42% | 5% | 53% |

Best quarter for Seattle Storm W: **Q4** · for Dallas Wings W: **Q1**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 20:00 | New York Liberty W v Atlanta Dream W | 176.9 | 156–198 | 170.5 → 65% · 175.5 → 53% · 180.5 → 41% |
| 22:00 | Seattle Storm W v Dallas Wings W | 171.0 | 150–192 | 165.5 → 63% · 170.5 → 51% · 175.5 → 39% |

## Head to head

**New York Liberty W v Atlanta Dream W**

- 2026-09-22 — New York Liberty W 84–95 Atlanta Dream W (total 179)
- 2026-09-22 — New York Liberty W 84–95 Atlanta Dream W (total 179)

**Seattle Storm W v Dallas Wings W**

- 2026-08-23 — Dallas Wings W 92–70 Seattle Storm W (total 162)

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

127 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 51 days of results (1 newly fetched, 0 failed) · 147 games with quarter splits · generated 2026-09-23T20:15:23.595Z
