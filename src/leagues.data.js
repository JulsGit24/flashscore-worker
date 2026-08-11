// European (UEFA) domestic leagues we care about: first tier ("main") and
// second tier ("B"). Third tier and below are deliberately absent — see
// TIER3_PLUS_PATTERNS in leagues.js for the safety net that catches anything
// that slips through with an unexpected slug.
//
// `slug` is the Flashscore URL path segment (the part after /soccer/<country>/).
// Slugs occasionally change when a league is renamed or re-sponsored; anything
// that fails to match is reported in the "needs review" section of the report
// rather than being silently dropped.

/**
 * Which countries belong to each reportable region. A report is generated per
 * region, so these sets decide which file a fixture lands in — and a country
 * absent from all of them is out of scope everywhere.
 */
export const REGION_COUNTRIES = {
  europe: new Set([
    'albania', 'andorra', 'armenia', 'austria', 'azerbaijan', 'belarus', 'belgium',
    'bosnia-and-herzegovina', 'bulgaria', 'croatia', 'cyprus', 'czech-republic',
    'denmark', 'england', 'estonia', 'faroe-islands', 'finland', 'france',
    'georgia', 'germany', 'gibraltar', 'greece', 'hungary', 'iceland', 'ireland',
    'israel', 'italy', 'kazakhstan', 'kosovo', 'latvia', 'liechtenstein',
    'lithuania', 'luxembourg', 'malta', 'moldova', 'montenegro', 'netherlands',
    'north-macedonia', 'northern-ireland', 'norway', 'poland', 'portugal',
    'romania', 'russia', 'san-marino', 'scotland', 'serbia', 'slovakia',
    'slovenia', 'spain', 'sweden', 'switzerland', 'turkey', 'ukraine', 'wales',
    // UEFA club competitions sit under this pseudo-country in the feed.
    'europe',
  ]),

  // North, Central and South America, plus the Caribbean.
  americas: new Set([
    'argentina', 'bolivia', 'brazil', 'canada', 'chile', 'colombia', 'costa-rica',
    'dominican-republic', 'ecuador', 'el-salvador', 'guatemala', 'haiti',
    'honduras', 'jamaica', 'mexico', 'nicaragua', 'panama', 'paraguay', 'peru',
    'trinidad-and-tobago', 'uruguay', 'usa', 'venezuela',
    // CONMEBOL and CONCACAF competitions, likewise.
    'south-america', 'north-central-america',
  ]),

  // Deliberately narrow: only the three leagues asked for.
  asia: new Set(['china', 'japan', 'south-korea', 'asia']),
};

/** Region ids in report order. */
export const REGIONS = Object.keys(REGION_COUNTRIES);

/** Human-readable region names for report titles. */
export const REGION_LABEL = {
  europe: 'Europe',
  americas: 'the Americas',
  asia: 'Asia',
};

export function regionOf(country) {
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    if (countries.has(country)) return region;
  }
  return null;
}

