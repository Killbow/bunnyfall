// @ts-check
import { raycastColliders, invertAffine } from '../../world/prefabColliders.js';
import { carriedPoint, yawDelta, activationModelOf, boardPlaceOf } from './comeSailAway.js';
import { mat4FromQuatPosScale, quatMultiply, quatRotate } from '../../world/quat.js';
import { CSA_WIRE_BOATS_MAX } from './comeSailAwayWire.js';
import { validAboard, POSE_ABOARD_LOCAL_MAX } from '../../net/wire.js';

export const CSA_ABOARD_BELOW = 3;
// A step's rise, as DFU's player controller stepOffset.
export const CSA_ABOARD_STEP = 0.3;
export const CSA_ABOARD_NEAR = 60;
export const CSA_ABOARD_GRACE = 2;
export const CSA_ABOARD_EASE = 12;
export const CSA_ABOARD_LOCAL_MAX = POSE_ABOARD_LOCAL_MAX;
const r2 = (v) => { const x = Math.round(v * 100) / 100; return x === 0 ? 0 : x; };
const DOWN = [0, -1, 0];

export const poseMatrix = (pose) => mat4FromQuatPosScale(pose.rotation, pose.position, [1, 1, 1]);
export function localOf(pose, p) {
  const inv = invertAffine(poseMatrix(pose));
  if (!inv) return null;
  return [inv[0] * p[0] + inv[4] * p[1] + inv[8] * p[2] + inv[12], inv[1] * p[0] + inv[5] * p[1] + inv[9] * p[2] + inv[13], inv[2] * p[0] + inv[6] * p[1] + inv[10] * p[2] + inv[14]];
}
export function worldOf(pose, l) {
  const m = poseMatrix(pose);
  return [m[0] * l[0] + m[4] * l[1] + m[8] * l[2] + m[12], m[1] * l[0] + m[5] * l[1] + m[9] * l[2] + m[13], m[2] * l[0] + m[6] * l[1] + m[10] * l[2] + m[14]];
}
const rootPose = (boat) => ({ position: boat.GameObject.position, rotation: boat.GameObject.rotation });
// The mod rocks the hull under its root, so places aboard are stored in the root frame at rest.
/** @returns {{ position: number[], rotation: number[] }} */
export function deckPose(boat, root = rootPose(boat)) {
  const mo = boat?.MeshObject;
  if (!mo || mo === boat.GameObject) return root;
  const bob = mo.localRotation;
  if (bob[0] === 0 && bob[1] === 0 && bob[2] === 0) return root;
  const links = [];
  let n = mo.parent;
  for (; n && n !== boat.GameObject; n = n.parent) links.push(n);
  if (!n) return root;
  let t = [0, 0, 0], q = [0, 0, 0, 1];
  for (let k = links.length - 1; k >= 0; k--) {
    const o = quatRotate(q, links[k].localPosition);
    t = [t[0] + o[0], t[1] + o[1], t[2] + o[2]];
    q = quatMultiply(q, links[k].localRotation);
  }
  const lm = quatRotate(q, mo.localPosition), m = [t[0] + lm[0], t[1] + lm[1], t[2] + lm[2]];
  const Q = quatMultiply(quatMultiply(q, bob), [-q[0], -q[1], -q[2], q[3]]);
  const qm = quatRotate(Q, m), o = quatRotate(root.rotation, [m[0] - qm[0], m[1] - qm[1], m[2] - qm[2]]);
  return { position: [root.position[0] + o[0], root.position[1] + o[1], root.position[2] + o[2]], rotation: quatMultiply(root.rotation, Q) };
}
function restPlace(boat, node) {
  const chain = [];
  let n = node;
  for (; n && n !== boat.GameObject; n = n.parent) chain.push(n);
  if (!n) return null;
  let t = [0, 0, 0], q = [0, 0, 0, 1], sc = [1, 1, 1];
  for (let k = chain.length - 1; k >= 0; k--) {
    const c = chain[k], p = c.localPosition;
    const o = quatRotate(q, [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]]);
    t = [t[0] + o[0], t[1] + o[1], t[2] + o[2]];
    if (c !== boat.MeshObject) q = quatMultiply(q, c.localRotation);
    sc = [sc[0] * c.localScale[0], sc[1] * c.localScale[1], sc[2] * c.localScale[2]];
  }
  return t;
}
/** @returns {[string, number, number, number, number] | null} */
export function helmWord(owner, slot, boat, height) {
  const drive = boat?.DrivePosition;
  if (typeof owner !== 'string' || !owner || !drive || !Number.isInteger(slot) || slot < 0 || slot >= CSA_WIRE_BOATS_MAX) return null;
  const l = restPlace(boat, drive);
  if (!l) return null;
  // The mod pins the player to DrivePosition, with the feet half a height under it.
  l[1] -= (Number.isFinite(height) && height > 0 ? height : 1.8) / 2;
  if (!l.every((v) => Math.abs(v) <= CSA_ABOARD_LOCAL_MAX)) return null;
  return [owner, slot, r2(l[0]), r2(l[1]), r2(l[2])];
}

