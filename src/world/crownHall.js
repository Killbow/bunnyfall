// @ts-check
import { FACTION_TYPES } from '../formats/factionFile.js';
import { BANNER_H_M } from '../render/bannerPass.js';
import { BULLETIN_BOARD_MODEL_ID } from './rmbLayout.js';

export const CROWN_HALL_CHEST_MODEL = 41811;
export const CROWN_HALL_BOARD_MODEL = BULLETIN_BOARD_MODEL_ID;
export const CROWN_HALL_EYE_M = 1.2;
export const CROWN_HALL_WALL_EYE_M = 2.4;
export const CROWN_HALL_LOOK_M = 12;
export const CROWN_HALL_WALL_M = 6;
export const CROWN_HALL_BANNER_SIDE_M = 1.5;
export const CROWN_HALL_BANNER_CEIL_M = 0.1;
export const CROWN_HALL_BANNER_TOP_M = 3.2;
export const CROWN_HALL_BANNER_OUT_M = 0.15;
export const CROWN_HALL_SPOTS = Object.freeze([[2.5, 2], [2.5, 1.5], [2, 1.5], [3, 2], [2, 1], [1.5, 1]]);
export const CROWN_HALL_CLEAR_M = 0.6;
export const CROWN_HALL_STEP_M = 0.6;
const WAYS = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze([Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)])));

/**
 * The ruler is the first child of the Province faction for the region when that child is an Individual, the same
 * rule Daggerfall uses to name a lord.
 * @param {Map<number, any>|null|undefined} factionDict
 * @param {number} region
 */
export function crownRulerFactionId(factionDict, region) {
  if (!factionDict || !Number.isInteger(region)) return null;
  for (const f of factionDict.values()) {
    if (f?.type !== FACTION_TYPES.Province || f.region !== region) continue;
    const first = f.children?.length ? factionDict.get(f.children[0]) : null;
    return first?.type === FACTION_TYPES.Individual ? first.id : null;
  }
  return null;
}

/**
 * @param {{ x: number, y: number, z: number }} at
 * @param {(o: number[], d: number[], max: number) => number} ray
 */
export function crownHallPlan(at, ray) {
  if (!at || ![at.x, at.y, at.z].every(Number.isFinite) || typeof ray !== 'function') return null;
  const drop = ray([at.x, at.y + 0.5, at.z], [0, -1, 0], 8);
  if (!Number.isFinite(drop)) return null;
  const floor = at.y + 0.5 - drop;
  const eye = floor + CROWN_HALL_EYE_M;
  const look = (x, z, w, max) => { const d = ray([x, eye, z], [w[0], 0, w[1]], max); return Number.isFinite(d) ? d : max; };
  const high = floor + CROWN_HALL_WALL_EYE_M;
  let back = WAYS[4];
  let wall = Infinity;
  for (const w of WAYS) {
    const d = ray([at.x, high, at.z], [w[0], 0, w[1]], CROWN_HALL_LOOK_M);
    if (Number.isFinite(d) && d < wall - 1e-6) { wall = d; back = w; }
  }
  const open = [-back[0], -back[1]];
  const side = [open[1], -open[0]];
  const banners = [];
  if (wall <= CROWN_HALL_WALL_M) {
    const up = ray([at.x, eye, at.z], [0, 1, 0], 8);
    const ceiling = Number.isFinite(up) ? eye + up : floor + CROWN_HALL_BANNER_TOP_M + CROWN_HALL_BANNER_CEIL_M;
    const top = Math.min(floor + CROWN_HALL_BANNER_TOP_M, ceiling - CROWN_HALL_BANNER_CEIL_M);
    if (top - BANNER_H_M >= floor) {
      const d = wall - CROWN_HALL_BANNER_OUT_M;
      const out = [open[0], 0, open[1]];
      const right = [-out[2], 0, out[0]];
      for (const s of [-1, 1]) {
        const x = at.x + back[0] * d + side[0] * s * CROWN_HALL_BANNER_SIDE_M;
        const z = at.z + back[1] * d + side[1] * s * CROWN_HALL_BANNER_SIDE_M;
        banners.push({ top: [x, top, z], right, out });
      }
    }
  }
  const stand = (s, model) => {
    for (const [fwd, lat] of CROWN_HALL_SPOTS) {
      const x = at.x + open[0] * fwd + side[0] * s * lat;
      const z = at.z + open[1] * fwd + side[1] * s * lat;
      const dx = x - at.x, dz = z - at.z, len = Math.hypot(dx, dz);
      if (look(at.x, at.z, [dx / len, dz / len], len + CROWN_HALL_CLEAR_M) < len + CROWN_HALL_CLEAR_M) continue;
      const under = ray([x, eye, z], [0, -1, 0], CROWN_HALL_EYE_M + CROWN_HALL_STEP_M);
      if (!Number.isFinite(under) || Math.abs(eye - under - floor) > CROWN_HALL_STEP_M) continue;
      const face = [-side[0] * s, -side[1] * s];
      return { pos: [x, eye - under, z], yawDeg: (Math.atan2(face[0], face[1]) * 180) / Math.PI, model };
    }
    return null;
  };
  return { floor, banners, board: stand(1, CROWN_HALL_BOARD_MODEL), chest: stand(-1, CROWN_HALL_CHEST_MODEL) };
}

/**
 * @param {Array<any>|null|undefined} people
 * @param {number|null} rulerId
 */
export const crownRulerHere = (people, rulerId) => (rulerId == null ? null : (people ?? []).find((p) => p?.factionID === rulerId) ?? null);

export const CROWN_HALL_TEXT = Object.freeze({
  board: 'Roster board',
  chest: 'Stores chest',
  chestShut: (name) => `This chest is ${name || 'the crown\'s guild'}'s. Its Stores are for its members.`,
});
