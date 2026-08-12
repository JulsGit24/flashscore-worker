// HTML to PDF, via whatever Chrome the machine already has.
//
// No dependency is added for this. Chrome's headless `--print-to-pdf` is the
// same engine a browser's own Print to PDF uses, it honours @page and the print
// stylesheet, and it is preinstalled on the GitHub runners where these reports
// are actually generated (verified: Chrome 150, plus Noto Color Emoji, which is
// what makes the country flags render rather than showing tofu).
//
// Images are left as remote URLs rather than inlined. Chrome fetches them while
// printing and embeds them in the PDF, so the finished file is self-contained
// either way — and a crest that 404s degrades to the monogram fallback instead
// of failing the run.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Candidates in preference order; the runner has all four. */
export const BROWSERS = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/opt/pw-browsers/chromium',
].filter(Boolean);

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stderr });
    });
  });
}

/**
 * Render `html` to a PDF at `outPath`.
 *
 * @returns {Promise<{ok: boolean, browser?: string, error?: string}>}
 *   Never throws. A machine without a browser is a normal condition — local
 *   development, mostly — and the caller decides whether that is fatal. The
 *   markdown and JSON reports do not depend on this succeeding.
 */
export async function htmlToPdf(html, outPath, { timeoutMs = 120_000 } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fs-pdf-'));
  const htmlPath = path.join(dir, 'report.html');
  await writeFile(htmlPath, html);

  const problems = [];
  try {
    for (const browser of BROWSERS) {
      const result = await run(
        browser,
        [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          // Remote crests need this long on a cold connection; without it the
          // first page prints before any image has arrived.
          '--virtual-time-budget=20000',
          '--no-pdf-header-footer',
          `--print-to-pdf=${outPath}`,
          `file://${htmlPath}`,
        ],
        timeoutMs,
      );
      if (result.ok) return { ok: true, browser };
      problems.push(`${browser}: ${result.error ?? `exit ${result.code}`}`);
    }
    return {
      ok: false,
      error: `no usable browser found. Tried:\n  ${problems.join('\n  ')}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
