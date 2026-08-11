import {
  EXCLUDED_SLUGS,
  INTERNATIONAL_EXCLUDED,
  LEAGUE_INDEX,
  regionOf,
} from './leagues.data.js';

/**
 * Competition names that are third tier or below, or otherwise not senior
 * domestic league football. These run before the allowlist so a renamed slug
 * can never accidentally let a Regionalliga or an U19 side into the report.
 */
const TIER3_PLUS_PATTERNS = [
  /\bleague\s*(one|two|1|2)\b/i,          // England tiers 3-4
  /\bnational\s*league\b/i,               // England tier 5 (Gibraltar is allowlisted by slug)
  /\b3\.?\s*liga\b/i,                     // Germany / Austria tier 3
  /\bregionalliga\b|\boberliga\b|\bverbandsliga\b/i,
  /\bserie\s*[cd]\b/i,                    // Italy tiers 3-4
  /\bprimera\s+federaci|segunda\s+federaci|tercera\b/i, // Spain tiers 3-5
  /\bnational\s*[23]\b|\bchampionnat\s+national\b/i,     // France tiers 3-4
  /\btweede\s+divisie\b|\bderde\s+divisie\b/i,           // Netherlands tiers 3-4
  /\bliga\s*3\b|\bliga\s*iii\b|\b3\.?\s*lig\b/i,
  /\bii\s+liga\b|\biii\s+liga\b/i,        // Poland tiers 3-4 (I liga is tier 2)
  /\b(third|fourth|fifth)\s+(division|league|tier)\b/i,
  /\b2\.?\s*deild\b|\b3\.?\s*deild\b/i,
  /\besiliiga\s*b\b|\b1\.?\s*lyga\s*b\b/i,
  // Seen in live feeds: "Division 2", "Division 3 - Group 4". Tier-2 leagues
  // that the feed calls "Division 1" are allowlisted by slug before this runs.
  /\bdivision\s*[2-9]\b/i,
  // English non-league pyramid (tier 7 and below).
  /\bisthmian\b|\bsouthern league\b|\bnorthern premier\b|\bcombined counties\b/i,
  // Americas: tier 3 and below.
  /\bprimera\s+b\s+metropolitana\b|\btorneo\s+federal\b/i,        // Argentina
  /\bsegunda\s+divisi[oó]n\s+profesional\b/i,                       // Chile
  /\bliga\s+premier\b|\bserie\s+a\s+de\s+m[eé]xico\b/i,           // Mexico
  /\bsegunda\s+categor[ií]a\b|\bcopa\s+per[uú]\b/i,                 // Ecuador / Peru
  // Asia: tier 3 and below.
  /\bj3\s*league\b|\bjfl\b/i,                                       // Japan
  /\bk[3-7]\s*league\b/i,                                            // Korea
  /\bchina\s+league\s+two\b/i,
];

/** Not senior first-team league football at all. */
const NON_SENIOR_PATTERNS = [
  /\bu-?1[0-9]\b|\bu-?2[0-3]\b/i,
  /\byouth\b|\bjunior\b|\bacademy\b|\bprimavera\b|\bcampeonato de juniores\b/i,
  /\breserve\b|\breserves\b/i,
  /\bfriendl/i,
  /\bfutsal\b|\bbeach\b|\besports\b|\bsimulated\b|\bcyber\b/i,
  /\bplay\s*offs?\b.*\bqualification\b/i,
  // Spanish- and Portuguese-language youth grades.
  /\bsub-?\s?(1[0-9]|2[0-3])\b/i,
];

/**
 * Decide whether a competition belongs in the report.
 *
 * @param {{country: string, slug: string, name: string}} competition
 *   `country` and `slug` come from the Flashscore URL path
 *   (/soccer/<country>/<slug>/); `name` is the display header.
 * @returns {{include: boolean, league?: object, reason: string}}
 */
export function classifyCompetition(competition) {
  const { country, slug, name } = competition;
  const label = `${name ?? ''} ${slug ?? ''}`;

  // A country outside every configured region is out of scope for all reports.
  if (!country || !regionOf(country)) {
    return { include: false, reason: 'out-of-region' };
  }
  for (const re of NON_SENIOR_PATTERNS) {
    if (re.test(label)) return { include: false, reason: 'not-senior-football' };
  }

  // Explicit exclusions win over everything: these are competitions whose name
  // gives no reliable clue to their tier in their own country.
  if (EXCLUDED_SLUGS.has(`${country}/${slug}`)) {
    return { include: false, reason: 'tier-3-or-below' };
  }
  if (INTERNATIONAL_EXCLUDED.has(`${country}/${slug}`)) {
    return { include: false, reason: 'not-competitive' };
  }

  // The allowlist is authoritative and is consulted before the tier-3 regexes,
  // so a legitimately top-flight name that happens to look like a lower tier
  // elsewhere (Gibraltar's National League, Poland's I liga) still gets in.
  const league = LEAGUE_INDEX.get(`${country}/${slug}`);
  if (league) return { include: true, league, reason: 'allowlisted' };

  for (const re of TIER3_PLUS_PATTERNS) {
    if (re.test(label)) return { include: false, reason: 'tier-3-or-below' };
  }

  // In a reported region, senior, not obviously a lower tier — but not in the
  // allowlist. Most often a cup, a super cup, or a slug that changed. Surfaced
  // for review instead of being guessed at.
  return { include: false, reason: 'needs-review', region: regionOf(country) };
}

/**
 * Leading path segments that name a sport rather than a country. The feed uses
 * /soccer/ and /football/ interchangeably for the same competitions, and other
 * sports follow the same shape — /basketball/usa/wnba/.
 */
const SPORT_SEGMENTS = new Set([
  'soccer',
  'football',
  'basketball',
  'tennis',
  'hockey',
  'baseball',
  'handball',
  'volleyball',
  'rugby-union',
  'rugby-league',
  'american-football',
]);

/**
 * Split a Flashscore tournament URL into country + league slug, dropping the
 * sport segment when there is one.
 * e.g. "/soccer/england/premier-league/"  -> { england, premier-league }
 *      "/basketball/usa/wnba/"            -> { usa, wnba }
 */
export function parseTournamentUrl(url) {
  if (!url) return { country: null, slug: null };
  const parts = String(url).split('/').filter(Boolean);
  const base = SPORT_SEGMENTS.has(parts[0]) ? parts.slice(1) : parts;
  return { country: base[0] ?? null, slug: base[1] ?? null };
}
