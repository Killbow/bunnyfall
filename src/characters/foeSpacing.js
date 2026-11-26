import { worldAabb } from '../player/activate.js';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS, STEP_OFFSET } from '../player/motor.js';
import { FALL_CHECK_DROP } from './enemyMotor.js';

export const FOE_SPACING_SPEED = 3;
export const FOE_SPACING_GAP = 2 * CAPSULE_RADIUS;

export const sweepHeight = (ai) => ai.controllerHeight ?? ai.height ?? CAPSULE_HEIGHT;

export const spacingSkips = (f) => !!f?.dead || !!f?.puppet || !f?.ai?.feet;

let _push = new Float64Array(64);
let _live = new Uint8Array(32);
const _was = [0, 0, 0], _from = [0, 0, 0], DOWN = [0, -1, 0];

function supported(collider, ai, feet) {
  const h = ai.height ?? CAPSULE_HEIGHT;
  _from[0] = feet[0]; _from[1] = feet[1] + (ai.centreOffset ?? h / 2); _from[2] = feet[2];
  const reach = h * 0.5 + FALL_CHECK_DROP;
  if (Number.isFinite(collider.raycast?.(_from, DOWN, reach) ?? Infinity)) return true;
  return _from[1] - (collider.heightAt?.(feet[0], feet[2]) ?? -Infinity) <= reach;
}

/**
 * @param foes
 * @param collider
 * @param dt
 * @param skip
 */
export function spaceFoes(foes, collider, dt, skip = spacingSkips) {
  const n = foes?.length ?? 0;
  if (n < 2 || !(dt > 0) || !collider?.move) return 0;
  if (_push.length < n * 2) _push = new Float64Array(n * 2);
  if (_live.length < n) _live = new Uint8Array(n);
  let live = 0;
  for (let i = 0; i < n; i++) { _live[i] = skip(foes[i], i) ? 0 : 1; live += _live[i]; }
  if (live < 2) return 0;
  _push.fill(0, 0, n * 2);
  let touched = false;
  for (let i = 0; i < n; i++) {
    if (!_live[i]) continue;
    const a = foes[i].ai.feet, ha = sweepHeight(foes[i].ai);
    for (let j = i + 1; j < n; j++) {
      if (!_live[j]) continue;
      const b = foes[j].ai.feet, hb = sweepHeight(foes[j].ai);
      if (!(a[1] < b[1] + hb && b[1] < a[1] + ha)) continue;
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const d2 = dx * dx + dz * dz;
      if (d2 >= FOE_SPACING_GAP * FOE_SPACING_GAP) continue;
      const d = Math.sqrt(d2);
      let ux, uz;
      if (d > 1e-4) { ux = dx / d; uz = dz / d; }
      else { const ang = i * 2.399963229728653 + j; ux = Math.cos(ang); uz = Math.sin(ang); }
      const share = (FOE_SPACING_GAP - d) / 2;
      _push[i * 2] -= ux * share; _push[i * 2 + 1] -= uz * share;
      _push[j * 2] += ux * share; _push[j * 2 + 1] += uz * share;
      touched = true;
    }
  }
  if (!touched) return 0;
  const cap = FOE_SPACING_SPEED * dt;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    let px = _push[i * 2], pz = _push[i * 2 + 1];
    const len = Math.hypot(px, pz);
    if (!(len > 1e-6)) continue;
    if (len > cap) { px *= cap / len; pz *= cap / len; }
    const ai = foes[i].ai, feet = ai.feet;
    const airborne = !!(ai.flies || ai.swims || ai.levitating);
    _was[0] = feet[0]; _was[1] = feet[1]; _was[2] = feet[2];
    const r = collider.move(feet, px, 0, pz, sweepHeight(ai), !airborne);
    if (!airborne && ((r && !r.grounded) || !supported(collider, ai, feet))) { feet[0] = _was[0]; feet[1] = _was[1]; feet[2] = _was[2]; continue; }
    moved++;
  }
  return moved;
}

/**
 * @param pools
 * @param skip
 */
