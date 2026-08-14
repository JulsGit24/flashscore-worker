# WNBA slate — 2026-08-14

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
| 19:30 | Indiana Fever W *(H)* | Dallas Wings W *(A)* | 92.2–86.0 | Indiana Fever W -6.3 | 178.2 | 71% | 29% | WWWLL | WWLLL | 94/88 | 89/94 | — | ◑ |
| 22:00 | Seattle Storm W *(H)* | Portland Fire W *(A)* | 90.0–91.5 | Portland Fire W -1.5 | 181.4 | 45% | 55% | WLLLL | LWWW | 91/94 | 95/89 | 0-2 · 193 tot | ◑ |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 19:30 | Indiana Fever W v Dallas Wings W | **Indiana Fever W +0.5** | **Over 169.5** | **Under 187.5** |
| 22:00 | Seattle Storm W v Portland Fire W | **Portland Fire W +5.5** | **Over 172.5** | **Under 190.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 22:00 | Seattle Storm W v Portland Fire W | -2.0 | +2.4 | **4.4** | -1.5 | 55% | ◑ |
| 19:30 | Indiana Fever W v Dallas Wings W | +2.3 | -1.0 | **3.3** | +6.3 | 71% | ◑ |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**Indiana Fever W v Dallas Wings W** — quarter sample: 5 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 23.3–22.7 | 45.9 | +0.6 | 51% | 7% | 43% |
| Q2 | 23.9–21.4 | 45.3 | +2.6 | 64% | 6% | 30% |
| Q3 | 21.7–21.5 | 43.1 | +0.2 | 48% | 7% | 45% |
| Q4 | 23.3–20.5 | 43.8 | +2.9 | 66% | 6% | 28% |
| H1 | 47.2–44.1 | 91.3 | +3.1 | 63% | 5% | 33% |
| H2 | 45.0–42.0 | 87.0 | +3.0 | 62% | 5% | 33% |

Best quarter for Indiana Fever W: **Q4** · for Dallas Wings W: **Q3**

**Seattle Storm W v Portland Fire W** — quarter sample: 4 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 23.6–24.0 | 47.5 | -0.4 | 44% | 7% | 49% |
| Q2 | 22.3–22.6 | 44.8 | -0.3 | 44% | 7% | 49% |
| Q3 | 22.3–22.7 | 45.0 | -0.3 | 44% | 7% | 49% |
| Q4 | 21.8–22.3 | 44.1 | -0.4 | 43% | 7% | 50% |
| H1 | 45.9–46.6 | 92.5 | -0.7 | 44% | 5% | 51% |
| H2 | 44.1–45.0 | 89.1 | -0.9 | 43% | 5% | 52% |

Best quarter for Seattle Storm W: **Q2** · for Portland Fire W: **Q4**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 19:30 | Indiana Fever W v Dallas Wings W | 178.2 | 157–199 | 175.5 → 56% · 180.5 → 44% · 185.5 → 33% |
| 22:00 | Seattle Storm W v Portland Fire W | 181.4 | 160–203 | 175.5 → 64% · 180.5 → 52% · 185.5 → 40% |

## Head to head

**Seattle Storm W v Portland Fire W**

- 2026-08-09 — Portland Fire W 100–93 Seattle Storm W (total 193)
- 2026-08-09 — Portland Fire W 100–93 Seattle Storm W (total 193)

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

117 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 11 days of results (1 newly fetched, 0 failed) · 46 games with quarter splits · generated 2026-08-14T18:00:59.847Z
