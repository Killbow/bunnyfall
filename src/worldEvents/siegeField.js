// @ts-check
// The account server settles the siege field from the points fighters submit, preferring a field an attacker and a
// defender sent alike. Every input comes from town records, so honest clients match exactly.
import { PIXEL_UNITS } from '../net/wire.js';
import { SIEGE_UNITS_PER_M } from '../net/siegeRef.js';
import { noticeBoardIndex } from '../guilds/bountyBoard.js';

export function buildingKeysOfType(blocks, makeKey, type) {
  const out = [];
  for (const b of blocks ?? []) {
    const list = b?.dfBlock?.rmbBlock?.fldHeader?.buildingDataList ?? [];
    const count = Math.min(list.length, b?.dfBlock?.rmbBlock?.subRecords?.length ?? list.length);
    for (let i = 0; i < count; i++) if (list[i]?.buildingType === type) out.push(makeKey(b.x ?? 0, b.y ?? 0, i));
  }
  return out;
}

export const SIEGE_FIELD = Object.freeze({ thronePaceM: 1.5, defendCampM: 12, gateInM: 6, attackCampM: 14, openGateM: 40, openCampM: 60, squareM: 20, templePaceM: 2 });

/**
 * Picks the lowest door by center height, where Daggerfall Unity lands a player leaving the castle. Ties keep the
 * first door in record order, so every client picks the same one.
 * @param {Array<{ door: { a: number[], b: number[] } | null, box: number[], normal?: number[] | null, arena?: boolean }>} doors
 */
export function castleEntranceOf(doors) {
  let best = null, low = Infinity;
  for (const d of doors ?? []) {
    // Arena undercroft doors are dungeon entrances too, but never the castle entrance.
    if (d?.arena) continue;
    if (!d?.door || !Array.isArray(d.door.a) || !Array.isArray(d.door.b) || !Array.isArray(d.box) || d.box.length < 6) continue;
    const y = (d.door.a[1] + d.door.b[1]) / 2;
    const normal = Array.isArray(d.normal) ? [...d.normal] : null;
    if (!doorFace({ door: d.door, box: d.box, normal })) continue;
    if (Number.isFinite(y) && y < low - 1e-6) { low = y; best = { door: d.door, box: [...d.box], normal }; }
  }
  return best;
}

// Prefers the record's outward `normal`, because the box middle can lie outside the door (a U-shaped forecourt or a
// recessed gate).
export function doorFaceSign(ox, oz, cx, cz, box, normal) {
  const dn = Array.isArray(normal) ? ox * normal[0] + oz * normal[2] : NaN;
  if (Number.isFinite(dn) && Math.abs(dn) >= 0.5) return dn < 0 ? [-ox, -oz] : [ox, oz];
  const mx = (box[0] + box[3]) / 2, mz = (box[2] + box[5]) / 2;
  return (cx - mx) * ox + (cz - mz) * oz < 0 ? [-ox, -oz] : [ox, oz];
}

export function doorFace(frame) {
  const d = frame?.door, box = frame?.box;
  if (!d || !Array.isArray(d.a) || !Array.isArray(d.b) || !Array.isArray(box) || box.length < 6) return null;
  const rx = d.b[0] - d.a[0], rz = d.b[2] - d.a[2];
  const w = Math.hypot(rx, rz);
  if (!(w >= 0.3)) return null;
  const cx = (d.a[0] + d.b[0]) / 2, cz = (d.a[2] + d.b[2]) / 2;
  return { at: [cx, cz], out: doorFaceSign(-rz / w, rx / w, cx, cz, box, frame.normal) };
}
const boxMid = (box) => [(box[0] + box[3]) / 2, (box[2] + box[5]) / 2];
const unit = (x, z) => { const l = Math.hypot(x, z); return l > 1e-9 ? [x / l, z / l] : [1, 0]; };
const step = (p, d, m) => [p[0] + d[0] * m, p[1] + d[1] * m];

export function siegeFieldOf({ frames = null, palaceKeys = [], templeKeys = [], hallKeys = [], gates = [], boards = [], bounty = new Set(), centre = [0, 0], tier = 'palace', castle = null } = {}) {
  const palace = palaceKeys.map((k) => doorFace(frames?.get?.(k))).find(Boolean) ?? null;
  const face = (tier === 'crown' ? doorFace(castle) : null) ?? palace;
  if (!face) return null;
  const throne = step(face.at, face.out, SIEGE_FIELD.thronePaceM);
  const defend = step(face.at, face.out, SIEGE_FIELD.defendCampM);
  let gate = null, far = -1;
  for (const g of gates) {
    if (!Array.isArray(g?.box) || g.box.length < 6) continue;
    const m = boxMid(g.box), d = Math.hypot(m[0] - throne[0], m[1] - throne[1]);
    if (d > far) { far = d; gate = m; }
  }
  let gateBanner, attack;
  if (gate) {
    const inward = unit(centre[0] - gate[0], centre[1] - gate[1]);
    gateBanner = step(gate, inward, SIEGE_FIELD.gateInM);
    attack = step(gate, inward, -SIEGE_FIELD.attackCampM);
  } else {
    const away = unit(centre[0] - throne[0], centre[1] - throne[1]);
    gateBanner = step(centre, away, SIEGE_FIELD.openGateM);
    attack = step(centre, away, SIEGE_FIELD.openCampM);
  }
  const at = noticeBoardIndex(boards, bounty, centre);
  const market = at >= 0 && boards[at].box.length >= 6 ? boxMid(boards[at].box) : centre;
  let temple = null;
  for (const k of templeKeys) { const f = doorFace(frames?.get?.(k)); if (f) { temple = step(f.at, f.out, SIEGE_FIELD.templePaceM); break; } }
  if (!temple) {
    let big = -1;
    for (const k of hallKeys) {
      const fr = frames?.get?.(k), f = doorFace(fr);
      if (!f) continue;
      const area = (fr.box[3] - fr.box[0]) * (fr.box[5] - fr.box[2]);
      if (area > big) { big = area; temple = step(f.at, f.out, SIEGE_FIELD.templePaceM); }
    }
  }
  const banners = [gateBanner, market, temple ?? centre];
  if (tier === 'crown') banners.push(step(face.at, face.out, SIEGE_FIELD.squareM));
  return { banners, throne, camps: { attack, defend } };
}

// Built from the pixel and local meters only, never the floating origin, and rounded to whole units so every client
// sends identical wire points.
export const siegeWorldPoint = (px, py, p) => [Math.round(px * PIXEL_UNITS + p[0] * SIEGE_UNITS_PER_M), Math.round((499 - py) * PIXEL_UNITS + p[1] * SIEGE_UNITS_PER_M)];
export const siegeFieldWire = (px, py, f) => (f ? [...f.banners, f.throne, f.camps.attack, f.camps.defend].map((p) => siegeWorldPoint(px, py, p)) : null);
export const royalRingWire = (px, py, f) => (f && f.banners.length >= 4 ? [siegeWorldPoint(px, py, f.banners[3])] : null);
