// @ts-check
// Show points are stored relative to `origin` in the wire frame and turned to the scene through `toScene` every
// frame, so a recenter carries them. The landing is in natives.
import { GUARD_TEXTURE, PERSON_GUARD_IDLE_RECORD, MOVE_RECORDS, MOVE_FLIPS } from '../../characters/mobilePerson.js';
import { mobileOrientation } from '../../characters/mobileUnit.js';
import { mobileBillboardSize } from '../../world/rmbFlats.js';
import { quatAngleAxis, quatMultiply, quatRotate } from '../../world/quat.js';
import { calculateHorseOrientation, horseViewFor, vsub, vadd } from '../horseCartLaw.js';
import { HORSE_ARCHIVE, horseStillRecord, HORSE_BILLBOARD_WIDTH, HORSE_BILLBOARD_HEIGHT } from '../horseCartPool.js';
import { pointOnLine } from '../../systems/livingWorld/townPaths.js';

export const WARDEN_GUARD_SPEED = 3.2;
export const WARDEN_GUARD_FPS = 8;
export const WARDEN_APPROACH_MAX = 7;
export const WARDEN_LIFT_S = 1.4;
export const WARDEN_TURN_S = 0.7;
export const WARDEN_PAUSE_S = 0.8;
export const WARDEN_LEAVE_MIN = 2;
export const WARDEN_HEAD = 1.85;
export const WARDEN_SIDE_GAP = 0.6;
export const WARDEN_TUMBLE = 1.25;
export const SHOW_ART_WAIT = 1.5;

export const flightSeconds = (/** @type {number} */ dist) => Math.min(4.5, Math.max(1.8, dist / 55));
export const arcPeak = (/** @type {number} */ dist) => Math.min(90, Math.max(15, dist * 0.35));
const ease = (/** @type {number} */ k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const wrapPi = (/** @type {number} */ a) => { let x = a % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; return x; };

export function lineOf(/** @type {number[][]} */ pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2));
  return { pts, len: cum[cum.length - 1] ?? 0, cum };
}
export function showTimes(/** @type {number} */ pathLen, /** @type {number} */ flyDist) {
  const len = Math.max(0, pathLen), walk = Math.min(len, WARDEN_APPROACH_MAX * WARDEN_GUARD_SPEED);
  const approach = walk / WARDEN_GUARD_SPEED, lift = approach + WARDEN_LIFT_S, turn = lift + WARDEN_TURN_S;
  const fly = flightSeconds(flyDist), land = turn + fly;
  const leave = land + WARDEN_PAUSE_S;
  return { walkFrom: len - walk, approach, lift, turn, fly, land, leave, gone: leave + Math.max(WARDEN_LEAVE_MIN, approach) };
}
export function arcPoint(/** @type {number[]} */ from, /** @type {number[]} */ to, /** @type {number} */ k, /** @type {number} */ peak, out = [0, 0, 0]) {
  const t = Math.min(1, Math.max(0, k)), u = 1 - t;
  out[0] = from[0] * u + to[0] * t;
  out[1] = from[1] * u + to[1] * t + Math.sin(Math.PI * t) * peak;
  out[2] = from[2] * u + to[2] * t;
  return out;
}
export const tumbleTurns = (/** @type {number} */ fly) => Math.max(1, Math.round(fly * WARDEN_TUMBLE));

