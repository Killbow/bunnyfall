// @ts-check
// Draws the living world's road teams: wagons from the horse cart pool and eight-way horse billboards.
// Every allocation has an owner, and clear() destroys all of them.
import { mat4FromQuatPos, quatLookRotation } from './quat.js';
import { usableBounds } from '../travel/wagon41214.js';
import { boxTriangles, HORSE_ARCHIVE, horseStillRecord, HORSE_BILLBOARD_WIDTH, HORSE_BILLBOARD_HEIGHT } from '../travel/horseCartPool.js';
import { strangerHorseLook } from '../travel/horseCoats.js';
import { stepHorseWalk, freshHorseWalk, NORMAL_GROUND_OFFSET } from '../travel/horseCartLaw.js';
import { wheelAngleAt, HITCH_N } from '../systems/livingWorld/wagons.js';
import { NATIVE_PER_M } from '../travel/travelDungeons.js';
import { lensOf } from '../net/peerBodies.js';
import { poseWhereSeen } from './horseView.js';

export const ROAD_WAGON_KIND = 'cart';
export const WAGONS_DRAWN = 6;
/** @param {string} key */
export const wagonBucket = (key) => `lwWagon:${key}`;

/**
 * @typedef {{ key: string, feet: number[], yaw: number, moving: boolean, speed: number, distM: number }} HorseShown
 * @typedef {{ key: string, feet: number[], front: number[], yaw: number, moving: boolean, tier: number, s: number, distM: number, hitched?: boolean }} WagonShown
 */

/**
 * @param {{ renderer: any, presentation: () => any, collider?: () => any, horses3d?: () => any }} deps
 */
