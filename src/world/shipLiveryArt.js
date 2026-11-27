// @ts-check
// Repaints the port-built ship hull pictures with a livery over their strake, accent, and canvas families.
// Only the painted pictures are read: never the deck, spars, rigging, iron, or bottom.
import { C, galleonArt, GALLEON_ARCHIVE, GALLEON_NIGHT, galleonGlow, TEX as GALLEON_TEX } from './galleonArt.js';
import { CARRACK_PALETTE as CARRACK_K, carrackArt, CARRACK_ARCHIVE, CARRACK_NIGHT, carrackGlow, TEX as CARRACK_TEX } from './carrackArt.js';
import { LARGE_BOAT_PALETTE as LARGE_BOAT_K, largeBoatArt, LARGE_BOAT_ARCHIVE, TEX as LARGE_BOAT_TEX } from './largeBoatArt.js';
import { SHIP_PAINTS, paintFamilies, lumOf } from '../systems/naval/shipLivery.js';

const GILT = [C.gilt, C.giltDark, C.giltLit];
const OXBLOOD = [C.oxblood, C.oxbloodLit, [70, 20, 16], [80, 24, 18], [44, 13, 10], [62, 19, 15]];
export const CANVAS = Object.freeze([C.canvas, C.canvasSeam, C.canvasDirt]);
const palette = (...sets) => sets.flatMap((s) => Object.values(s));
const recs = (tex, keys) => Object.freeze(keys.filter((k) => tex[k] != null).map((k) => tex[k]));
const PAINTED = ['hullSide0', 'hullSide1', 'hullSide2', 'hullSide3', 'hullSide4', 'castle0', 'castle1', 'sternWindows0', 'sternWindows1', 'transom0', 'transom1',
  'house0', 'quarterRail0', 'roof', 'trim', 'gilt', 'lid', 'dark', 'door'];

export const LIVERY_ART = Object.freeze({
  [GALLEON_ARCHIVE]: Object.freeze({
    art: galleonArt, records: recs(GALLEON_TEX, PAINTED), canvas: GALLEON_TEX.canvas, palette: palette(C), strake: OXBLOOD, strakeBase: C.oxblood, accent: GILT, accentBase: C.gilt, night: GALLEON_NIGHT, glow: galleonGlow,
  }),
  [CARRACK_ARCHIVE]: Object.freeze({
    art: carrackArt, records: recs(CARRACK_TEX, PAINTED), canvas: CARRACK_TEX.canvas, palette: palette(C, CARRACK_K), strake: [CARRACK_K.blue, CARRACK_K.blueLit, CARRACK_K.blueDark, [18, 26, 38], [26, 36, 52]], strakeBase: CARRACK_K.blue,
    accent: [CARRACK_K.ochre, CARRACK_K.ochreLit, CARRACK_K.ochreDark, ...GILT], accentBase: CARRACK_K.ochre, night: CARRACK_NIGHT, glow: carrackGlow,
  }),
  [LARGE_BOAT_ARCHIVE]: Object.freeze({
    art: largeBoatArt, records: recs(LARGE_BOAT_TEX, PAINTED), canvas: LARGE_BOAT_TEX.canvas, palette: palette(C, LARGE_BOAT_K), strake: [LARGE_BOAT_K.green, LARGE_BOAT_K.greenLit, LARGE_BOAT_K.greenDark, ...OXBLOOD], strakeBase: LARGE_BOAT_K.green,
    accent: [LARGE_BOAT_K.ochre, LARGE_BOAT_K.ochreDark, ...GILT], accentBase: LARGE_BOAT_K.ochre, night: Object.freeze({}), glow: () => null,
  }),
});

const _art = new Map();
const artOf = (archive) => { if (!_art.has(archive)) _art.set(archive, LIVERY_ART[archive].art()); return _art.get(archive); };
export function warmLiveryArt() { for (const archive of Object.keys(LIVERY_ART)) artOf(Number(archive)); }

/**
 * @param {number} archive
 * @param {{ strake: number, accent: number, sail: number } | null} livery
 */
export function liveryArtOf(archive, livery) {
  const a = LIVERY_ART[archive];
  if (!a || !livery) return [];
  const paint = (i) => SHIP_PAINTS[i]?.rgb ?? null;
  const families = [
    { members: a.strake, base: a.strakeBase, paint: paint(livery.strake) },
    { members: a.accent, base: a.accentBase, paint: paint(livery.accent) },
  ];
  const sail = paint(livery.sail);
  const out = [];
  for (const [record, pic] of artOf(archive)) {
    if (record === a.canvas) {
      if (sail) out.push({ record, picture: shadeCloth(pic, sail), glow: null, night: null });
      continue;
    }
    if (!a.records.includes(record) || !families.some((f) => f.paint)) continue;
    const { picture, changed } = paintFamilies(pic, a.palette, families);
    if (!changed) continue;
    const night = a.night[record] ?? null;
    out.push({ record, picture, glow: night != null ? a.glow(record) : null, night });
  }
  return out;
}

export function shadeCloth(pic, paint) {
  const data = new Uint8Array(pic.data), base = lumOf(C.canvas);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const k = lumOf([data[i], data[i + 1], data[i + 2]]) / base;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round(paint[c] * k)));
  }
  return { ...pic, data };
}
