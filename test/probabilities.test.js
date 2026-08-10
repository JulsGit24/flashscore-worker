import assert from 'node:assert/strict';
import { test } from 'node:test';
import { favourite, outcomeProbabilities, poissonPmf } from '../src/probabilities.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('poissonPmf matches hand-computed values', () => {
  // P(0; 1) = e^-1
  assert.ok(close(poissonPmf(0, 1), Math.exp(-1)));
  // P(2; 1.5) = e^-1.5 · 1.5^2 / 2
  assert.ok(close(poissonPmf(2, 1.5), (Math.exp(-1.5) * 2.25) / 2));
  // A team expected to score nothing scores nothing.
  assert.equal(poissonPmf(0, 0), 1);
  assert.equal(poissonPmf(3, 0), 0);
});

test('the three outcomes sum to one', () => {
  for (const [h, a] of [[1.4, 1.1], [3.2, 0.3], [0.7, 0.7], [2.5, 2.5]]) {
    const p = outcomeProbabilities(h, a);
    assert.ok(close(p.home + p.draw + p.away, 1, 1e-9), `${h}/${a} summed to ${p.home + p.draw + p.away}`);
  }
});

test('an evenly matched game is symmetric with a large draw share', () => {
  const p = outcomeProbabilities(1.3, 1.3);
  assert.ok(close(p.home, p.away, 1e-9), 'equal expectations should give equal win chances');
  assert.ok(p.draw > 0.2 && p.draw < 0.32, `draw share looks wrong: ${p.draw}`);
});

test('a dominant home side is heavily favoured', () => {
  const p = outcomeProbabilities(3.5, 0.4);
  assert.ok(p.home > 0.85, `expected a strong favourite, got ${p.home}`);
  assert.ok(p.away < 0.05);
  assert.ok(p.btts < 0.35, 'a side expected to score 0.4 rarely scores');
});

test('both-teams-to-score and over 2.5 move with the expectations', () => {
  const low = outcomeProbabilities(0.7, 0.6);
  const high = outcomeProbabilities(2.2, 1.9);
  assert.ok(high.btts > low.btts);
  assert.ok(high.over25 > low.over25);
  assert.ok(high.over25 > 0.7, `4.1 expected goals should be over 2.5 most of the time: ${high.over25}`);
  assert.ok(low.over25 < 0.25);
});

test('btts and over25 stay within 0-1', () => {
  for (const [h, a] of [[0, 0], [6, 6], [0.1, 5]]) {
    const p = outcomeProbabilities(h, a);
    for (const key of ['home', 'draw', 'away', 'btts', 'over25']) {
      assert.ok(p[key] >= 0 && p[key] <= 1, `${key} out of range for ${h}/${a}: ${p[key]}`);
    }
  }
});

test('favourite names the most likely outcome', () => {
  assert.deepEqual(favourite({ home: 0.7, draw: 0.2, away: 0.1 }, 'Home', 'Away').where, 'H');
  assert.deepEqual(favourite({ home: 0.1, draw: 0.2, away: 0.7 }, 'Home', 'Away').side, 'Away');
  const d = favourite({ home: 0.3, draw: 0.4, away: 0.3 }, 'Home', 'Away');
  assert.equal(d.where, 'D');
  assert.equal(d.side, 'Draw');
});