/** @returns {{ owner: string, slot: number, local: number[] } | null} */
export function validAboardWord(raw) {
  const w = validAboard(raw);
  return w ? { owner: w[0], slot: w[1], local: w.slice(2) } : null;
}

/** @param {{ peers: any, geometry: (collider: any, node: any) => any, selfId?: () => (string | null) }} opts */
export function createComeSailAwayAboard({ peers, geometry, selfId = () => null }) {
  /** @type {{ boat: any, owner: string, slot: number, grace: number } | null} */
  let aboard = null;
  const riders = new Map();
  const posed = new Set();

  function deckUnder(boat, feet, height) {
    const h = Number.isFinite(height) && height > 0 ? height : 1.8;
    const centre = [feet[0], feet[1] + h / 2, feet[2]];
    const hit = raycastColliders(boat.GameObject, centre, DOWN, h / 2 + CSA_ABOARD_BELOW, { triggers: false, geometry });
    return !!hit && hit.point[1] <= feet[1] + CSA_ABOARD_STEP;
  }
  const near = (boat, feet) => { const p = boat.GameObject.position; return Math.hypot(p[0] - feet[0], p[2] - feet[2]) <= CSA_ABOARD_NEAR; };

  function leave() { aboard = null; }
  function board(boat, grace = 0) {
    const where = boat ? peers.placeOf(boat) : null;
    if (!where) return false;
    aboard = { boat, owner: where.owner, slot: where.slot, grace: Math.max(0, grace | 0) };
    return true;
  }

  const on = (boat, me) => { const g = me.ground(boat); return g === 'boat' || (g == null && deckUnder(boat, me.feet(), me.height)); };

  /**
   * @param {{ allowed: boolean, feet: () => number[], height: number, swimming: boolean,
   *           ground: (boat: any) => ('boat' | 'other' | null), carry: (delta: number[], yawDeg: number) => void }} me
   * @returns {any}
   */
  function frame(me) {
    if (!me.allowed) { leave(); return null; }
    if (aboard) {
      const where = peers.placeOf(aboard.boat);
      const move = where ? peers.moveOf(aboard.boat) : null;
      if (!where || !move) leave();
      else {
        aboard.owner = where.owner; aboard.slot = where.slot;
        const before = poseMatrix(move.before), after = poseMatrix(move.after);
        const feet = me.feet();
        const to = carriedPoint(before, after, feet);
        const yaw = yawDelta(before, after);
        const delta = [to[0] - feet[0], to[1] - feet[1], to[2] - feet[2]];
        if (delta[0] || delta[1] || delta[2] || yaw) me.carry(delta, yaw);
        if (aboard.grace > 0) aboard.grace--;
        else if (me.swimming || !on(aboard.boat, me)) leave();
      }
    }
    // A swimmer boards only by the ladder, as in the mod.
    if (!aboard && !me.swimming) {
      const feet = me.feet();
      for (const o of peers.shown()) {
        for (const s of o.boats) {
          if (!s?.boat?.GameObject?.activeSelf || !near(s.boat, feet)) continue;
          if (on(s.boat, me)) { board(s.boat); break; }
        }
        if (aboard) break;
      }
    }
    return aboard?.boat ?? null;
  }

  function word(feet) {
    if (!aboard) return null;
    const l = localOf(deckPose(aboard.boat), feet);
    return l ? [aboard.owner, aboard.slot, r2(l[0]), r2(l[1]), r2(l[2])] : null;
  }

  function applyRider(from, raw, nowMs = 0) {
    if (typeof from !== 'string' || !from || from === (selfId?.() ?? null)) return false;
    if (raw == null) { riders.delete(from); return true; }
    const w = validAboardWord(raw);
    if (!w) { riders.delete(from); return false; }
    const had = riders.get(from);
    const same = had && had.owner === w.owner && had.slot === w.slot;
    riders.set(from, { owner: w.owner, slot: w.slot, local: w.local, shown: same ? had.shown : [...w.local], at: nowMs });
    return true;
  }
  function sweepRiders(alive, nowMs, staleMs = 0) {
    for (const [id, r] of [...riders]) if (!alive?.has?.(id) || (staleMs > 0 && nowMs - r.at > staleMs)) riders.delete(id);
    for (const id of [...posed]) if (!alive?.has?.(id)) posed.delete(id);
  }
  function clearRiders() { riders.clear(); posed.clear(); }
  const passengersOn = (owner, slot, skip = null) => { let n = 0; for (const [id, r] of riders) if (r.owner === owner && r.slot === slot && !skip?.(id)) n++; return n; };

  /**
   * @param {any[]} drawable
   * @param {{ poseOf: (owner: string, slot: number) => ({ position: number[], rotation: number[] } | null),
   *           toWire: (p: number[]) => number[], dt: number }} host
   */
  function glue(drawable, { poseOf, toWire, dt }) {
    const t = 1 - Math.exp(-CSA_ABOARD_EASE * Math.max(0, dt));
    let out = drawable;
    for (let i = 0; i < drawable.length; i++) {
      const d = drawable[i];
      if (!d?.shown) continue;
      const on = d.shown.ab, r = riders.get(d.id);
      let owner, slot, at;
      // Once a sender's pose has carried a place aboard, a pose without one means ashore, whatever
      // their last word said.
      if (Array.isArray(on)) {
        posed.add(d.id);
        [owner, slot] = on; at = [on[2], on[3], on[4]];
        if (r && r.owner === owner && r.slot === slot) r.shown = [...at];
      } else if (!r || posed.has(d.id)) continue;
      else {
        for (let k = 0; k < 3; k++) r.shown[k] += (r.local[k] - r.shown[k]) * t;
        ({ owner, slot } = r); at = r.shown;
      }
      const pose = poseOf(owner, slot);
      if (!pose) continue;
      const w = toWire(worldOf(pose, at));
      if (out === drawable) out = drawable.slice();
      out[i] = { ...d, shown: { ...d.shown, x: w[0], y: w[1], z: w[2], deck: [at[0], at[1], at[2]], deckKey: `${owner}:${slot}` } };
    }
    return out;
  }

  /** @returns {{ boat: any, owner: string, slot: number, hit: any, modelId: number | null, distance: number } | null} */
  function pick(eye, dir, reach) {
    let best = null;
    for (const o of peers.shown()) {
      for (const s of o.boats) {
        if (!s?.boat?.GameObject?.activeSelf) continue;
        const hit = raycastColliders(s.boat.GameObject, eye, dir, reach, { triggers: true, geometry });
        if (hit && (!best || hit.distance < best.distance)) best = { boat: s.boat, hit, distance: hit.distance };
      }
    }
    if (!best) return null;
    const where = peers.placeOf(best.boat);
    if (!where) return null;
    return { ...best, owner: where.owner, slot: where.slot, modelId: activationModelOf(best.hit.node?.name) };
  }

  return {
    frame, board, leave, word, pick,
    boardPlace: (hit) => boardPlaceOf(hit.node),
    applyRider, sweepRiders, clearRiders, passengersOn, glue,
    get aboard() { return aboard ? { ...aboard } : null; },
    shipmates() {
      const me = selfId(), on = aboard?.owner ?? null;
      const out = on != null ? [on] : [];
      for (const [id, r] of riders) if (r.owner === me || (on != null && r.owner === on)) out.push(id);
      return out;
    },
    riders: () => [...riders].map(([id, r]) => ({ id, owner: r.owner, slot: r.slot, local: [...r.local], shown: [...r.shown] })),
  };
}
