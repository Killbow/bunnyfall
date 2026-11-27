// @ts-check
import { SD_STONES, SD_STONE_POS, sdHour } from '../../net/sdBrain.js';
import { buildStoneModel, buildBezelModel, buildHandModel, buildCrownGearModel, handMatrix, crownGearMatrix, handleBox, stoneSolids, SD_CROWN_GEAR } from '../../world/sdHall.js';
import { ensureSdHallArt, sdHandWay, SD_HAND_RATE } from '../../worldEvents/sdHall.js';
import { spireOrreryOf } from './spireOrrery.js';
import { spireObjs } from './spireKit.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../../player/activate.js';
import { identity } from '../../world/mat4.js';

export const EG_STONE_TOP_M = SD_CROWN_GEAR.y + SD_CROWN_GEAR.tip;

// Spot `q.y` is in centimeters. A translation alone works in both frames because `realmToDungeon` only translates.
export const egStoneShift = (spec, q, j) => [spec.x0 + q.x - SD_STONE_POS[j].x, Number.isFinite(q.y) ? q.y / 100 : 0, q.z - SD_STONE_POS[j].z];
export function egStoneHandleBox(d, j, side) {
  const b = handleBox(j, side);
  return { min: [b.min[0] + d[0], b.min[1] + d[1], b.min[2] + d[2]], max: [b.max[0] + d[0], b.max[1] + d[1], b.max[2] + d[2]] };
}
export function egStoneSolidTris(d, j, out = []) {
  for (const [, quads] of stoneSolids(j)) for (const q of quads) for (const k of [0, 1, 2, 0, 2, 3]) out.push(q[k][0] + d[0], q[k][1] + d[1], q[k][2] + d[2]);
  return out;
}
const carry = (m, d) => { m[12] += d[0]; m[13] += d[1]; m[14] += d[2]; return m; };
const still = (m) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };

/** @param {{ seed: number, specs: any[], place: (kind: string, mk: string, modelFn: () => any, o?: { turns?: boolean }) => any }} deps */
export function createEgOrrery({ seed, specs, place }) {
  const halls = [];
  for (const spec of specs) {
    const spots = spec.kind === 'athenaeum' ? (spec.spots?.stone ?? []).slice(0, SD_STONES.length) : [];
    if (!spots.length) continue;
    const o = spireOrreryOf(seed, spec), start = spots.map((_, j) => o?.start?.[j] ?? 0);
    halls.push({ spec, o, stones: spots.map((q, j) => ({ j, d: egStoneShift(spec, q, j), body: null, bezel: null, hand: null, gear: null })), shown: [...start], want: [...start], heard: false });
  }
  let targetList = [], stood = false;
  const poseHand = (s, h) => {
    if (s.hand) carry(handMatrix(s.j, h, s.hand.object.matrix), s.d);
    if (s.gear) carry(crownGearMatrix(s.j, h, s.gear.object.matrix), s.d);
  };
  function wantOf(H, objs) {
    if (objs.h === H.spec.h && Array.isArray(objs.orr)) { H.heard = true; return objs.orr; }
    if (objs.h > H.spec.h && H.o) return H.o.truth;
    return H.heard ? H.want : H.o?.start ?? H.want;
  }
  return {
    // Call once inside the span's `stand`, before its batch is built, so the stones' parts join that batch.
    stand({ renderer = null, collider = null } = {}) {
      if (stood) return targetList;
      stood = true;
      if (halls.length) ensureSdHallArt(renderer);
      const list = [];
      for (const H of halls) {
        const tris = [];
        for (const s of H.stones) {
          s.body = place('orrery', `orrery:stone:${s.j}`, () => buildStoneModel(s.j));
          s.bezel = place('orrery', `orrery:bezel:${s.j}`, () => buildBezelModel(s.j));
          for (const d of [s.body, s.bezel]) if (d) carry(still(d.object.matrix), s.d);
          s.hand = place('orreryHand', 'orrery:hand', () => buildHandModel(), { turns: true });
          s.gear = place('orreryHand', 'orrery:gear', () => buildCrownGearModel(), { turns: true });
          poseHand(s, H.shown[s.j]);
          egStoneSolidTris(s.d, s.j, tris);
          for (const side of [1, -1]) list.push({ key: `egstone:${H.spec.h}:${s.j}:${side > 0 ? 'f' : 'b'}`, aabb: egStoneHandleBox(s.d, s.j, side), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
        }
        const positions = new Float32Array(tris), indices = new Uint16Array(positions.length / 3);
        for (let k = 0; k < indices.length; k++) indices[k] = k;
        try { collider?.addMesh?.(`eg:orrery:${H.spec.h}`, positions, indices, identity()); } catch (e) { console.warn('[eg] an Orrery\'s stones\' collider', e?.message ?? e); }
      }
      return (targetList = list);
    },
    frame(dt) {
      if (!stood || !halls.length) return;
      const objs = spireObjs(), step = Math.max(0, dt) * SD_HAND_RATE;
      for (const H of halls) {
        const want = wantOf(H, objs);
        for (const s of H.stones) {
          H.want[s.j] = Number.isFinite(want[s.j]) ? want[s.j] : H.want[s.j];
          const w = sdHandWay(H.shown[s.j], H.want[s.j]);
          if (w === 0) continue;
          H.shown[s.j] = Math.abs(w) <= step ? H.want[s.j] : sdHour(H.shown[s.j] + Math.sign(w) * step);
          poseHand(s, H.shown[s.j]);
        }
      }
    },
    targets: () => targetList,
    get stones() { return halls.flatMap((H) => H.stones.map((s) => ({ h: H.spec.h, j: s.j, d: [...s.d], shown: H.shown[s.j], body: s.body, bezel: s.bezel, hand: s.hand, gear: s.gear }))); },
    clear() {
      for (const H of halls) { H.heard = false; for (const s of H.stones) { s.body = s.bezel = s.hand = s.gear = null; } }
      targetList = []; stood = false;
    },
  };
}
