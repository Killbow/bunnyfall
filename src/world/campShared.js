// @ts-check
// Camp tags ride the owner's cell enemy frame under the `cz` key as `[[i, campId, kind], ...]`, one per live camp
// member record.
import { FOE_SEQ_MAX } from '../net/wire.js';

// The array order sets the wire codes (index + 1), so append new kinds and never reorder them.
export const CAMP_KINDS = Object.freeze(['camp', 'pack', 'band']);
export const campKindCode = (kind) => { const k = CAMP_KINDS.indexOf(kind); return k >= 0 ? k + 1 : 2; };
export const campKindOf = (code) => (Number.isInteger(code) && code >= 1 && code <= CAMP_KINDS.length ? CAMP_KINDS[code - 1] : null);
// Matches `CELL_FRAME_RECORDS_MAX` in net/wire.js, the most records one frame carries.
export const CAMP_TAGS_MAX = 64;
const campNumber = (n) => Number.isInteger(n) && n >= 1 && n <= 0x7fffffff;
const recordNumber = (i) => Number.isInteger(i) && i >= 0 && i <= FOE_SEQ_MAX;

export function campTagsOf(records, foeOf) {
  const out = [];
  for (const r of records ?? []) {
    if (out.length >= CAMP_TAGS_MAX) break;
    const f = foeOf(r);
    if (!f || r.d === 1 || !campNumber(f.campId)) continue;
    out.push([r.i, f.campId, campKindCode(f.campKind)]);
  }
  return out;
}

export function validCampTags(raw) {
  /** @type {Map<number, {id: number, kind: string}>} */
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.size >= CAMP_TAGS_MAX) break;
    if (!Array.isArray(e) || e.length !== 3) continue;
    const [i, id, code] = e;
    const kind = campKindOf(code);
    if (recordNumber(i) && campNumber(id) && kind && !out.has(i)) out.set(i, { id, kind });
  }
  return out;
}

/**
 * @param {Array<{camp: string, kind: string, type: number, feet: number[]}>} members
 * @param {(type: number) => string} nameOf
 */
export function groupCamps(members, nameOf) {
  /** @type {Map<string, {key: string, kind: string, type: number, n: number, x: number, y: number, z: number}>} */
  const by = new Map();
  for (const m of members ?? []) {
    if (!m?.camp || !Array.isArray(m.feet)) continue;
    let g = by.get(m.camp);
    if (!g) { g = { key: m.camp, kind: m.kind, type: m.type, n: 0, x: 0, y: 0, z: 0 }; by.set(m.camp, g); }
    g.n++; g.x += m.feet[0]; g.y += m.feet[1]; g.z += m.feet[2];
  }
  return [...by.values()].map((g) => ({ key: g.key, kind: g.kind, n: g.n, at: [g.x / g.n, g.y / g.n, g.z / g.n], label: campLabel(nameOf(g.type), g.kind, g.n) }));
}

export function campLabel(name, kind, n) {
  const k = String(name ?? '').trim() || 'Enemy';
  if (n === 1) return k;
  return `${k} ${kind === 'camp' || kind === 'band' ? kind : 'pack'}, ${n}`;
}
