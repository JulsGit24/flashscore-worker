# WNBA slate — 2026-09-21

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
| 20:00 | New York Liberty W *(H)* | Atlanta Dream W *(A)* | 88.9–87.4 | New York Liberty W -1.5 | 176.3 | 55% | 45% | WWWWL | WWWWW | 84/70 | 101/72 | — | ● |
| 22:00 | Phoenix Mercury W *(H)* | Dallas Wings W *(A)* | 85.6–88.3 | Dallas Wings W -2.7 | 173.9 | 41% | 59% | LWWLL | WWWWW | 87/84 | 95/76 | 0-1 · 169 tot | ● |

## Lines that clear 70%

The inverse of the usual question: not the odds at a posted line, but the line that is 70% likely to land. Quoted on half points so nothing can push.

| Tip | Game | Spread 70% | Total over | Total under |
|---|---|---|---|---|
| 20:00 | New York Liberty W v Atlanta Dream W | **New York Liberty W +5.5** | **Over 167.5** | **Under 185.5** |
| 22:00 | Phoenix Mercury W v Dallas Wings W | **Dallas Wings W +3.5** | **Over 164.5** | **Under 183.5** |

## Biggest strength gaps

Net rating is points scored minus points allowed per game. The gap is the distance between the two sides — the measurable stand-in for a roster mismatch, since the feed carries no player data.

| Tip | Game | Net H | Net A | Gap | Margin | Win% fav | ? |
|---|---|---:|---:|---:|---:|---:|:-:|
| 22:00 | Phoenix Mercury W v Dallas Wings W | -1.6 | +4.1 | **5.6** | -2.7 | 59% | ● |
| 20:00 | New York Liberty W v Atlanta Dream W | +6.9 | +8.7 | **1.8** | +1.5 | 55% | ● |

## Quarters and halves

Points per period, and who takes it. Built from each side’s share of its own scoring by quarter against how much the opponent concedes in that quarter, then applied to the whole-game projection. A quarter can be tied, so the tie carries its own probability rather than being folded into a winner.

**New York Liberty W v Atlanta Dream W** — quarter sample: 18 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 22.6–21.6 | 44.3 | +1.0 | 54% | 7% | 40% |
| Q2 | 22.0–21.8 | 43.8 | +0.2 | 48% | 7% | 45% |
| Q3 | 22.7–22.2 | 44.9 | +0.4 | 49% | 7% | 44% |
| Q4 | 21.6–21.7 | 43.3 | -0.1 | 46% | 7% | 47% |
| H1 | 44.6–43.4 | 88.0 | +1.2 | 53% | 5% | 42% |
| H2 | 44.3–43.9 | 88.2 | +0.4 | 50% | 5% | 46% |

Best quarter for New York Liberty W: **Q1** · for Atlanta Dream W: **Q4**

**Phoenix Mercury W v Dallas Wings W** — quarter sample: 15 game(s) each

| Period | Points H–A | Total | Margin | Win H | Tie | Win A |
|---|---|---:|---:|---:|---:|---:|
| Q1 | 21.8–23.2 | 45.0 | -1.4 | 37% | 7% | 56% |
| Q2 | 21.1–22.0 | 43.1 | -0.9 | 40% | 7% | 53% |
| Q3 | 20.7–21.8 | 42.5 | -1.0 | 39% | 7% | 54% |
| Q4 | 22.0–21.3 | 43.3 | +0.7 | 51% | 7% | 42% |
| H1 | 42.9–45.2 | 88.1 | -2.3 | 37% | 5% | 59% |
| H2 | 42.7–43.1 | 85.8 | -0.4 | 46% | 5% | 50% |

Best quarter for Phoenix Mercury W: **Q4** · for Dallas Wings W: **Q1**

## Totals — over/under by line

| Tip | Game | Proj total | 80% range | Over lines |
|---|---|---:|---|---|
| 20:00 | New York Liberty W v Atlanta Dream W | 176.3 | 155–197 | 170.5 → 64% · 175.5 → 52% · 180.5 → 40% |
| 22:00 | Phoenix Mercury W v Dallas Wings W | 173.9 | 153–195 | 170.5 → 58% · 175.5 → 46% · 180.5 → 34% |

## Head to head

**Phoenix Mercury W v Dallas Wings W**

- 2026-09-19 — Dallas Wings W 87–82 Phoenix Mercury W (total 169)

## Not covered

Player props and injury status are **not** in this report, and the strength gap above is a team measure, not a roster one.

The feed behind this report carries team scores and quarter splits only — its per-match detail endpoint returns `1st Quarter 16-6, 2nd Quarter 12-18, …` and nothing at player level. The WNBA’s own stats endpoints were probed as an alternative and time out from a datacenter host, which is how they behave for cloud IPs generally. Props need a keyed feed; see the README.

---

87 basketball games worldwide · 2 WNBA · 15 teams in the derived table from 49 days of results (1 newly fetched, 0 failed) · 139 games with quarter splits · generated 2026-09-21T20:44:43.769Z