/** @type {{country: string, slug: string, name: string, tier: 1|2, gender: 'M'|'W'}[]} */
export const LEAGUES = [
  // --- Big five -------------------------------------------------------------
  { country: 'england', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'england', slug: 'championship', name: 'Championship', tier: 2, gender: 'M', region: 'europe' },
  { country: 'england', slug: 'wsl', name: 'Women’s Super League', tier: 1, gender: 'W', region: 'europe' },
  { country: 'england', slug: 'womens-championship', name: 'Women’s Championship', tier: 2, gender: 'W', region: 'europe' },
  { country: 'spain', slug: 'laliga', name: 'LaLiga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'spain', slug: 'laliga2', name: 'LaLiga 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'spain', slug: 'liga-f', name: 'Liga F', tier: 1, gender: 'W', region: 'europe' },
  { country: 'germany', slug: 'bundesliga', name: 'Bundesliga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'germany', slug: '2-bundesliga', name: '2. Bundesliga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'germany', slug: 'frauen-bundesliga', name: 'Frauen-Bundesliga', tier: 1, gender: 'W', region: 'europe' },
  { country: 'italy', slug: 'serie-a', name: 'Serie A', tier: 1, gender: 'M', region: 'europe' },
  { country: 'italy', slug: 'serie-b', name: 'Serie B', tier: 2, gender: 'M', region: 'europe' },
  { country: 'italy', slug: 'serie-a-women', name: 'Serie A Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'france', slug: 'ligue-1', name: 'Ligue 1', tier: 1, gender: 'M', region: 'europe' },
  { country: 'france', slug: 'ligue-2', name: 'Ligue 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'france', slug: 'premiere-ligue', name: 'Première Ligue', tier: 1, gender: 'W', region: 'europe' },

  // --- Rest of western Europe ----------------------------------------------
  { country: 'netherlands', slug: 'eredivisie', name: 'Eredivisie', tier: 1, gender: 'M', region: 'europe' },
  { country: 'netherlands', slug: 'eerste-divisie', name: 'Eerste Divisie', tier: 2, gender: 'M', region: 'europe' },
  { country: 'netherlands', slug: 'eredivisie-women', name: 'Eredivisie Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'portugal', slug: 'liga-portugal', name: 'Liga Portugal', tier: 1, gender: 'M', region: 'europe' },
  { country: 'portugal', slug: 'liga-portugal-2', name: 'Liga Portugal 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'portugal', slug: 'liga-bpi', name: 'Liga BPI', tier: 1, gender: 'W', region: 'europe' },
  { country: 'belgium', slug: 'jupiler-pro-league', name: 'Jupiler Pro League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'belgium', slug: 'challenger-pro-league', name: 'Challenger Pro League', tier: 2, gender: 'M', region: 'europe' },
  { country: 'belgium', slug: 'super-league-women', name: 'Super League Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'scotland', slug: 'premiership', name: 'Premiership', tier: 1, gender: 'M', region: 'europe' },
  { country: 'scotland', slug: 'championship', name: 'Championship', tier: 2, gender: 'M', region: 'europe' },
  { country: 'scotland', slug: 'swpl-1', name: 'SWPL 1', tier: 1, gender: 'W', region: 'europe' },
  { country: 'ireland', slug: 'premier-division', name: 'Premier Division', tier: 1, gender: 'M', region: 'europe' },
  { country: 'ireland', slug: 'first-division', name: 'First Division', tier: 2, gender: 'M', region: 'europe' },
  { country: 'northern-ireland', slug: 'premiership', name: 'NIFL Premiership', tier: 1, gender: 'M', region: 'europe' },
  { country: 'northern-ireland', slug: 'nifl-championship', name: 'NIFL Championship', tier: 2, gender: 'M', region: 'europe' },
  { country: 'northern-ireland', slug: 'premiership-women', name: 'NIFL Premiership Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'wales', slug: 'cymru-premier', name: 'Cymru Premier', tier: 1, gender: 'M', region: 'europe' },
  { country: 'switzerland', slug: 'super-league', name: 'Super League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'switzerland', slug: 'challenge-league', name: 'Challenge League', tier: 2, gender: 'M', region: 'europe' },
  { country: 'switzerland', slug: 'super-league-women', name: 'Women’s Super League', tier: 1, gender: 'W', region: 'europe' },
  { country: 'austria', slug: 'bundesliga', name: 'Bundesliga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'austria', slug: '2-liga', name: '2. Liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'austria', slug: 'frauen-bundesliga', name: 'Frauen-Bundesliga', tier: 1, gender: 'W', region: 'europe' },
  { country: 'luxembourg', slug: 'national-division', name: 'National Division', tier: 1, gender: 'M', region: 'europe' },
  { country: 'malta', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'malta', slug: 'challenge-league', name: 'Challenge League', tier: 2, gender: 'M', region: 'europe' },
  { country: 'gibraltar', slug: 'national-league', name: 'National League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'andorra', slug: 'primera-divisio', name: 'Primera Divisió', tier: 1, gender: 'M', region: 'europe' },
  { country: 'san-marino', slug: 'campionato', name: 'Campionato Sammarinese', tier: 1, gender: 'M', region: 'europe' },

  // --- Nordics (in season through the European summer) ----------------------
  { country: 'sweden', slug: 'allsvenskan', name: 'Allsvenskan', tier: 1, gender: 'M', region: 'europe' },
  { country: 'sweden', slug: 'superettan', name: 'Superettan', tier: 2, gender: 'M', region: 'europe' },
  { country: 'sweden', slug: 'damallsvenskan', name: 'Damallsvenskan', tier: 1, gender: 'W', region: 'europe' },
  { country: 'sweden', slug: 'elitettan', name: 'Elitettan', tier: 2, gender: 'W', region: 'europe' },
  { country: 'norway', slug: 'eliteserien', name: 'Eliteserien', tier: 1, gender: 'M', region: 'europe' },
  { country: 'norway', slug: 'obos-ligaen', name: 'OBOS-ligaen', tier: 2, gender: 'M', region: 'europe' },
  { country: 'norway', slug: 'toppserien', name: 'Toppserien', tier: 1, gender: 'W', region: 'europe' },
  { country: 'denmark', slug: 'superliga', name: 'Superliga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'denmark', slug: '1st-division', name: '1st Division', tier: 2, gender: 'M', region: 'europe' },
  { country: 'denmark', slug: 'kvindeligaen', name: 'Kvindeligaen', tier: 1, gender: 'W', region: 'europe' },
  { country: 'finland', slug: 'veikkausliiga', name: 'Veikkausliiga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'finland', slug: 'ykkosliiga', name: 'Ykkösliiga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'finland', slug: 'kansallinen-liiga', name: 'Kansallinen Liiga', tier: 1, gender: 'W', region: 'europe' },
  { country: 'iceland', slug: 'besta-deild-karla', name: 'Besta deild karla', tier: 1, gender: 'M', region: 'europe' },
  { country: 'iceland', slug: '1-deild', name: '1. deild', tier: 2, gender: 'M', region: 'europe' },
  { country: 'iceland', slug: 'besta-deild-women', name: 'Besta deild kvenna', tier: 1, gender: 'W', region: 'europe' },
  { country: 'faroe-islands', slug: 'premier-league', name: 'Betri deildin', tier: 1, gender: 'M', region: 'europe' },
  { country: 'faroe-islands', slug: '1-deild', name: '1. deild', tier: 2, gender: 'M', region: 'europe' },

  // --- Central & eastern Europe --------------------------------------------
  { country: 'poland', slug: 'ekstraklasa', name: 'Ekstraklasa', tier: 1, gender: 'M', region: 'europe' },
  { country: 'poland', slug: 'division-1', name: 'I liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'poland', slug: 'ekstraliga-women', name: 'Ekstraliga Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'czech-republic', slug: '1-liga', name: 'Chance Liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'czech-republic', slug: '2-liga', name: 'FNL', tier: 2, gender: 'M', region: 'europe' },
  { country: 'slovakia', slug: 'nike-liga', name: 'Niké liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'slovakia', slug: '2-liga', name: '2. liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'hungary', slug: 'nb-i', name: 'NB I', tier: 1, gender: 'M', region: 'europe' },
  { country: 'hungary', slug: 'nb-ii', name: 'NB II', tier: 2, gender: 'M', region: 'europe' },
  { country: 'romania', slug: 'superliga', name: 'SuperLiga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'romania', slug: 'liga-2', name: 'Liga 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'bulgaria', slug: 'efbet-league', name: 'efbet League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'bulgaria', slug: 'vtora-liga', name: 'Vtora liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'croatia', slug: 'hnl', name: 'HNL', tier: 1, gender: 'M', region: 'europe' },
  { country: 'croatia', slug: 'prva-nl', name: 'Prva NL', tier: 2, gender: 'M', region: 'europe' },
  { country: 'serbia', slug: 'super-liga', name: 'Super liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'serbia', slug: 'prva-liga', name: 'Prva liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'slovenia', slug: 'prva-liga', name: 'Prva liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'slovenia', slug: '2-snl', name: '2. SNL', tier: 2, gender: 'M', region: 'europe' },
  { country: 'bosnia-and-herzegovina', slug: 'premier-league', name: 'Premijer liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'north-macedonia', slug: 'prva-liga', name: 'Prva liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'albania', slug: 'superliga', name: 'Kategoria Superiore', tier: 1, gender: 'M', region: 'europe' },
  { country: 'montenegro', slug: 'prva-liga', name: 'Prva liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'kosovo', slug: 'superliga', name: 'Superliga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'greece', slug: 'super-league', name: 'Super League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'greece', slug: 'super-league-2', name: 'Super League 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'cyprus', slug: 'first-division', name: 'First Division', tier: 1, gender: 'M', region: 'europe' },
  { country: 'cyprus', slug: 'second-division', name: 'Second Division', tier: 2, gender: 'M', region: 'europe' },
  { country: 'turkey', slug: 'super-lig', name: 'Süper Lig', tier: 1, gender: 'M', region: 'europe' },
  { country: 'turkey', slug: '1-lig', name: '1. Lig', tier: 2, gender: 'M', region: 'europe' },
  { country: 'turkey', slug: 'super-lig-women', name: 'Kadınlar Süper Ligi', tier: 1, gender: 'W', region: 'europe' },
  { country: 'israel', slug: 'ligat-haal', name: 'Ligat ha’Al', tier: 1, gender: 'M', region: 'europe' },
  { country: 'israel', slug: 'liga-leumit', name: 'Liga Leumit', tier: 2, gender: 'M', region: 'europe' },

  // --- Baltics, CIS & Caucasus ---------------------------------------------
  { country: 'russia', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'russia', slug: 'first-league', name: 'First League', tier: 2, gender: 'M', region: 'europe' },
  { country: 'russia', slug: 'supreme-division-women', name: 'Supreme Division Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'ukraine', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'ukraine', slug: 'persha-liga', name: 'Persha Liha', tier: 2, gender: 'M', region: 'europe' },
  { country: 'belarus', slug: 'vysshaya-liga', name: 'Vysshaya Liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'belarus', slug: 'pershaya-liga', name: 'Pershaya Liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'belarus', slug: 'vysshaya-liga-women', name: 'Vysshaya Liga Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'estonia', slug: 'meistriliiga', name: 'Meistriliiga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'estonia', slug: 'esiliiga', name: 'Esiliiga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'latvia', slug: 'virsliga', name: 'Virsliga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'latvia', slug: '1-liga', name: '1. liga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'lithuania', slug: 'toplyga', name: 'TOPLYGA', tier: 1, gender: 'M', region: 'europe' },
  { country: 'lithuania', slug: 'i-lyga', name: 'I Lyga', tier: 2, gender: 'M', region: 'europe' },
  { country: 'georgia', slug: 'erovnuli-liga', name: 'Erovnuli Liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'georgia', slug: 'erovnuli-liga-2', name: 'Erovnuli Liga 2', tier: 2, gender: 'M', region: 'europe' },
  { country: 'armenia', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'armenia', slug: 'first-league', name: 'First League', tier: 2, gender: 'M', region: 'europe' },
  { country: 'azerbaijan', slug: 'premyer-liqa', name: 'Premyer Liqa', tier: 1, gender: 'M', region: 'europe' },
  { country: 'azerbaijan', slug: 'birinci-divizion', name: 'Birinci Divizion', tier: 2, gender: 'M', region: 'europe' },
  { country: 'kazakhstan', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'europe' },
  { country: 'kazakhstan', slug: 'first-division', name: 'First Division', tier: 2, gender: 'M', region: 'europe' },
  { country: 'kazakhstan', slug: 'league-women', name: 'Kazakhstan League Women', tier: 1, gender: 'W', region: 'europe' },
  { country: 'moldova', slug: 'super-liga', name: 'Super Liga', tier: 1, gender: 'M', region: 'europe' },
  { country: 'moldova', slug: 'liga-1', name: 'Liga 1', tier: 2, gender: 'M', region: 'europe' },

  // ===== AMERICAS ==========================================================
  // --- South America --------------------------------------------------------
  { country: 'argentina', slug: 'liga-profesional', name: 'Liga Profesional', tier: 1, gender: 'M', region: 'americas' },
  { country: 'argentina', slug: 'primera-nacional', name: 'Primera Nacional', tier: 2, gender: 'M', region: 'americas' },
  { country: 'brazil', slug: 'serie-a', name: 'Serie A', tier: 1, gender: 'M', region: 'americas' },
  { country: 'brazil', slug: 'serie-b', name: 'Serie B', tier: 2, gender: 'M', region: 'americas' },
  { country: 'brazil', slug: 'brasileiro-women', name: 'Brasileiro Women', tier: 1, gender: 'W', region: 'americas' },
  { country: 'uruguay', slug: 'liga-auf-uruguaya', name: 'Liga AUF Uruguaya', tier: 1, gender: 'M', region: 'americas' },
  { country: 'uruguay', slug: 'segunda-division', name: 'Segunda División', tier: 2, gender: 'M', region: 'americas' },
  { country: 'chile', slug: 'liga-de-primera', name: 'Liga de Primera', tier: 1, gender: 'M', region: 'americas' },
  { country: 'chile', slug: 'liga-de-ascenso', name: 'Liga de Ascenso', tier: 2, gender: 'M', region: 'americas' },
  { country: 'colombia', slug: 'primera-a', name: 'Primera A', tier: 1, gender: 'M', region: 'americas' },
  { country: 'colombia', slug: 'primera-b', name: 'Primera B', tier: 2, gender: 'M', region: 'americas' },
  { country: 'peru', slug: 'liga-1', name: 'Liga 1', tier: 1, gender: 'M', region: 'americas' },
  { country: 'peru', slug: 'liga-2', name: 'Liga 2', tier: 2, gender: 'M', region: 'americas' },
  { country: 'ecuador', slug: 'liga-pro', name: 'LigaPro', tier: 1, gender: 'M', region: 'americas' },
  { country: 'ecuador', slug: 'liga-pro-serie-b', name: 'LigaPro Serie B', tier: 2, gender: 'M', region: 'americas' },
  { country: 'paraguay', slug: 'copa-de-primera', name: 'Copa de Primera', tier: 1, gender: 'M', region: 'americas' },
  { country: 'paraguay', slug: 'division-intermedia', name: 'División Intermedia', tier: 2, gender: 'M', region: 'americas' },
  { country: 'bolivia', slug: 'division-profesional', name: 'División Profesional', tier: 1, gender: 'M', region: 'americas' },
  { country: 'venezuela', slug: 'liga-futve', name: 'Liga FUTVE', tier: 1, gender: 'M', region: 'americas' },

  // --- North & Central America, Caribbean -----------------------------------
  { country: 'usa', slug: 'mls', name: 'MLS', tier: 1, gender: 'M', region: 'americas' },
  { country: 'usa', slug: 'usl-championship', name: 'USL Championship', tier: 2, gender: 'M', region: 'americas' },
  { country: 'usa', slug: 'nwsl-women', name: 'NWSL', tier: 1, gender: 'W', region: 'americas' },
  { country: 'argentina', slug: 'primera-a-women', name: 'Primera A Women', tier: 1, gender: 'W', region: 'americas' },
  { country: 'colombia', slug: 'liga-women', name: 'Liga Femenina', tier: 1, gender: 'W', region: 'americas' },
  { country: 'peru', slug: 'liga-women', name: 'Liga Femenina', tier: 1, gender: 'W', region: 'americas' },
  { country: 'mexico', slug: 'liga-mx', name: 'Liga MX', tier: 1, gender: 'M', region: 'americas' },
  { country: 'mexico', slug: 'liga-de-expansion-mx', name: 'Liga de Expansión MX', tier: 2, gender: 'M', region: 'americas' },
  { country: 'mexico', slug: 'liga-mx-women', name: 'Liga MX Femenil', tier: 1, gender: 'W', region: 'americas' },
  { country: 'canada', slug: 'canadian-premier-league', name: 'Canadian Premier League', tier: 1, gender: 'M', region: 'americas' },
  { country: 'costa-rica', slug: 'primera-division', name: 'Primera División', tier: 1, gender: 'M', region: 'americas' },
  { country: 'costa-rica', slug: 'liga-de-ascenso', name: 'Liga de Ascenso', tier: 2, gender: 'M', region: 'americas' },
  { country: 'honduras', slug: 'liga-nacional', name: 'Liga Nacional', tier: 1, gender: 'M', region: 'americas' },
  { country: 'guatemala', slug: 'liga-nacional', name: 'Liga Nacional', tier: 1, gender: 'M', region: 'americas' },
  { country: 'el-salvador', slug: 'primera-division', name: 'Primera División', tier: 1, gender: 'M', region: 'americas' },
  { country: 'panama', slug: 'lpf', name: 'Liga Panameña', tier: 1, gender: 'M', region: 'americas' },
  { country: 'nicaragua', slug: 'liga-primera', name: 'Liga Primera', tier: 1, gender: 'M', region: 'americas' },
  { country: 'jamaica', slug: 'premier-league', name: 'Premier League', tier: 1, gender: 'M', region: 'americas' },
  { country: 'trinidad-and-tobago', slug: 'pro-league', name: 'Pro League', tier: 1, gender: 'M', region: 'americas' },
  { country: 'dominican-republic', slug: 'liga-mayor', name: 'Liga Mayor', tier: 1, gender: 'M', region: 'americas' },
  { country: 'haiti', slug: 'ligue-haitienne', name: 'Ligue Haïtienne', tier: 1, gender: 'M', region: 'americas' },

  // ===== ASIA ==============================================================
  // Japan, Korea and China only, by request.
  { country: 'japan', slug: 'j1-league', name: 'J1 League', tier: 1, gender: 'M', region: 'asia' },
  { country: 'japan', slug: 'j2-league', name: 'J2 League', tier: 2, gender: 'M', region: 'asia' },
  { country: 'japan', slug: 'we-league-women', name: 'WE League', tier: 1, gender: 'W', region: 'asia' },
  { country: 'south-korea', slug: 'k-league-1', name: 'K League 1', tier: 1, gender: 'M', region: 'asia' },
  { country: 'south-korea', slug: 'k-league-2', name: 'K League 2', tier: 2, gender: 'M', region: 'asia' },
  { country: 'south-korea', slug: 'wk-league-women', name: 'WK League', tier: 1, gender: 'W', region: 'asia' },
  { country: 'china', slug: 'super-league', name: 'Chinese Super League', tier: 1, gender: 'M', region: 'asia' },
  { country: 'china', slug: 'league-one', name: 'China League One', tier: 2, gender: 'M', region: 'asia' },
  { country: 'china', slug: 'womens-super-league', name: 'Women’s Super League', tier: 1, gender: 'W', region: 'asia' },
];

/**
 * Competitions to drop outright. Used where the name alone cannot settle the
 * tier in that country — Chile's "Segunda División" is the third tier, while
 * Uruguay's league of the same name is the second.
 */
export const EXCLUDED_SLUGS = new Set([
  'chile/segunda-division',
  // The Canadian Championship is the national cup, not a division — its name
  // gives no hint of that, so it needs naming outright.
  'canada/championship',
  // Finland restructured in 2024: Veikkausliiga, then Ykkösliiga, then
  // Ykkönen. The old name now sits at the third tier.
  'finland/ykkonen',
  'usa/mls-next-pro',
  'brazil/cearense-3',
  'argentina/torneo-promocional-amateur',
]);


/**
 * International club competitions. These carry no tier: the Champions League
 * and the Conference League are parallel competitions, not a pyramid, so the
 * tier-1/tier-2 idea that scopes the domestic leagues does not apply. They are
 * marked `kind: 'international'` instead and reported in their own section.
 *
 * Slugs marked "confirmed" were read from the live feed; the rest are the
 * expected names and will surface in the report's needs-review list if wrong.
 */
export const INTERNATIONAL = [
  // --- UEFA (confirmed against the feed) ------------------------------------
  { country: 'europe', slug: 'champions-league', name: 'Champions League', gender: 'M', region: 'europe' },
  { country: 'europe', slug: 'europa-league', name: 'Europa League', gender: 'M', region: 'europe' },
  { country: 'europe', slug: 'conference-league', name: 'Conference League', gender: 'M', region: 'europe' },
  { country: 'europe', slug: 'champions-league-women', name: 'Champions League Women', gender: 'W', region: 'europe' },
  { country: 'europe', slug: 'uefa-super-cup', name: 'UEFA Super Cup', gender: 'M', region: 'europe' },

  // --- CONCACAF (leagues-cup and the Central American Cup confirmed) --------
  { country: 'north-central-america', slug: 'leagues-cup', name: 'Leagues Cup', gender: 'M', region: 'americas' },
  { country: 'north-central-america', slug: 'concacaf-central-american-cup', name: 'CONCACAF Central American Cup', gender: 'M', region: 'americas' },
  { country: 'north-central-america', slug: 'concacaf-champions-cup', name: 'CONCACAF Champions Cup', gender: 'M', region: 'americas' },

  // --- CONMEBOL (expected slugs, not yet seen in a live sweep) -------------
  { country: 'south-america', slug: 'copa-libertadores', name: 'Copa Libertadores', gender: 'M', region: 'americas' },
  { country: 'south-america', slug: 'copa-sudamericana', name: 'Copa Sudamericana', gender: 'M', region: 'americas' },
  { country: 'south-america', slug: 'recopa-sudamericana', name: 'Recopa Sudamericana', gender: 'M', region: 'americas' },

  // --- AFC (expected slugs) ------------------------------------------------
  { country: 'asia', slug: 'afc-champions-league', name: 'AFC Champions League', gender: 'M', region: 'asia' },
  { country: 'asia', slug: 'afc-challenge-league', name: 'AFC Challenge League', gender: 'M', region: 'asia' },
];

/** Competitions under a confederation that are deliberately not reported. */
export const INTERNATIONAL_EXCLUDED = new Set([
  // A pre-season invitational, not a competitive continental tie.
  'europe/emirates-cup',
]);

export const LEAGUE_INDEX = new Map(
  [...LEAGUES, ...INTERNATIONAL.map((c) => ({ tier: null, kind: 'international', ...c }))].map(
    (l) => [`${l.country}/${l.slug}`, l],
  ),
);
