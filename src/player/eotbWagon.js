// @ts-check
// The Eye of the Beholder cart that follows the billboard in cart transport mode.

import { modSettingsOf } from '../mods/modSettings.js';
import { trs } from '../world/mat4.js';
import { localAabb, transformedAabb } from '../render/frustum.js';
import { drawSeen } from '../homes/decorRoom.js';

export const WAGON_MODEL = 41239;
export const WAGON_REACH = 3.2;
export const OFFSET_LAST_SEED = Object.freeze([0, 0, -2.5]);
export const SPAWN_BEHIND = 10;
export const FOLLOW_TRIGGER = 2.5;
export const TELEPORT_TRIGGER = 10;
export const FOLLOW_DISTANCE = 2.49;
export const PROBE_BACK = 0.6;
export const PROBE_UP = 2;
export const PROBE_DOWN = 10;
export const GROUND_LIFT = 1;
export const WOBBLE_SPEED = 10;
export const WAGON_INFO_TEXT = 'You see your wagon';

export const WAGON_HOVER_TEXT = 'Wagon';
export const wagonHoverName = (key) => (key === 'eotbWagon' ? { title: WAGON_HOVER_TEXT } : null);

export function wobbleRoll(time, onExteriorPath = false) {
  let amp = 2 + (Math.sin(time) + 1);
  if (onExteriorPath) amp = 1 + (Math.sin(time) + 1) * 0.5;
  return Math.sin(time * WOBBLE_SPEED) * amp;
}

export function lookAtEuler(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return { yaw: 0, pitch: 0 };
  const yaw = Math.atan2(dx, dz) * 180 / Math.PI;
  const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / len))) * 180 / Math.PI;
  return { yaw, pitch };
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
const yawForward = (yawDeg) => { const r = yawDeg * Math.PI / 180; return [Math.sin(r), 0, Math.cos(r)]; };

/**
 * @param {{active:boolean, pos:number[]|null, yaw:number, pitch:number, roll:number, offsetLast:number[], time:number}} w
 * @param {{dt?:number, showCart?:boolean, cart?:boolean, bodyPos?:number[], bodyForward?:number[], onExteriorPath?:boolean, raycast?:((o:number[], d:number[], max:number) => number|null)|null}} f
 */
export function updateWagon(w, f = {}) {
  const dt = f.dt ?? 0;
  const next = { ...w, time: w.time + dt };
  if (!f.showCart) { next.active = false; return next; }
  if (!f.cart) { next.active = false; return next; }
  const body = f.bodyPos ?? [0, 0, 0];
  const bodyFwd = f.bodyForward ?? [0, 0, 1];
  if (!next.active || !next.pos) {
    next.active = true;
    next.pos = [body[0] - bodyFwd[0] * SPAWN_BEHIND, body[1] - bodyFwd[1] * SPAWN_BEHIND, body[2] - bodyFwd[2] * SPAWN_BEHIND];
  }
  let far = false, veryFar = false;
  const delta = [body[0] - next.pos[0], body[1] - next.pos[1], body[2] - next.pos[2]];
  const mag = Math.hypot(delta[0], delta[1], delta[2]);
  if (mag > FOLLOW_TRIGGER) { far = true; if (mag > TELEPORT_TRIGGER) veryFar = true; }
  if (far) {
    const dir = norm(veryFar ? w.offsetLast : delta);
    let target = [body[0] - dir[0] * FOLLOW_DISTANCE, body[1] - dir[1] * FOLLOW_DISTANCE, body[2] - dir[2] * FOLLOW_DISTANCE];
    const wf = yawForward(w.yaw);
    const origin = [target[0] - wf[0] * PROBE_BACK, target[1] - wf[1] * PROBE_BACK + PROBE_UP, target[2] - wf[2] * PROBE_BACK];
    const hit = f.raycast ? f.raycast(origin, [0, -1, 0], PROBE_DOWN) : null;
    if (hit != null && hit < PROBE_DOWN) {
      const grounded = [target[0], origin[1] - hit + GROUND_LIFT, target[2]];
      const d2 = norm([body[0] - grounded[0], body[1] - grounded[1], body[2] - grounded[2]]);
      target = [body[0] - d2[0] * FOLLOW_DISTANCE, body[1] - d2[1] * FOLLOW_DISTANCE, body[2] - d2[2] * FOLLOW_DISTANCE];
    }
    next.pos = target;
  }
  const look = lookAtEuler(next.pos, body);
  next.yaw = look.yaw; next.pitch = look.pitch; next.roll = 0;
  if (far) next.roll = wobbleRoll(next.time, !!f.onExteriorPath);
  next.offsetLast = delta;
  if (veryFar) next.offsetLast = [body[0] - next.pos[0], body[1] - next.pos[1], body[2] - next.pos[2]];
  return next;
}

