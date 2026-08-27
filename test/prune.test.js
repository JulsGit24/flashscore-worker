import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { findPrunable, keepDates, pruneReports } from '../tools/prune-reports.js';

/** A report tree with the given dated folders, plus the odds and ends around them. */
async function fixture(dates) {
  const root = await mkdtemp(path.join(tmpdir(), 'fs-prune-'));
  const reports = path.join(root, 'reports');
  for (const [family, days] of Object.entries(dates)) {
    for (const day of days) {
      const dir = path.join(reports, family, day);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'report.md'), '# x');
      await writeFile(path.join(dir, 'report.json'), '{}');
      await writeFile(path.join(dir, 'report.pdf'), 'x'.repeat(1000));
    }
  }
  // The caches live outside reports/ and must never be touched.
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data', 'history.json'), '{"days":[]}');
  return { root, reports };
}

const NOW = new Date('2026-08-31T12:00:00Z'); // a Monday, 08:00 New York

test('keepDates counts back from today in the report timezone', () => {
  assert.deepEqual([...keepDates(1, 'America/New_York', NOW)], ['2026-08-31']);
  assert.deepEqual(
    [...keepDates(3, 'America/New_York', NOW)].sort(),
    ['2026-08-29', '2026-08-30', '2026-08-31'],
  );
  // Just after midnight UTC is still the previous day in New York, and the
  // folder names are written in New York time.
  assert.deepEqual(
    [...keepDates(1, 'America/New_York', new Date('2026-08-31T02:00:00Z'))],
    ['2026-08-30'],
  );
});

test('everything but today goes, and today stays', async () => {
  const { root, reports } = await fixture({
    europe: ['2026-08-24', '2026-08-30', '2026-08-31'],
    mlb: ['2026-08-29', '2026-08-31'],
  });

  const result = await pruneReports({ root: reports, keepDays: 1, tz: 'America/New_York', now: NOW });

  assert.deepEqual(result.kept, ['2026-08-31']);
  assert.deepEqual(
    result.removed.map((p) => path.relative(reports, p)).sort(),
    ['europe/2026-08-24', 'europe/2026-08-30', 'mlb/2026-08-29'].map((p) => p.split('/').join(path.sep)),
  );
  assert.deepEqual((await readdir(path.join(reports, 'europe'))).sort(), ['2026-08-31']);
  assert.deepEqual((await readdir(path.join(reports, 'mlb'))).sort(), ['2026-08-31']);
  assert.ok(result.bytes > 0, 'the freed size is reported');

  // The caches are the one thing that cannot be regenerated. They live outside
  // reports/ and must survive untouched.
  assert.deepEqual(await readdir(path.join(root, 'data')), ['history.json']);
});

test('a re-run on the same day is a no-op rather than destroying today', async () => {
  const { reports } = await fixture({ europe: ['2026-08-31'], wnba: ['2026-08-31'] });
  const first = await pruneReports({ root: reports, tz: 'America/New_York', now: NOW });
  assert.deepEqual(first.removed, []);

  // This is the case that matters: a forced re-run of the soccer job at midday
  // on Monday must not wipe the MLB and WNBA reports generated since 3am.
  const second = await pruneReports({ root: reports, tz: 'America/New_York', now: NOW });
  assert.deepEqual(second.removed, []);
  assert.deepEqual((await readdir(path.join(reports, 'wnba'))).sort(), ['2026-08-31']);
});

test('only YYYY-MM-DD directories are ever candidates', async () => {
  const { reports } = await fixture({ europe: ['2026-08-24'] });
  // Things that live alongside the dated folders and must be left alone.
  await writeFile(path.join(reports, 'EXAMPLE-europe.md'), '# example');
  await writeFile(path.join(reports, 'europe', 'notes.md'), 'notes');
  await mkdir(path.join(reports, 'europe', 'archive'), { recursive: true });
  await mkdir(path.join(reports, 'europe', '2026-08'), { recursive: true });
  await mkdir(path.join(reports, 'europe', '2026-8-24'), { recursive: true });

  const doomed = await findPrunable(reports, new Set(['2026-08-31']));
  assert.deepEqual(doomed.map((p) => path.basename(p)), ['2026-08-24']);
});

test('a dated folder nested deeper than the report layout is out of reach', async () => {
  const { reports } = await fixture({ europe: ['2026-08-24'] });
  await mkdir(path.join(reports, 'europe', '2026-08-24', '2026-08-01'), { recursive: true });

  const doomed = await findPrunable(reports, new Set());
  // The parent is listed once; the scan never descends to find the child.
  assert.deepEqual(doomed.map((p) => path.relative(reports, p)), ['europe/2026-08-24'.split('/').join(path.sep)]);
});

test('a symlinked family directory is not followed', async () => {
  const { root, reports } = await fixture({ europe: ['2026-08-24'] });
  const outside = path.join(root, 'elsewhere', '2026-08-01');
  await mkdir(outside, { recursive: true });
  try {
    await symlink(path.join(root, 'elsewhere'), path.join(reports, 'linked'), 'dir');
  } catch {
    return; // no symlink permission on this platform; nothing to assert
  }

  const doomed = await findPrunable(reports, new Set());
  assert.ok(
    !doomed.some((p) => p.includes('linked')),
    'a symlink out of the report root must not be traversed',
  );
});

test('dry run reports the same set but removes nothing', async () => {
  const { reports } = await fixture({ europe: ['2026-08-24', '2026-08-31'] });
  const result = await pruneReports({ root: reports, tz: 'America/New_York', now: NOW, dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.removed.length, 1);
  assert.deepEqual((await readdir(path.join(reports, 'europe'))).sort(), ['2026-08-24', '2026-08-31']);
});

test('a missing report root is not an error', async () => {
  const result = await pruneReports({ root: path.join(tmpdir(), 'fs-prune-does-not-exist'), now: NOW });
  assert.deepEqual(result.removed, []);
});

test('a wider retention window keeps the whole window', async () => {
  const { reports } = await fixture({
    europe: ['2026-08-20', '2026-08-29', '2026-08-30', '2026-08-31'],
  });
  const result = await pruneReports({ root: reports, keepDays: 3, tz: 'America/New_York', now: NOW });
  assert.deepEqual(result.removed.map((p) => path.basename(p)), ['2026-08-20']);
});
