// Builds density-topography/data.js — population-density time series on a 3D map.
//
// Data:
//  · Geometry  — Natural Earth Admin-0 (110m), projected to 2D Equal Earth.
//  · Density   — World Bank EN.POP.DNST (people / km² of land area), 1961–2023.
//  · Population— World Bank SP.POP.TOTL (for the hover readout), 1961–2023.
//
// Every sovereign country in the World Bank list is included: those with a 110m
// polygon are drawn as extruded land; the rest (microstates, small islands) are
// emitted as pins placed at their World Bank lon/lat. Hong Kong & Macau are
// skipped — they're cities/SARs, not countries (that's a future "cities" map).
//
// Run: node build.mjs
import { geoEqualEarth } from 'd3-geo';
import { writeFileSync } from 'node:fs';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const WB = 'https://api.worldbank.org/v2';
const Y0 = 1961, Y1 = 2023;
const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const W = 6, H = 3, PREC = 1e4;
const EXCLUDE = new Set(['HKG', 'MAC']);          // SAR cities, not countries
// Non-sovereign dependencies/territories — kept out of the pins (a future "cities/
// territories" map). They still colour their polygon if Natural Earth has one.
const TERRITORIES = new Set(['ABW','ASM','BMU','CHI','CUW','CYM','FRO','GIB','GUM',
  'IMN','MAF','MNP','NCL','PYF','PRI','SXM','TCA','VGB','VIR']);
const ISO_ALIAS = { KOS: 'XKX', SDS: 'SSD' };     // Natural Earth → World Bank ISO3

// World Bank doesn't list Taiwan. Density is a property of the land, so we fill it
// from Taiwan's own figures (DGBAS / UN), interpolated across the years.
const OVERRIDES = {
  TWN: { name: 'Taiwan', area: 36197, anchors: {
    1961: 11149000, 1970: 14676000, 1980: 17805000, 1990: 20353000,
    2000: 22277000, 2010: 23162000, 2020: 23561000, 2023: 23420000 } },
};

const round = n => Math.round(n * PREC) / PREC;
const getJson = async url => (await (await fetch(url)).json());

/* ---------- projection ---------- */
const projection = geoEqualEarth().fitExtent([[-W/2, -H/2], [W/2, H/2]], { type: 'Sphere' });
const projLine = pts => pts.map(([lon, lat]) => { const p = projection([lon, lat]); return [round(p[0]), round(-p[1])]; });
function projectRing(ring) {
  const out = []; let prev = null;
  for (const [lon, lat] of ring) {
    const p = projection([lon, lat]); if (!p) continue;
    const x = round(p[0]), y = round(-p[1]);
    if (prev && prev[0] === x && prev[1] === y) continue;
    out.push([x, y]); prev = [x, y];
  }
  return out;
}
const polysFromGeom = g =>
  g.type === 'Polygon' ? [g.coordinates.map(projectRing)]
  : g.type === 'MultiPolygon' ? g.coordinates.map(poly => poly.map(projectRing))
  : [];

/* ---------- World Bank: countries + time series ---------- */
console.log('Fetching World Bank country list + indicators…');
const meta = (await getJson(`${WB}/country?format=json&per_page=400`))[1]
  .filter(c => c.region && c.region.value.trim() !== 'Aggregates' && !EXCLUDE.has(c.id));
const metaByIso = new Map(meta.map(c => [c.id, c]));

async function series(indicator, scale) {            // → Map(iso → year-aligned array)
  const rows = (await getJson(`${WB}/country/all/indicator/${indicator}?format=json&per_page=20000&date=${Y0}:${Y1}`))[1];
  const byIsoYear = new Map();
  for (const r of rows) {
    if (r.value == null) continue;
    const iso = r.countryiso3code; if (!iso) continue;
    byIsoYear.set(iso + r.date, scale(r.value));
  }
  const out = new Map();
  for (const iso of metaByIso.keys())
    out.set(iso, YEARS.map(y => byIsoYear.get(iso + y) ?? null));
  return out;
}
const densBy = await series('EN.POP.DNST', v => Math.round(v * 100) / 100);
const popBy  = await series('SP.POP.TOTL', v => Math.round(v));

const latest = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };

function overrideRecord(o) {                          // interpolate manual anchors → per-year
  const ys = Object.keys(o.anchors).map(Number).sort((a, b) => a - b);
  const pop = YEARS.map(y => {
    if (y <= ys[0]) return o.anchors[ys[0]];
    if (y >= ys.at(-1)) return o.anchors[ys.at(-1)];
    let lo = ys[0]; for (const a of ys) if (a <= y) lo = a;
    const hi = ys[ys.indexOf(lo) + 1], f = (y - lo) / (hi - lo);
    return Math.round(o.anchors[lo] + (o.anchors[hi] - o.anchors[lo]) * f);
  });
  return { dens: pop.map(p => Math.round((p / o.area) * 100) / 100), pop, area: o.area };
}

function record(iso) {                               // shared fields for a country
  const dens = densBy.get(iso) || YEARS.map(() => null);
  const pop  = popBy.get(iso)  || YEARS.map(() => null);
  const d = latest(dens), p = latest(pop);
  const area = d && p ? Math.round(p / d) : 0;        // WB land area ≈ pop / density
  return { dens, pop, area };
}

/* ---------- Natural Earth polygons, joined to WB by ISO3 ---------- */
const fc = await getJson(NE);
const countries = [];
const usedIso = new Set();
for (const f of fc.features) {
  const p = f.properties;
  if (p.NAME === 'Antarctica') continue;
  let iso = p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : (p.ADM0_A3 || '');
  iso = ISO_ALIAS[iso] || iso;
  const polys = polysFromGeom(f.geometry).map(poly => poly.filter(r => r.length >= 3)).filter(poly => poly.length);
  if (!polys.length) continue;

  const m = metaByIso.get(iso), ov = OVERRIDES[iso];
  const name = ov ? ov.name : (m ? m.name : (p.NAME || p.ADMIN || 'Unknown'));
  const r = ov ? overrideRecord(ov)
          : metaByIso.has(iso) ? record(iso)
          : { dens: YEARS.map(() => null), pop: YEARS.map(() => null), area: 0 };
  if (m) usedIso.add(iso);
  countries.push({ id: iso, name, polys, ...r });
}

/* ---------- pins: WB countries with no 110m polygon ---------- */
const pins = [];
for (const [iso, m] of metaByIso) {
  if (usedIso.has(iso) || TERRITORIES.has(iso)) continue;
  const r = record(iso);
  if (latest(r.dens) == null) continue;              // no density at all → skip
  const pt = projection([+m.longitude, +m.latitude]);
  if (!pt) continue;
  pins.push({ id: iso, name: m.name, x: round(pt[0]), y: round(-pt[1]), ...r });
}

/* ---------- graticule + outline ---------- */
const graticule = [];
for (let lat = -60; lat <= 60; lat += 30) { const l = []; for (let lon = -180; lon <= 180; lon += 2) l.push([lon, lat]); graticule.push(projLine(l)); }
for (let lon = -150; lon <= 150; lon += 30) { const l = []; for (let lat = -90; lat <= 90; lat += 2) l.push([lon, lat]); graticule.push(projLine(l)); }
const op = [];
for (let lat = -90; lat <= 90; lat += 2) op.push([-180, lat]);
for (let lon = -180; lon <= 180; lon += 2) op.push([lon, 90]);
for (let lat = 90; lat >= -90; lat -= 2) op.push([180, lat]);
for (let lon = 180; lon >= -180; lon -= 2) op.push([lon, -90]);
const outline = projLine(op);

/* ---------- write ---------- */
const header = `// AUTO-GENERATED by tools/density-build/build.mjs — do not edit by hand.
// Geometry: Natural Earth Admin-0 (110m). Density: World Bank EN.POP.DNST (people/km²).
// Population: World Bank SP.POP.TOTL. dens[]/pop[] are aligned to YEARS.
`;
const body = `export const YEARS = ${JSON.stringify(YEARS)};
export const PROJECTION = "Equal Earth (Šavrič et al. 2018)";
export const COUNTRIES = ${JSON.stringify(countries)};
export const PINS = ${JSON.stringify(pins)};
export const GRATICULE = ${JSON.stringify(graticule)};
export const OUTLINE = ${JSON.stringify(outline)};
`;
writeFileSync(new URL('../../density-topography/data.js', import.meta.url), header + body);

const yi = YEARS.length - 1;
const withDens = countries.filter(c => c.dens[yi] != null).length;
console.log(`Wrote ${countries.length} polygon countries (${withDens} with 2023 density) + ${pins.length} pins, ${YEARS.length} years.`);
const top = [...countries, ...pins].filter(c => c.dens[yi] != null).sort((a, b) => b.dens[yi] - a.dens[yi]).slice(0, 6);
console.log('Densest 2023:', top.map(c => `${c.name} ${c.dens[yi]}`).join(' · '));
