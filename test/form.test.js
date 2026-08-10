import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formTrend, recentForm } from '../src/form.js';

const DAY = 86400;
const d = (n) => 1_700_000_000 + n * DAY;
const m = (h, a, hg, ag, ts) => ({ l: 'x', h, a, hg, ag, ts });

const HISTORY = [
  m('Team', 'A', 3, 0, d(1)), // W  (oldest)
  m('B', 'Team', 2, 2, d(2)), // T
  m('Team', 'C', 0, 1, d(3)), // L
  m('D', 'Team', 0, 2, d(4)), // W
  m('Team', 'E', 1, 1, d(5)), // T
  m('F', 'Team', 4, 1, d(6)), // L  (most recent)
];

test('recentForm reads the last five, most recent first', () => {
  const form = recentForm(HISTORY, 'Team');
  assert.equal(form.played, 5);
  // Most recent first: L T W L T  (the oldest W falls outside the window)
  assert.equal(form.streak, 'LTWLT');
});

test('recentForm counts goals scored and conceded from the team perspective', () => {
  const form = recentForm(HISTORY, 'Team');
  // Window is d(2)..d(6): 2 + 0 + 2 + 1 + 1 = 6 scored
  assert.equal(form.goalsFor, 6);
  // conceded: 2 + 1 + 0 + 1 + 4 = 8
  assert.equal(form.goalsAgainst, 8);
});

test('recentForm awards 3 for a win and 1 for a tie', () => {
  const form = recentForm(HISTORY, 'Team');
  // W T T = 3 + 1 + 1 = 5 across the window
  assert.equal(form.points, 5);
  assert.equal(form.ppg, 1);
});

test('recentForm honours a shorter window', () => {
  const form = recentForm(HISTORY, 'Team', 2);
  assert.equal(form.streak, 'LT');
  assert.equal(form.played, 2);
});

test('a team with no cached games reports an empty form', () => {
  const form = recentForm(HISTORY, 'Nobody');
  assert.equal(form.played, 0);
  assert.equal(form.streak, '');
  assert.equal(form.ppg, null);
});

test('formTrend flags a side outperforming its season', () => {
  const hot = { played: 5, ppg: 2.6 };
  assert.equal(formTrend(hot, 1.2), 'ascending');
});

test('formTrend flags a side sliding below its season', () => {
  const cold = { played: 5, ppg: 0.4 };
  assert.equal(formTrend(cold, 2.1), 'descending');
});

test('formTrend calls a small difference steady', () => {
  assert.equal(formTrend({ played: 5, ppg: 1.4 }, 1.3), 'steady');
});

test('formTrend refuses to judge on too little evidence', () => {
  assert.equal(formTrend({ played: 2, ppg: 3 }, 1), 'unknown');
  assert.equal(formTrend(null, 1), 'unknown');
  assert.equal(formTrend({ played: 5, ppg: 2 }, null), 'unknown');
});