export const freshWagon = () => ({ active: false, pos: null, yaw: 0, pitch: 0, roll: 0, offsetLast: [...OFFSET_LAST_SEED], time: 0 });

export const wagonMatrix = (w) => (w.active && w.pos ? trs(w.pos[0], w.pos[1], w.pos[2], w.pitch, w.yaw, w.roll) : null);

/** @returns {'info'|'inventory'} */
export const checkWagon = (mode) => (mode === 'info' ? 'info' : 'inventory');

export function showCart() {
  try { return modSettingsOf('eye-of-the-beholder')['Graphics.ShowCart'] !== false; } catch { return true; }
}

export function createEotbWagon() {
  let w = freshWagon();
  /** @type {null|{getGpuMesh:Function, cpuModels:Map<number, any>}} */
  let pipeline = null;
  let gpu = null;
  let loading = false;
  let localBox = null;

  const ensureMesh = () => {
    if (gpu || loading || !pipeline) return;
    loading = true;
    Promise.resolve(pipeline.getGpuMesh(WAGON_MODEL)).then((g) => {
      gpu = g ?? null;
      const cpu = pipeline?.cpuModels?.get(WAGON_MODEL);
      if (cpu?.positions) localBox = localAabb(cpu.positions);
    }).catch(() => {}).finally(() => { loading = false; });
  };

  return {
    attach(p) { pipeline = p ?? null; gpu = null; localBox = null; if (pipeline) ensureMesh(); return this; },
    tick(dt, { feet = null, yaw = 0, height = 1.8, cart = false, onExteriorPath = false, raycast = null } = {}) {
      if (!feet) return w;
      const body = [feet[0], feet[1] + height / 2, feet[2]];
      w = updateWagon(w, { dt, showCart: showCart(), cart, bodyPos: body, bodyForward: [Math.sin(yaw), 0, Math.cos(yaw)], onExteriorPath, raycast });
      if (w.active) ensureMesh();
      return w;
    },
    rebase(delta) {
      if (!delta || !w.pos) return;
      w = { ...w, pos: [w.pos[0] + delta[0], w.pos[1] + delta[1], w.pos[2] + delta[2]] };
    },
    draw(renderer, texRemap = null, cull = null) {
      const m = wagonMatrix(w);
      if (!m || !gpu || !renderer?.drawMesh) return false;
      return drawSeen(renderer, cull, cull && localBox ? transformedAabb(localBox, m) : null, gpu, m, texRemap);
    },
    targets(rayDistance = WAGON_REACH) {
      const m = wagonMatrix(w);
      if (!m) return [];
      const box = localBox ? transformedAabb(localBox, m) : [w.pos[0] - 1, w.pos[1] - 1, w.pos[2] - 1, w.pos[0] + 1, w.pos[1] + 1, w.pos[2] + 1];
      return [{ key: 'eotbWagon', aabb: { min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] }, obb: localBox ? { m, box: localBox } : null, noSurface: true, distance: rayDistance, reach: WAGON_REACH }];
    },
    activate(mode, { say = null, openInventoryWithWagon = null } = {}) {
      if (checkWagon(mode) === 'info') { say?.(WAGON_INFO_TEXT); return 'info'; }
      openInventoryWithWagon?.();
      return 'inventory';
    },
    state() { return w; },
    reset() { w = freshWagon(); },
  };
}

export const eotbWagon = createEotbWagon();
