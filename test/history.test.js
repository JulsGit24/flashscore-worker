import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FETCH_WINDOW_DAYS, dayKeyForOffset, updateHistory } from '../src/history.js';

const NOW = new Date('2026-08-10T12:00:00Z');

async function tempCache(contents) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fsw-'));
  const file = path.join(dir, 'history.json');
  if (contents) await writeFile(file, JSON.stringify(contents));
  return file;
}

const oneMatch = (name) => [
  { l: 'england/premier-league', h: name, a: 'Other', hg: 1, ag: 0, ts: 1 },
];

test('dayKeyForOffset walks backwards from today', () => {
  assert.equal(dayKeyForOffset(0, NOW), '2026-08-10');
  assert.equal(dayKeyForOffset(-1, NOW), '2026-08-09');
  assert.equal(dayKeyForOffset(-7, NOW), '2026-08-03');
});

test('a fresh cache fetches exactly the 7-day window, never more', async () => {
  const asked = [];
  const result = await updateHistory({
    cachePath: await tempCache(),
    now: NOW,
    fetchDay: async (offset) => {
      asked.push(offset);
      return [];
    },
  });

  assert.deepEqual(asked.sort((a, b) => b - a), [-1, -2, -3, -4, -5, -6, -7]);
  assert.equal(asked.length, FETCH_WINDOW_DAYS);
  assert.equal(result.daysFetched, 7);
  assert.equal(result.daysFailed, 0);
});

test('days already cached are not refetched', async () => {
  const cache = {
    '2026-08-09': oneMatch('Cached'),
    '2026-08-08': oneMatch('Cached'),
  };
  const asked = [];
  const result = await updateHistory({
    cachePath: await tempCache(cache),
    now: NOW,
    fetchDay: async (offset) => {
      asked.push(offset);
      return [];
    },
  });

  assert.deepEqual(asked.sort((a, b) => b - a), [-3, -4, -5, -6, -7]);
  assert.equal(result.daysCached, 7);
});

test('history older than the window is retained, not re-fetched or dropped', async () => {
  // A day from three months ago: outside the fetch window, inside retention.
  const oldKey = dayKeyForOffset(-90, NOW);
  const file = await tempCache({ [oldKey]: oneMatch('Ancient') });

  const result = await updateHistory({
    cachePath: file,
    now: NOW,
    fetchDay: async () => [],
  });

  assert.ok(
    result.matches.some((m) => m.h === 'Ancient'),
    'accumulated history must survive aging out of the fetch window',
  );
  const written = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(written[oldKey], 'the old day must still be on disk');
});

test('history beyond the retention horizon is pruned', async () => {
  const staleKey = dayKeyForOffset(-500, NOW);
  const file = await tempCache({ [staleKey]: oneMatch('Stale') });

  await updateHistory({ cachePath: file, retainDays: 400, now: NOW, fetchDay: async () => [] });

  const written = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(!written[staleKey], 'days past the retention horizon should be dropped');
});

test('a failed day is counted and reported, not thrown', async () => {
  const errors = [];
  const result = await updateHistory({
    cachePath: await tempCache(),
    now: NOW,
    onError: (e) => errors.push(e),
    fetchDay: async (offset) => {
      if (offset === -3) throw new Error('feed 503');
      return [];
    },
  });

  assert.equal(result.daysFetched, 6);
  assert.equal(result.daysFailed, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /2026-08-07: feed 503/);
});
