// Writing a report bundle: one dated folder holding the three files.
//
//   reports/<key>/<date>/report.md      the full detail, readable on GitHub
//   reports/<key>/<date>/report.json    the same data, for anything downstream
//   reports/<key>/<date>/report.pdf     the visual one, for actually deciding
//
// A folder per day rather than dated filenames in a flat directory, so a day's
// output stays together as the number of formats grows.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderHtml } from './render.js';
import { htmlToPdf } from './pdf.js';

/**
 * @param {object}   opts
 * @param {string}   opts.outDir    report root, e.g. "reports"
 * @param {string}   opts.key       report family, e.g. "europe" | "mlb" | "wnba"
 * @param {string}   opts.date      ISO date the report covers
 * @param {string}   opts.markdown
 * @param {string}   opts.json
 * @param {object}   opts.doc       normalised document for the visual report
 * @returns {Promise<{dir: string, pdf: boolean, warning?: string}>}
 */
export async function writeReportBundle({ outDir, key, date, markdown, json, doc }) {
  const dir = path.join(outDir, key, date);
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, 'report.md'), markdown);
  await writeFile(path.join(dir, 'report.json'), json);

  const html = renderHtml(doc);
  const result = await htmlToPdf(html, path.join(dir, 'report.pdf'));

  if (result.ok) return { dir, pdf: true };

  // No browser here — normal in local development. Keep the HTML so the visual
  // report is not simply lost, and say plainly that the PDF is missing rather
  // than leaving a stale one from a previous run to be read as today's.
  await writeFile(path.join(dir, 'report.html'), html);
  return {
    dir,
    pdf: false,
    warning:
      `PDF not written (${result.error}).\n` +
      `  Wrote ${path.join(dir, 'report.html')} instead — open it in a browser, or print it to PDF.`,
  };
}
