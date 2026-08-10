// Match outcome probabilities from the two expected-goal figures.
//
// Independent Poisson for each side: P(k goals) = λ^k · e^-λ / k!. Summing the
// joint distribution over a scoreline grid gives win/draw/win, both-teams-to-
// score, and over/under. It ignores the mild negative correlation between the
// two scorelines that real matches show, so draw probability comes out a point
// or two low — fine for ranking fixtures, not for pricing a bet.

const MAX_GOALS = 10;

const FACTORIALS = (() => {
  const out = [1];
  for (let i = 1; i <= MAX_GOALS; i += 1) out[i] = out[i - 1] * i;
  return out;
})();

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / FACTORIALS[k];
}

/**
 * @param {number} homeExp expected goals for the home side
 * @param {number} awayExp expected goals for the away side
 * @returns {{home:number, draw:number, away:number, btts:number,
 *   over15:number, over25:number, over35:number, under15:number, under25:number}}
 *   probabilities in 0-1, normalised over the grid.
 */
export function outcomeProbabilities(homeExp, awayExp) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let btts = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let mass = 0;

  const homePmf = [];
  const awayPmf = [];
  for (let k = 0; k <= MAX_GOALS; k += 1) {
    homePmf[k] = poissonPmf(k, homeExp);
    awayPmf[k] = poissonPmf(k, awayExp);
  }

  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const p = homePmf[h] * awayPmf[a];
      mass += p;
      if (h > a) home += p;
      else if (h < a) away += p;
      else draw += p;
      if (h >= 1 && a >= 1) btts += p;
      if (h + a >= 2) over15 += p;
      if (h + a >= 3) over25 += p;
      if (h + a >= 4) over35 += p;
    }
  }

  // The grid truncates at 10 goals a side; renormalise so the three outcomes
  // sum to exactly 1 rather than 0.9999.
  const norm = mass > 0 ? 1 / mass : 1;
  return {
    home: home * norm,
    draw: draw * norm,
    away: away * norm,
    btts: btts * norm,
    over15: over15 * norm,
    over25: over25 * norm,
    over35: over35 * norm,
    // "will it stay under two goals" — i.e. 0 or 1 in the match.
    under15: 1 - over15 * norm,
    under25: 1 - over25 * norm,
  };
}

/** The most likely single outcome, for the "who is favoured and by how much" column. */
export function favourite(probabilities, homeName, awayName) {
  const { home, draw, away } = probabilities;
  if (home >= draw && home >= away) return { side: homeName, where: 'H', probability: home };
  if (away >= draw && away >= home) return { side: awayName, where: 'A', probability: away };
  return { side: 'Draw', where: 'D', probability: draw };
}
