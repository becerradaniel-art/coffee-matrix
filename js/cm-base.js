// Region and name tables shared by the page (from the dashboard's parse.js; the .xlsx reader is left out of this copy).
window.CM = window.CM || {};

CM.REGIONS = ['Latin America & the Caribbean', 'Africa & the Middle East', 'Asia & Pacific Islands'];

// Sheet region codes and the proposal's three regions.
CM.regionOf = function (code, country) {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'latam') return ['Latin America & the Caribbean', 'South America'];
  if (c === 'cam') return ['Latin America & the Caribbean', 'Central America & Mexico'];
  if (/carib/.test(c)) return ['Latin America & the Caribbean', 'Caribbean'];
  if (/lat|america|cam\b|sam\b/.test(c)) return ['Latin America & the Caribbean', String(code).trim()];
  if (/middle|mena|yemen/.test(c)) return ['Africa & the Middle East', 'Middle East'];
  if (/africa/.test(c)) return ['Africa & the Middle East', 'Africa'];
  if (/apac|asia|pacific|oceania/.test(c)) return ['Asia & Pacific Islands', 'Asia & Pacific Islands'];
  const k = String(country || '').trim().toLowerCase();
  for (const [region, list] of Object.entries(CM.COUNTRY_REGION)) if (list.includes(k)) return [region, region];
  return null;
};
CM.COUNTRY_REGION = {
  'Latin America & the Caribbean': ['brazil', 'colombia', 'peru', 'ecuador', 'bolivia', 'venezuela', 'honduras', 'nicaragua', 'guatemala', 'mexico', 'costa rica', 'el salvador', 'panama', 'jamaica', 'haiti', 'dominican republic', 'cuba', 'puerto rico'],
  'Africa & the Middle East': ['ethiopia', 'kenya', 'burundi', 'rwanda', 'tanzania', 'uganda', 'drc', 'congo', 'cameroon', 'zambia', 'malawi', 'zimbabwe', 'yemen', 'madagascar', 'ivory coast', "cote d'ivoire", 'sierra leone', 'guinea', 'togo', 'mozambique', 'saudi arabia'],
  'Asia & Pacific Islands': ['india', 'indonesia', 'png', 'papua new guinea', 'laos', 'timor', 'timor-leste', 'east timor', 'vietnam', 'china', 'myanmar', 'thailand', 'philippines', 'nepal', 'sri lanka', 'australia']
};

// Names in the matrix -> names on the map.
CM.GEO_NAME = {
  DRC: 'Dem. Rep. Congo', 'Congo DRC': 'Dem. Rep. Congo', 'DR Congo': 'Dem. Rep. Congo', 'Democratic Republic of Congo': 'Dem. Rep. Congo',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo', PNG: 'Papua New Guinea', Timor: 'Timor-Leste', 'East Timor': 'Timor-Leste',
  'Dominican Republic': 'Dominican Rep.', 'Ivory Coast': "Côte d'Ivoire", "Cote d'Ivoire": "Côte d'Ivoire", 'Central African Republic': 'Central African Rep.',
  'Solomon Islands': 'Solomon Is.', 'South Sudan': 'S. Sudan', Eswatini: 'eSwatini', 'Viet Nam': 'Vietnam', 'Lao PDR': 'Laos'
};
CM.geoName = (country) => CM.GEO_NAME[country] || country;

// Matrices emailed in arrive as compact text with a checksum.
CM.fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
CM.fromTsv = (tsv) => String(tsv).split('\n').filter(Boolean).map((line) => {
  const [sheetRegion, country, process, grade, diff, rank, cell] = line.split('|');
  const reg = CM.regionOf(sheetRegion, country) || ['', ''];
  return { region: reg[0], subregion: reg[1], sheetRegion, country, process, grade, diff: +diff, rank: +rank, cell };
});