export function createRoadTeams({ renderer, presentation, collider = () => null, horses3d = () => null }) {
  /** @type {Map<string, { batch: any, walk: any, look: number, h3?: any, h3rig?: any, phase: number, out: boolean }>} */
  const horses = new Map();
  /** @type {any[]} */
  const drawn3d = [];
  /** @type {{ proj: any, view: any, eye: any, lens: number } | null} */
  let cam3d = null;
  let frameNo = 0, phases = 0;
  /** @type {Map<string, Float64Array>} */
  const boxes = new Map();
  /** @type {any[]} */
  const drawn = [];
  /** @type {{ position: number[], rotation: number[], tier: number, angle: number, grow: number, hitched: boolean }[]} */
  let wagons = [];

  function dropHorse(key) {
    const h = horses.get(key);
    if (h?.batch) renderer?.destroyBillboardBatch?.(h.batch);
    if (h?.h3) h.h3rig?.release(h.h3);
    horses.delete(key);
  }
  function takeDown(key) {
    collider()?.removeBucket?.(wagonBucket(key));
    boxes.delete(key);
  }

  /**
   * @param {HorseShown[]} horseList
   * @param {WagonShown[]} wagonList
   * @param {{ dt?: number, eye?: number[], grow?: number, ground?: boolean }} [o]
   */
  function sync(horseList, wagonList, { dt = 0, eye = [0, 0, 0], grow = 1, ground = true } = {}) {
    drawn.length = 0;
    drawn3d.length = 0;
    frameNo++;
    const rig = horses3d();
    const in3d = !!rig?.ready();
    const pres = presentation();
    const art = pres?.horseArt;
    if (art) { art.ensureStationary?.(); art.ensureWalk?.(); }
    const near = [...wagonList].sort((a, b) => a.distM - b.distM).slice(0, WAGONS_DRAWN);
    const drawnW = new Set(near.map((w) => w.key)), listed = new Set(wagonList.map((w) => w.key));
    const capped = (/** @type {string} */ key) => { const w = key.replace(/:h(\d+)$/, ':w$1'); return w !== key && listed.has(w) && !drawnW.has(w); };
    const seen = new Set();
    for (const h of horseList) {
      if (capped(h.key)) continue;
      seen.add(h.key);
      let s = horses.get(h.key);
      if (!s) {
        const batch = renderer?.createBillboardBatch?.(HORSE_ARCHIVE, horseStillRecord(0), { w: HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT }, [[0, 0, 0]]) ?? null;
        if (batch) batch.origin = [0, 0, 0];
        s = { batch, walk: freshHorseWalk(), look: strangerHorseLook(h.key), phase: phases++, out: false };
        horses.set(h.key, s);
      }
      s.walk = stepHorseWalk(s.walk, h.moving ? h.speed : 0, dt, !!art?.hasWalk?.());
      if (in3d) {
        if (!s.h3) { s.h3 = rig.horse(s.look % 65536 || 1); s.h3rig = rig; }
        if (!s.h3) continue;
        rig.step(s.h3, { feet: h.feet, yaw: h.yaw, speed: h.moving ? h.speed : 0, dt, look: s.look, pose: false });
        if (grow > 1) rig.place(s.h3, h.feet, h.yaw, grow);
        s.out = poseWhereSeen(rig, s.h3, h.feet, cam3d, eye, frameNo, s.phase, s.out);
        drawn3d.push(s);
        continue;
      }
      if (s.h3) { s.h3rig?.release(s.h3); s.h3 = null; s.h3rig = null; }
      if (!s.batch || !pres?.poseHorse) continue;
      pres.poseHorse(s.batch, eye, { position: h.feet, forward: [Math.sin(h.yaw), 0, Math.cos(h.yaw)], frame: s.walk.animationFrame ?? 0 }, 1, s.look);
      if (grow > 1 && s.batch.size) s.batch.size = { w: s.batch.size.w * grow, h: s.batch.size.h * grow };
      drawn.push(s.batch);
    }
    for (const key of [...horses.keys()]) if (!seen.has(key)) dropHorse(key);
    const parts = (pres?.partsOf ? pres.partsOf(ROAD_WAGON_KIND) : pres?.wagonParts?.()) ?? null;
    wagons = [];
    const stand = new Set();
    for (const w of near) {
      const up = [w.front[0] - w.feet[0], w.front[1] - w.feet[1], w.front[2] - w.feet[2]];
      const len = Math.hypot(up[0], up[1], up[2]);
      const forward = len > 1e-6 ? [up[0] / len, up[1] / len, up[2] / len] : [Math.sin(w.yaw), 0, Math.cos(w.yaw)];
      const rotation = quatLookRotation(forward, [0, 1, 0]);
      const position = [w.feet[0], w.feet[1] + NORMAL_GROUND_OFFSET, w.feet[2]];
      wagons.push({ position, rotation, tier: w.tier, angle: parts ? wheelAngleAt(w.s, parts.wheelRadius) : 0, grow, hitched: w.hitched !== false });
      if (!w.moving && ground && grow <= 1 && parts) {
        stand.add(w.key);
        const m = mat4FromQuatPos(rotation, position);
        const was = boxes.get(w.key);
        if (!was || was.some((v, i) => Math.abs(v - m[i]) >= 5e-4)) {
          const col = collider();
          if (col?.addMesh) {
            col.removeBucket?.(wagonBucket(w.key));
            const b = usableBounds(parts.bounds);
            const tri = boxTriangles(b.min, b.max);
            col.addMesh(wagonBucket(w.key), tri.positions, tri.indices, m);
            boxes.set(w.key, Float64Array.from(m));
          }
        }
      }
    }
    for (const key of [...boxes.keys()]) if (!stand.has(key)) takeDown(key);
  }

  return {
    sync,
    hitchN() {
      const m = presentation()?.hitchOfKind?.(ROAD_WAGON_KIND);
      return Number.isFinite(m) && m > 0 ? m * NATIVE_PER_M : HITCH_N;
    },
    batches: () => drawn,
    draw3d(canvas, { proj, view, eye, up = null }) {
      const rig = horses3d();
      cam3d = rig ? { proj, view, eye, lens: lensOf(proj) } : null;
      let n = 0;
      if (rig) for (const s of drawn3d) if (rig.draw(s.h3, canvas, { proj, view, eye, up, fresh: s.out })) n++;
      return n;
    },
    /**
     * @param {any} r
     * @param {any} [texRemap]
     * @param {any} [cull]
     */
    draw(r, texRemap = null, cull = null) {
      const pres = presentation();
      if (!pres?.drawWagon) return 0;
      let n = 0;
      const one = cull && pres.drawWagonSeen ? (/** @type {any[]} */ ...a) => pres.drawWagonSeen(r, cull, texRemap, ...a) : (/** @type {any[]} */ ...a) => pres.drawWagon(r, texRemap, ...a);
      for (const w of wagons) if (one(w.position, w.rotation, w.tier, { angle: w.angle }, w.grow, ROAD_WAGON_KIND, w.hitched)) n++;
      return n;
    },
    shown: () => ({ horses: horses.size, wagons: wagons.length, boxes: [...boxes.keys()] }),
    clear() {
      for (const key of [...horses.keys()]) dropHorse(key);
      for (const key of [...boxes.keys()]) takeDown(key);
      wagons = [];
      drawn.length = 0;
      drawn3d.length = 0;
    },
  };
}
