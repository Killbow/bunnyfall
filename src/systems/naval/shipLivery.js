// @ts-check
// A paint index fills one nibble of the livery code, so the list holds at most 16 entries; index 0 is none.
export const SHIP_PAINTS = Object.freeze([
  null,
  Object.freeze({ id: 'oxblood', rgb: Object.freeze([118, 34, 27]) }),
  Object.freeze({ id: 'crimson', rgb: Object.freeze([152, 32, 30]) }),
  Object.freeze({ id: 'black', rgb: Object.freeze([28, 26, 24]) }),
  Object.freeze({ id: 'navy', rgb: Object.freeze([32, 44, 80]) }),
  Object.freeze({ id: 'bay', rgb: Object.freeze([46, 66, 94]) }),
  Object.freeze({ id: 'teal', rgb: Object.freeze([38, 92, 96]) }),
  Object.freeze({ id: 'sea', rgb: Object.freeze([58, 92, 70]) }),
  Object.freeze({ id: 'forest', rgb: Object.freeze([40, 64, 36]) }),
  Object.freeze({ id: 'ochre', rgb: Object.freeze([176, 128, 48]) }),
  Object.freeze({ id: 'gold', rgb: Object.freeze([196, 152, 62]) }),
  Object.freeze({ id: 'white', rgb: Object.freeze([206, 200, 182]) }),
  Object.freeze({ id: 'grey', rgb: Object.freeze([112, 110, 104]) }),
  Object.freeze({ id: 'purple', rgb: Object.freeze([86, 40, 80]) }),
  Object.freeze({ id: 'tan', rgb: Object.freeze([150, 112, 72]) }),
]);
export const PAINT_MAX = SHIP_PAINTS.length - 1;
export const LIVERY_PARTS = Object.freeze(['strake', 'accent', 'sail', 'stain']);
// A pseudo-archive for textures painted in the session; no data file uses this number.
export const LIVERY_ARCHIVE = 38191;
export const STAIN_STRENGTH = 0.62;
export const SAIL_TINT = 0.85;

// Hulls follow HULL_NAMES order: Rowboat, Large Boat, Small Ship, Large Galley, and Carrack.
export function liveryPartsOf(hull) {
  if (hull === 1 || hull === 2 || hull === 4) return ['strake', 'accent', 'sail'];
  if (hull === 3) return ['stain', 'sail'];
  if (hull === 0) return ['stain'];
  return [];
}
const paintIndex = (v) => (Number.isInteger(v) && v >= 0 && v <= PAINT_MAX ? v : null);
export const isPaint = (v) => paintIndex(v) != null;
/**
 * @param {any} raw
 * @param {number} [hull]
 */
export function liveryOf(raw, hull) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { strake: 0, accent: 0, sail: 0, stain: 0 };
  for (const p of LIVERY_PARTS) {
    if (raw[p] == null) continue;
    const i = paintIndex(raw[p]);
    if (i == null) return null;
    out[p] = i;
  }
  if (hull != null) { const takes = liveryPartsOf(hull); for (const p of LIVERY_PARTS) if (!takes.includes(p)) out[p] = 0; }
  return LIVERY_PARTS.some((p) => out[p]) ? out : null;
}
export const liveryCode = (l) => { const v = liveryOf(l); return v ? v.strake | (v.accent << 4) | (v.sail << 8) | (v.stain << 12) : 0; };
export function liveryOfCode(n) {
  if (!Number.isInteger(n) || n <= 0 || n >= 1 << 16) return null;
  return liveryOf({ strake: n & 15, accent: (n >> 4) & 15, sail: (n >> 8) & 15, stain: (n >> 12) & 15 });
}

export const lumOf = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function shadeAs(paint, px, base) {
  const k = lumOf(px) / Math.max(1, lumOf(base));
  return [clamp8(paint[0] * k), clamp8(paint[1] * k), clamp8(paint[2] * k)];
}

/**
 * @param {{ width: number, height: number, data: Uint8Array }} pic
 * @param {ReadonlyArray<ReadonlyArray<number>>} palette
 * @param {{ members: ReadonlyArray<ReadonlyArray<number>>, base: ReadonlyArray<number>, paint: ReadonlyArray<number> | null }[]} families
 */
export function paintFamilies(pic, palette, families) {
  const out = new Uint8Array(pic.data);
  const live = families.filter((f) => f.paint);
  if (!live.length) return { picture: { ...pic, data: out }, changed: false };
  const anchors = [...palette.map((c) => ({ c, f: -1 }))];
  live.forEach((f, i) => { for (const c of f.members) anchors.push({ c, f: i }); });
  const memo = new Map();
  let changed = false;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let f = memo.get(key);
    if (f === undefined) {
      let best = Infinity;
      f = -1;
      for (const a of anchors) {
        const d = (a.c[0] - r) ** 2 + (a.c[1] - g) ** 2 + (a.c[2] - b) ** 2;
        if (d < best || (d === best && a.f >= 0)) { best = d; f = a.f; }
      }
      memo.set(key, f);
    }
    if (f < 0) continue;
    const c = shadeAs(live[f].paint, [r, g, b], live[f].base);
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
    changed = true;
  }
  return { picture: { ...pic, data: out }, changed };
}

export function meanLum(pic) {
  let s = 0, n = 0;
  for (let i = 0; i < pic.data.length; i += 4) if (pic.data[i + 3]) { s += lumOf([pic.data[i], pic.data[i + 1], pic.data[i + 2]]); n++; }
  return n ? s / n : 0;
}
export function tintPicture(pic, paint, strength) {
  const out = new Uint8Array(pic.data);
  const mean = Math.max(1, meanLum(pic)), base = [mean, mean, mean];
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const c = shadeAs(paint, [out[i], out[i + 1], out[i + 2]], base);
    for (let k = 0; k < 3; k++) out[i + k] = clamp8(out[i + k] * (1 - strength) + c[k] * strength);
  }
  return { ...pic, data: out };
}
export const stainPicture = (pic, paint) => tintPicture(pic, paint, STAIN_STRENGTH);