export function spaceAcross(pools, collider, dt, skip = spacingSkips) {
  if (!(dt > 0) || !collider?.move || !pools || pools.length < 2) return 0;
  const bodies = [], group = [];
  pools.forEach((pool, g) => { for (const f of pool ?? []) if (!skip(f)) { bodies.push(f); group.push(g); } });
  const n = bodies.length;
  if (n < 2) return 0;
  const push = new Float64Array(n * 2);
  let touched = false;
  for (let i = 0; i < n; i++) {
    const a = bodies[i].ai.feet, ha = sweepHeight(bodies[i].ai);
    for (let j = i + 1; j < n; j++) {
      if (group[i] === group[j]) continue;
      const b = bodies[j].ai.feet, hb = sweepHeight(bodies[j].ai);
      if (!(a[1] < b[1] + hb && b[1] < a[1] + ha)) continue;
      const dx = b[0] - a[0], dz = b[2] - a[2], d2 = dx * dx + dz * dz;
      if (d2 >= FOE_SPACING_GAP * FOE_SPACING_GAP) continue;
      const d = Math.sqrt(d2);
      let ux, uz;
      if (d > 1e-4) { ux = dx / d; uz = dz / d; } else { const ang = i * 2.399963229728653 + j; ux = Math.cos(ang); uz = Math.sin(ang); }
      const share = 0.5 * (FOE_SPACING_GAP - d);
      push[i * 2] -= ux * share; push[i * 2 + 1] -= uz * share;
      push[j * 2] += ux * share; push[j * 2 + 1] += uz * share;
      touched = true;
    }
  }
  if (!touched) return 0;
  let moved = 0;
  for (let i = 0; i < n; i++) if (nudge(bodies[i].ai, push[i * 2], push[i * 2 + 1], FOE_SPACING_SPEED * dt, collider)) moved++;
  return moved;
}

function nudge(ai, px, pz, cap, collider) {
  const len = Math.hypot(px, pz);
  if (!(len > 1e-6)) return false;
  if (len > cap) { px *= cap / len; pz *= cap / len; }
  const feet = ai.feet, airborne = !!(ai.flies || ai.swims || ai.levitating);
  _was[0] = feet[0]; _was[1] = feet[1]; _was[2] = feet[2];
  const r = collider.move(feet, px, 0, pz, sweepHeight(ai), !airborne);
  if (!airborne && ((r && !r.grounded) || !supported(collider, ai, feet))) { feet[0] = _was[0]; feet[1] = _was[1]; feet[2] = _was[2]; return false; }
  return true;
}

export const DOORWAY_DEPTH = 1.4;
export const DOORWAY_HALF_WIDTH = 1.2;
export const DOORWAY_CLEAR_SPEED = 1.6;

export function clearDoorways(foes, doors, collider, dt, skip = spacingSkips) {
  if (!(dt > 0) || !collider?.move || !foes?.length || !doors?.length) return 0;
  let moved = 0;
  for (const f of foes) {
    if (skip(f)) continue;
    const ai = f.ai, feet = ai.feet;
    for (const d of doors) {
      const p = d.pos, n = d.normal;
      const nl = Math.hypot(n[0], n[2]);
      if (!(nl > 1e-6)) continue;
      const nx = n[0] / nl, nz = n[2] / nl;
      const rx = feet[0] - p[0], rz = feet[2] - p[2], dy = feet[1] - p[1];
      if (dy < -2.5 || dy > 1) continue;
      const along = rx * nx + rz * nz, across = -rx * nz + rz * nx;
      if (Math.abs(along) >= DOORWAY_DEPTH || Math.abs(across) >= DOORWAY_HALF_WIDTH) continue;
      const dest = ai.destination;
      const side = along >= 0 ? 1 : -1;
      if (dest) {
        const da = (dest[0] - p[0]) * nx + (dest[2] - p[2]) * nz;
        if (Math.sign(da) !== side && Math.abs(da) > 0.3) break;
      }
      const need = side * DOORWAY_DEPTH - along;
      if (nudge(ai, nx * need, nz * need, DOORWAY_CLEAR_SPEED * dt, collider)) moved++;
      break;
    }
  }
  return moved;
}

export function doorSpotsNear(doors, near, range = 40, doorOf = (e) => e) {
  const out = [];
  for (const entry of doors ?? []) {
    const door = doorOf(entry);
    const m = door?.matrix, c = door?.centre, nn = door?.normal;
    if (!m || !c || !nn) continue;
    const x = m[0] * c.x + m[4] * c.y + m[8] * c.z + m[12], y = m[1] * c.x + m[5] * c.y + m[9] * c.z + m[13], z = m[2] * c.x + m[6] * c.y + m[10] * c.z + m[14];
    if (near && Math.hypot(x - near[0], z - near[2]) > range) continue;
    const nx = m[0] * nn.x + m[4] * nn.y + m[8] * nn.z, nz = m[2] * nn.x + m[6] * nn.y + m[10] * nn.z;
    out.push({ pos: [x, y, z], normal: [nx, 0, nz] });
  }
  return out;
}

