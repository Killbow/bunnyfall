// @ts-check
// Packs a pixel's nature list by column for the worker wire.

/**
 * @param {any[]} list
 */
export function packNature(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const keys = [];
  const at = new Map();
  for (const f of list) {
    for (const k in f) {
      if (at.has(k)) continue;
      at.set(k, keys.length);
      keys.push(k);
    }
  }
  const n = list.length, cols = keys.map(() => new Float64Array(n).fill(NaN));
  for (let i = 0; i < n; i++) {
    const f = list[i];
    for (const k in f) {
      const v = f[k];
      if (v === undefined) continue;
      if (typeof v !== 'number') return list;
      cols[at.get(k)][i] = v;
    }
  }
  return { wire: 'nature', n, keys, cols };
}

export const natureBuffers = (packed) => (packed?.wire === 'nature' ? packed.cols.map((c) => c.buffer) : []);

/**
 * @param {any} packed
 */
export function unpackNature(packed) {
  if (packed?.wire !== 'nature') return packed;
  const { n, keys, cols } = packed, out = new Array(n);
  const col = (k) => { const j = keys.indexOf(k); return j < 0 ? null : cols[j]; };
  const cr = col('record'), cx = col('x'), cy = col('y'), cz = col('z'), ca = col('archive'), cw = col('wood'), cj = col('jungle'), cs = col('js');
  const rest = [];
  for (let k = 0; k < keys.length; k++) if (!SHAPED.has(keys[k])) rest.push(k);
  const at = (c, i) => { if (!c) return undefined; const v = c[i]; return v === v ? v : undefined; };
  for (let i = 0; i < n; i++) {
    const f = { record: at(cr, i), x: at(cx, i), y: at(cy, i), z: at(cz, i), archive: at(ca, i), wood: at(cw, i), jungle: at(cj, i), js: at(cs, i) };
    for (let r = 0; r < rest.length; r++) { const v = cols[rest[r]][i]; if (v === v) f[keys[rest[r]]] = v; }
    out[i] = f;
  }
  return out;
}
const SHAPED = new Set(['record', 'x', 'y', 'z', 'archive', 'wood', 'jungle', 'js']);