const qInv = (/** @type {number[]} */ q) => [-q[0], -q[1], -q[2], q[3]];

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, toScene: (wire: number[]) => number[], groundAt: (x: number, z: number) => number, showWagon?: ((r: any, texRemap: any, position: number[], rotation: number[], kind: string, look?: any, tier?: number, turn?: any, hitched?: boolean) => boolean)|null, wagonBox?: ((kind: string) => (number[]|null))|null, horseArt?: ((look?: number) => boolean)|null, hold?: (owner: string, on: boolean, lone?: boolean) => void, sound?: (what: 'heave'|'throw'|'land', at: number[]) => void, now?: () => number, }} deps */
export function createWardenShows({
  renderer = null, getTexture = null, uploadRecordFrame = null, toScene, groundAt, showWagon = null, wagonBox = null,
  horseArt = null, hold = () => {}, sound = () => {}, now = () => performance.now() / 1000,
}) {
  /** @type {Map<string, any>} */
  const shows = new Map();
  /** @type {any} */
  let guardTex = null;
  const _batches = [];

  function guardArt() {
    if (guardTex && !(guardTex instanceof Promise)) return guardTex.failed ? false : guardTex.tex;
    if (!guardTex && getTexture) {
      guardTex = Promise.resolve().then(() => getTexture(GUARD_TEXTURE)).then(
        (tex) => { guardTex = tex ? { tex } : { failed: true }; },
        (e) => { guardTex = { failed: true }; console.warn('[warden] the guard\'s picture', e?.message ?? e); });
    }
    if (!getTexture) return false;
    return null;
  }

  function end(s) {
    if (s.guardBatch) renderer?.destroyBillboardBatch?.(s.guardBatch);
    for (const h of s.horses) if (h.batch) renderer?.destroyBillboardBatch?.(h.batch);
    if (s.held) { for (const o of s.owners) hold(o, false); s.held = false; }
    shows.delete(s.key);
  }
  function releaseTeam(s) {
    if (s.held) { for (const o of s.owners) hold(o, false); s.held = false; }
    for (const h of s.horses) if (h.batch) { renderer?.destroyBillboardBatch?.(h.batch); h.batch = null; }
  }

  function guardFeet(O, x, z) {
    const g = groundAt(O[0] + x, O[2] + z);
    return [O[0] + x, Number.isFinite(g) ? g : O[1], O[2] + z];
  }

  function poseGuard(s, feet, yaw, walking, t, cam) {
    const tex = guardArt();
    if (!tex || !renderer?.createBillboardBatch) return;
    let record, frame, flip = false;
    if (walking) {
      const o = cam ? mobileOrientation(yaw, feet, cam) : 0;
      record = MOVE_RECORDS[o]; flip = MOVE_FLIPS[o];
      const n = Math.max(1, tex.getFrameCount?.(record) ?? 1);
      frame = Math.floor(t * WARDEN_GUARD_FPS) % n;
    } else {
      record = PERSON_GUARD_IDLE_RECORD;
      frame = 0;
    }
    const rkey = `${record}#${frame}`;
    if (!renderer.textures?.has?.(`${GUARD_TEXTURE}_${rkey}`)) uploadRecordFrame?.(GUARD_TEXTURE, record, frame);
    const sz = mobileBillboardSize(tex, record);
    if (!walking && Number.isFinite(sz.h) && sz.h > 0.5 && sz.h < 4) s.head = sz.h;
    if (!s.guardBatch) { s.guardBatch = renderer.createBillboardBatch(GUARD_TEXTURE, rkey, { w: sz.w, h: sz.h }, [[0, 0, 0]]); s.guardBatch.origin = [0, 0, 0]; }
    const b = s.guardBatch;
    b.record = rkey; b.size = { w: flip ? -sz.w : sz.w, h: sz.h };
    b.origin[0] = feet[0]; b.origin[1] = feet[1]; b.origin[2] = feet[2];
  }

  function poseTeam(s, O, w, cam) {
    s.drawn = { at: vadd(O, w.at), rot: w.rot };
    if (!renderer?.createBillboardBatch || !horseArt?.()) return;
    const look = s.horseLook && horseArt?.(s.horseLook) ? s.horseLook : 0;
    for (const h of s.horses) {
      const pos = vadd(s.drawn.at, quatRotate(w.rot, h.off)), fwd = quatRotate(w.rot, h.fwd);
      const view = horseViewFor(calculateHorseOrientation(cam ?? pos, pos, fwd));
      if (!h.batch) { h.batch = renderer.createBillboardBatch(HORSE_ARCHIVE, horseStillRecord(0), { w: HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT }, [[0, 0, 0]]); h.batch.origin = [0, 0, 0]; }
      if (s.conceal) h.batch.conceal = s.conceal;
      if (view) { h.batch.record = horseStillRecord(view.view, look); h.batch.size = { w: view.flip ? -HORSE_BILLBOARD_WIDTH : HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT }; }
      h.batch.origin[0] = pos[0]; h.batch.origin[1] = pos[1]; h.batch.origin[2] = pos[2];
    }
  }
  const overHead = (s, G, rot) => vsub([G[0], G[1] + s.head, G[2]], quatRotate(rot, s.floor));
  function wagonPose(s, t, G) {
    const T = s.times;
    if (t < T.approach) return { at: [0, 0, 0], rot: s.rot0 };
    const carried = (/** @type {number[]} */ rot) => overHead(s, G, rot);
    if (t < T.lift) {
      const k = ease((t - T.approach) / WARDEN_LIFT_S), c = carried(s.rot0);
      const heave = Math.sin(k * Math.PI * 3) * 0.15 * (1 - k);
      return { at: [c[0] * k, c[1] * k + heave, c[2] * k], rot: s.rot0 };
    }
    if (t < T.turn) {
      const k = ease((t - T.lift) / WARDEN_TURN_S);
      const rot = quatMultiply(quatAngleAxis((s.dyaw * k * 180) / Math.PI, [0, 1, 0]), s.rot0);
      const c = carried(rot);
      return { at: [c[0], c[1] - Math.sin(k * Math.PI) * 0.35, c[2]], rot };
    }
    if (t < T.land) {
      const k = (t - T.turn) / T.fly;
      const spin = quatAngleAxis(360 * s.turns * k, s.side);
      const rot = quatMultiply(spin, s.rotT);
      const centre = arcPoint(s.from, s.to, k, s.peak);
      return { at: vsub(centre, quatRotate(rot, s.mid)), rot };
    }
    return null;
  }

  return {
    /** @param {{ key: string, owners: string[], snap: any, origin: number[], landing: number[], approach?: ((lift: number[], away: number[]) => (number[][]|null))|null, alive?: (() => boolean)|null }} o */
    start({ key, owners, snap, origin, landing, approach = null, alive = null }) {
      if (!key || shows.has(key) || !snap?.kind || !Array.isArray(owners) || !Array.isArray(origin) || !Array.isArray(landing)) return false;
      const box = wagonBox?.(snap.kind) ?? [-1, 0, -2, 1, 2, 2];
      const O = toScene(origin);
      const rot0 = snap.rotation;
      const floor = [(box[0] + box[3]) / 2, box[1], (box[2] + box[5]) / 2];
      const mid = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
      const L = toScene([landing[0], origin[1], landing[1]]);
      const land2 = [L[0] - O[0], L[2] - O[2]];
      const away = [land2[0], land2[1]];
      const al = Math.sqrt(away[0] * away[0] + away[1] * away[1]) || 1;
      away[0] /= al; away[1] /= al;
      const reach = Math.sqrt(((box[3] - box[0]) / 2) ** 2 + ((box[5] - box[2]) / 2) ** 2) + WARDEN_SIDE_GAP;
      const cw = quatRotate(rot0, mid);
      const lift = [cw[0] - away[0] * reach, cw[2] - away[1] * reach];
      let pts = null;
      try { pts = approach?.([O[0] + lift[0], O[2] + lift[1]], away) ?? null; } catch (e) { console.warn('[warden] the way', /** @type {any} */ (e)?.message ?? e); }
      const local = Array.isArray(pts) && pts.length >= 2 ? pts.map((p) => [p[0] - O[0], p[1] - O[2]]) : null;
      const line = lineOf(local ?? [[lift[0] - away[0] * 16, lift[1] - away[1] * 16], lift]);
      const yaw0 = Math.atan2(cw[0] - lift[0], cw[2] - lift[1]), yaw1 = Math.atan2(away[0], away[1]);
      const dyaw = wrapPi(yaw1 - yaw0);
      const rotT = quatMultiply(quatAngleAxis((dyaw * 180) / Math.PI, [0, 1, 0]), rot0);
      const horses = (snap.horses ?? []).map((/** @type {any} */ h) => ({
        off: quatRotate(qInv(rot0), vsub(h.at, snap.at)), fwd: quatRotate(qInv(rot0), h.forward), batch: null,
      }));
      const s = {
        key, owners: [...owners], kind: snap.kind, look: snap.look ?? null, tier: snap.tier ?? 0, turn: snap.turn ?? null, hitched: !!snap.hitched,
        conceal: snap.conceal ?? null, horseLook: snap.horseLook ?? 0, lone: snap.lone !== false,
        alive: typeof alive === 'function' ? alive : null, head: WARDEN_HEAD,
        origin: [origin[0], origin[1], origin[2]], landing: [landing[0], landing[1]],
        rot0, rotT, floor, mid, line, lift, yaw0, yaw1, dyaw, horses, land2,
        side: [away[1], 0, -away[0]], times: null, turns: 1, peak: 0, from: null, to: null,
        t0: null, asked: now(), held: true, said: new Set(), guardBatch: null,
        drawn: null,
      };
      for (const o of s.owners) hold(o, true, s.lone);
      shows.set(key, s);
      guardArt();
      return true;
    },
    frame(/** @type {number[]|null} */ cam = null) {
      if (!shows.size) return 0;
      const tn = now();
      // `end()` deletes the current entry, and Map iteration continues safely past a deleted key.
      for (const s of shows.values()) {
        if (s.held && s.alive && !s.alive()) { end(s); continue; }
        const O = toScene(s.origin);
        if (s.t0 === null) {
          if (guardArt() === null && tn - s.asked < SHOW_ART_WAIT) { poseTeam(s, O, { at: [0, 0, 0], rot: s.rot0 }, cam); continue; }
          s.t0 = tn;
        }
        const t = tn - s.t0;
        const liftFeet = guardFeet(O, s.lift[0], s.lift[1]);
        const G = [liftFeet[0] - O[0], liftFeet[1] - O[1], liftFeet[2] - O[2]];
        if (!s.times) {
          const dist = Math.sqrt((s.land2[0] - G[0]) ** 2 + (s.land2[1] - G[2]) ** 2);
          s.times = showTimes(s.line.len, dist);
          s.turns = tumbleTurns(s.times.fly);
          s.peak = arcPeak(dist);
        }
        const T = s.times;
        if (t >= T.turn && !s.from) {
          s.from = vadd(overHead(s, G, s.rotT), quatRotate(s.rotT, s.mid));
          const Lg = groundAt(O[0] + s.land2[0], O[2] + s.land2[1]);
          const ly = Number.isFinite(Lg) ? Lg - O[1] : G[1] - 2;
          const landOrigin = vsub([s.land2[0], ly, s.land2[1]], [0, quatRotate(s.rotT, s.floor)[1], 0]);
          s.to = vadd(landOrigin, quatRotate(s.rotT, s.mid));
        }
        let feet, yaw, walking;
        if (t < T.approach) { const p = pointOnLine(s.line, T.walkFrom + t * WARDEN_GUARD_SPEED); feet = guardFeet(O, p.x, p.z); yaw = p.yaw; walking = true; }
        else if (t < T.turn) { feet = liftFeet; yaw = t < T.lift ? s.yaw0 : s.yaw0 + s.dyaw * ease((t - T.lift) / WARDEN_TURN_S); walking = false; }
        else if (t < T.leave) { feet = liftFeet; yaw = s.yaw1; walking = false; }
        else if (t < T.gone) { const p = pointOnLine(s.line, s.line.len - (t - T.leave) * WARDEN_GUARD_SPEED); feet = guardFeet(O, p.x, p.z); yaw = p.yaw + Math.PI; walking = true; }
        else { end(s); continue; }
        poseGuard(s, feet, yaw, walking, t, cam);
        if (t >= T.approach && !s.said.has('heave')) { s.said.add('heave'); sound('heave', feet); }
        if (t >= T.turn && !s.said.has('throw')) { s.said.add('throw'); sound('throw', feet); }
        const w = s.held ? wagonPose(s, t, G) : null;
        if (!w) {
          if (s.held) { releaseTeam(s); sound('land', vadd(O, s.to ?? [0, 0, 0])); }
          s.drawn = null;
          continue;
        }
        poseTeam(s, O, w, cam);
      }
      return shows.size;
    },
    draw(r = renderer) {
      let n = 0;
      if (!showWagon) return n;
      for (const s of shows.values()) if (s.drawn && s.held && showWagon(r, null, s.drawn.at, s.drawn.rot, s.kind, s.look, s.tier, s.turn, s.hitched)) n++;
      return n;
    },
    batches() {
      _batches.length = 0;
      for (const s of shows.values()) {
        if (s.guardBatch) _batches.push(s.guardBatch);
        for (const h of s.horses) if (h.batch) _batches.push(h.batch);
      }
      return _batches;
    },
    playing: (/** @type {string} */ key) => shows.has(key),
    state: () => [...shows.values()].map((s) => ({ key: s.key, owners: s.owners, held: s.held, t: s.t0 === null ? null : now() - s.t0, times: s.times, guard: !!s.guardBatch, horses: s.horses.filter((h) => h.batch).length, at: s.drawn?.at ?? null })),
    destroyAll() { for (const s of [...shows.values()]) end(s); },
    dispose() { for (const s of [...shows.values()]) end(s); guardTex = null; },
  };
}