const _doorBoxes = new WeakMap();
export function actionDoorSpots(objects, near, range = 30) {
  const out = [];
  if (!objects) return out;
  for (const o of objects.values()) {
    if (o?.kind !== 'door' || !o.cpu?.positions || !o.base) continue;
    let box = _doorBoxes.get(o);
    if (!box || box.base !== o.base) { box = worldAabb(o.cpu.positions, o.base); box.base = o.base; _doorBoxes.set(o, box); }
    const cx = (box.min[0] + box.max[0]) / 2, cy = (box.min[1] + box.max[1]) / 2, cz = (box.min[2] + box.max[2]) / 2;
    if (near && Math.hypot(cx - near[0], cz - near[2]) > range) continue;
    const ex = box.max[0] - box.min[0], ez = box.max[2] - box.min[2];
    out.push({ pos: [cx, cy, cz], normal: ex < ez ? [1, 0, 0] : [0, 0, 1] });
  }
  return out;
}

export const LODGE_KNEE = 0.5;
export const LODGE_REACH = 4;
export const FIT_SKIN = 0.02;
export const FREE_RINGS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]);
const FREE_BEARINGS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]]);
const KNEE_BEARINGS = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]);
const UP = [0, 1, 0];
const PASS_SKIN = 1e-3;
const _knee = [0, 0, 0], _bead = [0, 0, 0];

export function bodyFits(collider, feet, height = CAPSULE_HEIGHT) {
  const top = feet[1] + Math.max(CAPSULE_RADIUS, height - CAPSULE_RADIUS);
  _bead[0] = feet[0]; _bead[2] = feet[2];
  for (let y = feet[1] + CAPSULE_RADIUS; ; y = Math.min(top, y + CAPSULE_RADIUS)) {
    _bead[1] = y;
    if (collider.sphereOverlaps(_bead, CAPSULE_RADIUS - FIT_SKIN)) return false;
    if (y >= top) return true;
  }
}

export function lodgedIn(collider, feet) {
  if (!feet || typeof collider?.raycastHit !== 'function' || typeof collider.sphereOverlaps !== 'function') return false;
  _knee[0] = feet[0]; _knee[1] = feet[1] + LODGE_KNEE; _knee[2] = feet[2];
  const lid = collider.raycastHit(_knee, UP, LODGE_REACH);
  const lidded = lid?.back === true && Number.isFinite(lid.dist);
  let walls = 0;
  for (const dir of KNEE_BEARINGS) {
    const h = collider.raycastHit(_knee, dir, LODGE_REACH);
    if (h?.back === true && Number.isFinite(h.dist)) walls++;
  }
  return walls >= (lidded ? 2 : KNEE_BEARINGS.length);
}

export function clearPast(collider, from, dir, dist) {
  const p = [from[0], from[1], from[2]];
  let left = dist;
  for (let n = 0; n < 8 && left > 0; n++) {
    const h = collider.raycastHit(p, dir, left);
    if (!Number.isFinite(h?.dist)) return true;
    if (h.back !== true) return false;
    const step = h.dist + PASS_SKIN;
    p[0] += dir[0] * step; p[1] += dir[1] * step; p[2] += dir[2] * step;
    left -= step;
  }
  return left <= 0;
}

function floorNear(collider, x, y0, z) {
  _from[0] = x; _from[1] = y0 + STEP_OFFSET; _from[2] = z;
  const h = collider.raycastHit(_from, DOWN, 2 * STEP_OFFSET);
  let y = Number.isFinite(h?.dist) && h.back !== true ? _from[1] - h.dist : -Infinity;
  const g = collider.heightAt?.(x, z);
  if (Number.isFinite(g) && g > y && g <= _from[1] && g >= y0 - STEP_OFFSET) y = g;
  return y > -Infinity ? y : null;
}

export function freeLodgedFeet(collider, feet, { height = CAPSULE_HEIGHT, airborne = false } = {}) {
  if (!lodgedIn(collider, feet)) return false;
  const fit = Math.min(height, CAPSULE_HEIGHT);
  const knee = [feet[0], feet[1] + LODGE_KNEE, feet[2]];
  for (const r of FREE_RINGS) {
    for (const [ux, uz] of FREE_BEARINGS) {
      const x = feet[0] + ux * r, z = feet[2] + uz * r;
      const y = airborne ? feet[1] : floorNear(collider, x, feet[1], z);
      if (y == null || !clearPast(collider, knee, [ux, 0, uz], r)) continue;
      const spot = [x, y, z];
      if (!bodyFits(collider, spot, fit) || lodgedIn(collider, spot)) continue;
      feet[0] = x; feet[1] = y; feet[2] = z;
      return true;
    }
  }
  return false;
}

