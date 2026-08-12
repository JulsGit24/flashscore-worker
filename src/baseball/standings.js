// Records, form and head-to-head for baseball.
//
// The arithmetic here is identical to the basketball side: wins and losses with
// no draws, scored and allowed accumulated per team, most recent season only,
// season boundaries found by the same gap rule. So it is imported rather than
// duplicated — the only real difference is vocabulary, where basketball says
// points and baseball says runs, and that belongs in the report rather than in
// the counting.
//
// One thing worth stating: baseball's "no draws" is true of the final score but
// not of regulation. A tied game goes to extra innings and comes back with a
// winner, so a finished game always has one — which is exactly what these
// counters assume.

export {
  FORM_WINDOW,
  buildStandings,
  headToHead,
  headToHeadSummary,
  recentForm,
} from '../basketball/standings.js';
