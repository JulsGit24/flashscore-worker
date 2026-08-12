// Pictures for the visual report: team crests, competition logos, country flags.
//
// The day feed turned out to carry image filenames all along — OA for the home
// side, OB for the away side, OAJ on the competition header — as opaque names
// like "61kdErlC-tAokhjfk.png". Three hosts serve them; static.flashscore.com is
// the one used here. Verified against real filenames by checking magic bytes
// rather than status codes, because the same path answers a missing file with a
// 404 carrying an HTML page.
//
// Flags are a different problem: the site draws them from a CSS sprite, which
// is no use in a standalone document. So they are Unicode flag emoji instead,
// which need no network at all and render properly wherever a colour emoji font
// is installed.

export const IMAGE_HOST = process.env.FS_IMAGE_HOST ?? 'https://static.flashscore.com/res/image/data/';

/**
 * Absolute URL for a feed image filename, or null.
 *
 * Filenames arrive with their extension already attached. Anything that does
 * not look like one is refused rather than concatenated into a broken URL — a
 * missing crest is a small blemish, a broken image icon is an ugly one.
 */
export function imageUrl(filename) {
  if (!filename || typeof filename !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+\.(png|jpe?g|svg|webp)$/i.test(filename.trim())) return null;
  return IMAGE_HOST + filename.trim();
}

/**
 * Country slug to flag emoji.
 *
 * Keyed by the slug this repo already uses, so it lines up with leagues.data.js
 * rather than depending on how the feed spells a country name this week.
 *
 * The UK nations get their subdivision flags, which do exist as emoji and are
 * what a reader expects to see next to a Premier League fixture. Confederations
 * are not countries and take a neutral globe.
 */
export const COUNTRY_FLAG = {
  albania: '🇦🇱', andorra: '🇦🇩', argentina: '🇦🇷', armenia: '🇦🇲', austria: '🇦🇹',
  azerbaijan: '🇦🇿', belarus: '🇧🇾', belgium: '🇧🇪', bolivia: '🇧🇴',
  'bosnia-and-herzegovina': '🇧🇦', brazil: '🇧🇷', bulgaria: '🇧🇬', canada: '🇨🇦',
  chile: '🇨🇱', china: '🇨🇳', colombia: '🇨🇴', 'costa-rica': '🇨🇷', croatia: '🇭🇷',
  cyprus: '🇨🇾', 'czech-republic': '🇨🇿', denmark: '🇩🇰', 'dominican-republic': '🇩🇴',
  ecuador: '🇪🇨', 'el-salvador': '🇸🇻', england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', estonia: '🇪🇪',
  'faroe-islands': '🇫🇴', finland: '🇫🇮', france: '🇫🇷', georgia: '🇬🇪', germany: '🇩🇪',
  gibraltar: '🇬🇮', greece: '🇬🇷', guatemala: '🇬🇹', haiti: '🇭🇹', honduras: '🇭🇳',
  hungary: '🇭🇺', iceland: '🇮🇸', ireland: '🇮🇪', israel: '🇮🇱', italy: '🇮🇹',
  jamaica: '🇯🇲', japan: '🇯🇵', kazakhstan: '🇰🇿', kosovo: '🇽🇰', latvia: '🇱🇻',
  liechtenstein: '🇱🇮', lithuania: '🇱🇹', luxembourg: '🇱🇺', malta: '🇲🇹', mexico: '🇲🇽', moldova: '🇲🇩',
  montenegro: '🇲🇪', netherlands: '🇳🇱', nicaragua: '🇳🇮', 'north-macedonia': '🇲🇰',
  'northern-ireland': '🇬🇧', norway: '🇳🇴', panama: '🇵🇦', paraguay: '🇵🇾', peru: '🇵🇪',
  poland: '🇵🇱', portugal: '🇵🇹', romania: '🇷🇴', russia: '🇷🇺', 'san-marino': '🇸🇲',
  scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', serbia: '🇷🇸', slovakia: '🇸🇰', slovenia: '🇸🇮',
  'south-korea': '🇰🇷', spain: '🇪🇸', sweden: '🇸🇪', switzerland: '🇨🇭',
  'trinidad-and-tobago': '🇹🇹', turkey: '🇹🇷', ukraine: '🇺🇦', uruguay: '🇺🇾',
  usa: '🇺🇸', venezuela: '🇻🇪', wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  // Confederation pseudo-countries: the feed files continental competitions
  // under these, and none of them is a place.
  europe: '🌍', asia: '🌏', 'south-america': '🌎', 'north-central-america': '🌎',
};

export function countryFlag(slug) {
  if (!slug) return '';
  return COUNTRY_FLAG[String(slug).toLowerCase()] ?? '🏳️';
}
