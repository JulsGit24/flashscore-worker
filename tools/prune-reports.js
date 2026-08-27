#!/usr/bin/env node
// Weekly housekeeping: drop the dated report folders that are no longer wanted.
//
// The reports directory grows about 3.4 MB a day, and roughly 89% of that is
// PDFs. Left alone it passes a gigabyte within the year, so once a week the old
// folders go.
//
// This deletes files. Everything about it is therefore written to be narrow and
// boring rather than clever:
//
//   * It only ever removes a directory two levels under the root whose name is
//     exactly a YYYY-MM-DD date. `reports/EXAMPLE-europe.md`, a stray file, a
//     newly added report family — none of them match, so none can be caught.
//   * It never touches `data/`. That is where the results caches live, and the
//     league tables behind every projection are derived by replaying them. The
//     reports are output and can be regenerated; the caches are accumulated over
//     months from a feed that only serves a 7-day window, and losing them would
//     cost real information that cannot be fetched back.
//   * It refuses to follow symlinks out of the root.
//   * `--dry-run` prints exactly what would go without removing anything.
//
// Retention is expressed in days rather than hardcoded, so changing the policy
// later is a flag rather than a rewrite. The default of 1 keeps today only.

import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

/** Today, and the days before it, as ISO dates in `tz`. */
export function keepDates(keepDays, tz, now = new Date()) {
  const out = new Set();
  for (let i = 0; i < Math.max(1, keepDays); i += 1) {
    out.add(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(now.getTime() - i * 86_400_000)),
    );
  }
  return out;
}

/**
 * Dated folders under `root` that are not in `keep`.
 *
 * Returns paths only — deciding and deleting are kept apart so the decision can
 * be tested, and printed, without anything being removed.
 */
export async function findPrunable(root, keep) {
  const doomed = [];
  let families;
  try {
    families = await readdir(root, { withFileTypes: true });
  } catch {
    return doomed;
  }

  for (const family of families) {
    // A symlinked family directory could point anywhere; isDirectory() is false
    // for a symlink here, so this also rules that out.
    if (!family.isDirectory()) continue;

    const familyDir = path.join(root, family.name);
    let days;
    try {
      days = await readdir(familyDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const day of days) {
      if (!day.isDirectory()) continue;
      if (!DATE_DIR.test(day.name)) continue;
      if (keep.has(day.name)) continue;
      doomed.push(path.join(familyDir, day.name));
    }
  }
  return doomed.sort();
}

async function sizeOf(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    total += (await stat(path.join(dir, e.name))).size;
  }
  return total;
}

export async function pruneReports({ root = 'reports', keepDays = 1, tz = 'America/New_York', dryRun = false, now = new Date() } = {}) {
  const keep = keepDates(keepDays, tz, now);
  const doomed = await findPrunable(root, keep);

  let bytes = 0;
  for (const dir of doomed) {
    try {
      bytes += await sizeOf(dir);
    } catch {
      // Size is for the report line only; never let it stop the prune.
    }
    if (!dryRun) await rm(dir, { recursive: true, force: true });
  }

  return { kept: [...keep].sort(), removed: doomed, bytes, dryRun };
}

function parseArgs(argv) {
  const args = { root: 'reports', keepDays: 1, tz: process.env.REPORT_TZ ?? 'America/New_York', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--root') args.root = next();
    else if (a === '--keep-days') args.keepDays = Number(next());
    else if (a === '--tz') args.tz = next();
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
flashscore-worker — prune old dated report folders

  node tools/prune-reports.js [options]

  --root DIR       report root (default reports)
  --keep-days N    days to keep, counting back from today (default 1 = today only)
  --tz ZONE        timezone "today" is measured in (default $REPORT_TZ or America/New_York)
  --dry-run        list what would be removed, remove nothing

Only removes directories named YYYY-MM-DD, two levels under the root. Never
touches data/ — the results caches there are accumulated from a feed that only
serves a 7-day window, so unlike the reports they cannot be regenerated.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const { kept, removed, bytes, dryRun } = await pruneReports(args);
  const mb = (bytes / 1_048_576).toFixed(1);

  process.stdout.write(`Keeping: ${kept.join(', ')}\n`);
  if (!removed.length) {
    process.stdout.write('Nothing to prune.\n');
    return;
  }
  for (const dir of removed) process.stdout.write(`  ${dryRun ? 'would remove' : 'removed'} ${dir}\n`);
  process.stdout.write(
    `${dryRun ? 'Would free' : 'Freed'} ${mb} MB across ${removed.length} folders.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
