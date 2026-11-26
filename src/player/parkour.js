import { KHAJIIT_CLIMBING_BONUS, climbingSpeed } from './climbing.js';
import { overcapClimbSpeed } from '../characters/skillSoftcap.js';

export const PARKOUR_REACH_MIN = 1.5;
export const PARKOUR_REACH_MAX = 2.1;
export const PARKOUR_AIR_REACH = 0.15;
export const PARKOUR_AIR_LOW = 0.25;
export const PARKOUR_WALL_REACH = 0.5;
export const PARKOUR_FACING_DOT = Math.cos((50 * Math.PI) / 180);
export const PARKOUR_FACE_MAX_NY = 0.5;
export const PARKOUR_TOP_MIN_NY = Math.cos((50 * Math.PI) / 180);
export const PARKOUR_TOP_RUN = PARKOUR_TOP_MIN_NY / Math.sqrt(1 - PARKOUR_TOP_MIN_NY * PARKOUR_TOP_MIN_NY);
export const PARKOUR_SCAN_STEP = 0.1;
export const PARKOUR_FACE_LEAN = 0.08;
export const PARKOUR_CRACK = 0.03;
export const PARKOUR_CRACK_STEP = 0.0025;
export const PARKOUR_EDGE_INSET = 0.03;
export const PARKOUR_UNDER = 0.02;
export const PARKOUR_TOP_INSET = 0.12;
export const PARKOUR_TOP_PROBE = 0.3;
export const PARKOUR_TOP_STEP = 0.1;
export const PARKOUR_TOP_WALK = 1.0;
export const PARKOUR_TOP_DROP = 0.1;
export const PARKOUR_MIN_STAND_DEPTH = 0.28;
export const PARKOUR_SLOPE_SLACK = 0.1;
export const PARKOUR_FOOTING = 0.15;
export const PARKOUR_NUDGE = Object.freeze([0, 0.15, -0.15, 0.3, -0.3]);
export const PARKOUR_UP_GAP = 0.04;
export const PARKOUR_MANTLE_ARC = 0.03;
export const PARKOUR_FIT_EPS = 0.03;
export const PARKOUR_BODY_RADIUS = 0.35;
export const PARKOUR_FIT_BAND = 0.1375;
export const PARKOUR_BAND_SLACK = 0.02;
export const PARKOUR_LEAN = [0, 0.02, 0.05, 0.1];
export const PARKOUR_SIDESTEP_MAX = 0.45;
export const PARKOUR_SIDESTEP_PROBE = 0.05;
export const PARKOUR_SIDESTEP_RISE = 0.1;
export const PARKOUR_SIDESTEP_CLEAR = 0.3;
export const PARKOUR_HUG_PRESS = 0.01;
export const PARKOUR_STEP_SCAN = 0.02;
export const PARKOUR_CORNER_LOOK = Math.sin((20 * Math.PI) / 180);
export const PARKOUR_TURN_HOLDS = 0.999;
export const PARKOUR_PATH_STEP = 0.08;
export const PARKOUR_QUIET_STEPS = 3;
export const PARKOUR_ARM_GRACE_S = 0.05;
export const PARKOUR_VAULT_MAX = 1.2;
export const PARKOUR_VAULT_DEPTH = 0.9;
export const PARKOUR_VAULT_CLEAR = 0.08;
export const PARKOUR_VAULT_EXIT_VY = 1.0;
export const PARKOUR_VAULT_EXIT_MIN = 3.5;
export const PARKOUR_SAFE_DROP = 5;
export const PARKOUR_OVER_DROP = 1.5;
export const PARKOUR_OVER_EXIT = 0.8;
export const PARKOUR_CATCH_HOLD_MIN = PARKOUR_SAFE_DROP;
export const PARKOUR_CATCH_HOLD_MAX = 15;

export const PARKOUR_HANG_DROP = 1.8;
export const PARKOUR_HANG_GAP = PARKOUR_UP_GAP;
export const PARKOUR_HANG_LOW = 1.2;
export const PARKOUR_CATCH_S = 0.15;
export const PARKOUR_GRIP_DEPTH = PARKOUR_FACE_LEAN;
export const PARKOUR_LIP_FOLLOW = 0.15;
export const PARKOUR_FACE_FOLLOW = Math.cos((30 * Math.PI) / 180);
export const PARKOUR_HAND_SPAN = 0.25;
export const PARKOUR_GRIP_MIN_S = 6;
export const PARKOUR_GRIP_MAX_S = 30;
export const PARKOUR_GRIP_TIRED = 0.35;
export const PARKOUR_GRIP_REST = 0.5;
export const PARKOUR_GRIP_REGEN_S = 2.5;
export const PARKOUR_GRIP_LOW = 0.25;
export const PARKOUR_GRIP_LOW_TEXT = 'Your grip is failing.';
export const PARKOUR_GRIP_MIN = 0.05;
export const PARKOUR_SHIMMY_MIN = 0.6;
export const PARKOUR_SHIMMY_MAX = 1.4;
export const PARKOUR_CLIMB_MIN = 0.7;
export const PARKOUR_CLIMB_MAX = 1.3;
export const PARKOUR_START_MIN_S = 0.6;
export const PARKOUR_START_MAX_S = 0.3;
export const PARKOUR_LOAD_FREE = 0.5;
export const PARKOUR_LOAD_CUT = 0.3;
export const PARKOUR_CONTACT = 0.15;
export const PARKOUR_CONTACT_AT = Object.freeze([0.8, 0.4, 0.2]);

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export function parkourSkill({ climbing = 0, khajiit = false, enhanced = false } = {}) {
  let s = climbing + (khajiit ? KHAJIIT_CLIMBING_BONUS : 0);
  if (enhanced) s *= 2;
  return Math.min(100, Math.max(0, s));
}

export function jumpingSkill({ jumping = 0 } = {}) {
  return Math.min(100, Math.max(0, jumping));
}

export function parkourReach(skill, load = 0) {
  const cut = PARKOUR_LOAD_CUT * clamp01((load - PARKOUR_LOAD_FREE) / (1 - PARKOUR_LOAD_FREE));
  return lerp(PARKOUR_REACH_MIN, PARKOUR_REACH_MAX, clamp01(skill / 100)) - cut;
}

export function parkourCatchHold(skill) {
  return lerp(PARKOUR_CATCH_HOLD_MIN, PARKOUR_CATCH_HOLD_MAX, clamp01(skill / 100));
}

export function gripSeconds(skill, fatigue = 1) {
  return lerp(PARKOUR_GRIP_MIN_S, PARKOUR_GRIP_MAX_S, clamp01(skill / 100)) * lerp(PARKOUR_GRIP_TIRED, 1, clamp01(fatigue));
}

export function shimmySpeed(skill, live = 0) {
  return lerp(PARKOUR_SHIMMY_MIN, PARKOUR_SHIMMY_MAX, clamp01(skill / 100)) * overcapClimbSpeed(live);
}

export function freeClimbSpeed(speed, skill, spell = false, live = 0) {
  return climbingSpeed(speed, spell, live) * lerp(PARKOUR_CLIMB_MIN, PARKOUR_CLIMB_MAX, clamp01(skill / 100));
}

export function freeStartSeconds(skill) {
  return lerp(PARKOUR_START_MIN_S, PARKOUR_START_MAX_S, clamp01(skill / 100));
}

export function mantleDuration(rise, skill) {
  return (0.25 + 0.22 * Math.max(0, rise)) * (1.3 - 0.5 * clamp01(skill / 100));
}

export function vaultDuration(rise, skill) {
  return (0.22 + 0.12 * Math.max(0, rise)) * (1.2 - 0.3 * clamp01(skill / 100));
}

let _gate = null;
export function registerParkourGate(fn) { _gate = typeof fn === 'function' ? fn : null; }
export const parkourRefusal = () => _gate?.() ?? null;

export function capsuleFits(collider, p, height) {
  if (collider.restFloor && p[1] < collider.restFloor(p[0], p[2]) - PARKOUR_FIT_EPS) return false;
  if (!(collider.penetrationAt(p, height) < PARKOUR_FIT_EPS) || !bandsClear(collider, p, height)) return false;
  return !Number.isFinite(collider.raycast([p[0], p[1] + 0.05, p[2]], [0, 1, 0], height - 0.1));
}

export function bandsClear(collider, p, height) {
  if (!collider.sphereOverlaps) return true;
  const axis = Math.max(0, height - 2 * PARKOUR_BODY_RADIUS);
  const n = Math.ceil(axis / PARKOUR_FIT_BAND - 1e-9);
  for (let i = 1; i < n; i++) {
    if (collider.sphereOverlaps([p[0], p[1] + PARKOUR_BODY_RADIUS + (axis * i) / n, p[2]], PARKOUR_BODY_RADIUS - PARKOUR_BAND_SLACK)) return false;
  }
  return true;
}

function faceHit(collider, origin, dir, reach) {
  const hit = collider.raycastHit(origin, dir, reach);
  if (!Number.isFinite(hit.dist) || !hit.normal) return null;
  const [nx, ny, nz] = hit.normal;
  const l = Math.hypot(nx, nz);
  if (Math.abs(ny) > PARKOUR_FACE_MAX_NY || l < 1e-4) return null;
  if (-(nx * dir[0] + nz * dir[2]) / l < PARKOUR_FACING_DOT) return null;
  return { dist: hit.dist, normal: [nx / l, 0, nz / l], key: hit.key ?? null };
}

function scanFace(collider, feet, dir, low, high, reach) {
  let wall = null, faceDist = 0;
  for (let i = 0; ; i++) {
    const h = low + i * PARKOUR_SCAN_STEP;
    if (h > high + PARKOUR_SCAN_STEP + 1e-9) break;
    const y = feet[1] + h;
    if (!wall) {
      if (h > high + 1e-9) break;
      const f = faceHit(collider, [feet[0], y, feet[2]], dir, reach);
      if (f) { wall = { y, dist: f.dist, normal: f.normal, key: f.key }; faceDist = f.dist; }
      continue;
    }
    const d = collider.raycast([feet[0], y, feet[2]], dir, faceDist + PARKOUR_FACE_LEAN);
    if (!Number.isFinite(d)) {
      if (!faceGoesOn(collider, feet[0], y, feet[2], dir, faceDist, PARKOUR_SCAN_STEP)) return { ...wall, openY: y, faceDist };
      continue;
    }
    faceDist = d;
  }
  return wall ? { ...wall, openY: null, faceDist } : null;
}

function faceGoesOn(collider, x, y, z, dir, dist, below) {
  const meets = (yy) => {
    const d = collider.raycast([x, yy, z], dir, dist + PARKOUR_FACE_LEAN);
    return Number.isFinite(d) && Math.abs(d - dist) <= PARKOUR_FACE_LEAN;
  };
  let top = null;
  for (let h = PARKOUR_CRACK_STEP; h <= PARKOUR_CRACK + 1e-9 && top == null; h += PARKOUR_CRACK_STEP) if (meets(y + h)) top = y + h;
  if (top == null) return false;
  let foot = y - below;
  for (let h = PARKOUR_CRACK_STEP; h < below - 1e-9; h += PARKOUR_CRACK_STEP) if (meets(y - h)) { foot = y - h; break; }
  return top - foot <= PARKOUR_CRACK + 2 * PARKOUR_CRACK_STEP;
}

function scanSlab(collider, feet, dir, low, high, reach, radius) {
  const y0 = feet[1] + high + 0.05;
  for (const d of [radius + 0.1, radius + 0.25, reach]) {
    if (Number.isFinite(collider.raycast([feet[0], y0, feet[2]], dir, d + 0.02))) continue;
    const down = collider.surfaceHit([feet[0] + dir[0] * d, y0, feet[2] + dir[2] * d], [0, -1, 0], high + 0.05 - low);
    if (!Number.isFinite(down.dist) || !down.normal || down.normal[1] < PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER) continue;
    const topY = y0 - down.dist;
    const f = faceHit(collider, [feet[0], topY - PARKOUR_UNDER, feet[2]], dir, reach);
    if (!f) continue;
    if (Number.isFinite(collider.raycast([feet[0], topY + 0.05, feet[2]], dir, f.dist + PARKOUR_FACE_LEAN))) continue;
    return { y: topY - PARKOUR_UNDER, dist: f.dist, normal: f.normal, key: f.key, openY: topY + 0.05, faceDist: f.dist };
  }
  return null;
}

function topProfile(collider, face, into, lipY) {
  const onTop = (s) => {
    const oy = lipY + PARKOUR_TOP_PROBE + s;
    const h = collider.surfaceHit([face[0] + into[0] * s, oy, face[2] + into[2] * s], [0, -1, 0], PARKOUR_TOP_PROBE + s + PARKOUR_TOP_DROP);
    return Number.isFinite(h.dist);
  };
  let last = 0;
  for (let i = 0; ; i++) {
    const s = 0.05 + i * PARKOUR_TOP_STEP;
    if (s > PARKOUR_TOP_WALK + 1e-9) return { depth: null };
    if (onTop(s)) { last = s; continue; }
    let a = i === 0 ? PARKOUR_EDGE_INSET : last, b = s;
    for (let k = 0; k < 4; k++) { const mid = (a + b) / 2; if (onTop(mid)) a = mid; else b = mid; }
    return { depth: (a + b) / 2 };
  }
}

function landingAt(collider, fx, fz, into, lipY, s, radius) {
  const px = fx + into[0] * s, pz = fz + into[2] * s, floor = lipY - PARKOUR_TOP_DROP;
  let oy = lipY + PARKOUR_TOP_PROBE + s;
  for (let tries = 0; tries < 2; tries++) {
    const h = collider.surfaceHit([px, oy, pz], [0, -1, 0], oy - floor);
    if (!Number.isFinite(h.dist) || !h.normal) return null;
    const ny = h.normal[1];
    const y = oy - h.dist;
    const tan = ny > 0 ? Math.sqrt(Math.max(0, 1 - ny * ny)) / ny : Infinity;
    if (ny >= PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER && y - lipY <= s * tan + PARKOUR_SLOPE_SLACK) {
      let top = y + radius / ny - radius;
      if (h.key == null && collider.restFloor) { const rf = collider.restFloor(px, pz); if (Number.isFinite(rf)) top = Math.max(top, rf); }
      return { y: top, key: h.key ?? null };
    }
    oy = y - 0.02;
    if (oy <= floor) return null;
  }
  return null;
}

const path = (from, up, to, split, arc) => ({ from: [from[0], from[1], from[2]], up, to, split, arc });
const splitFor = (rise) => Math.min(0.75, Math.max(0.45, 0.35 + 0.2 * rise));

function pathClear(collider, m, body) {
  const len = Math.hypot(m.up[0] - m.from[0], m.up[1] - m.from[1], m.up[2] - m.from[2])
    + Math.hypot(m.to[0] - m.up[0], m.to[1] - m.up[1], m.to[2] - m.up[2]) + 2 * m.arc;
  const n = Math.max(6, Math.ceil(len / PARKOUR_PATH_STEP));
  for (let i = 1; i <= n; i++) {
    if (!capsuleFits(collider, movePoint(m, i / n), body)) return false;
  }
  return true;
}

export function senseLedge(collider, feet, dir, opts) {
  const { low, high, radius, footing = false } = opts;
  if (!collider?.raycastHit) return { ok: false, why: 'no-collider' };
  const reach = radius + PARKOUR_WALL_REACH;
  const wall = scanFace(collider, feet, dir, low, high, reach) ?? scanSlab(collider, feet, dir, low, high, reach, radius);
  if (!wall) return { ok: false, why: 'no-wall' };
  if (wall.openY == null) return { ok: false, why: 'too-high' };
  const wn = wall.normal;
  const into = [-wn[0], 0, -wn[2]];
  const ey = wall.openY + 0.02;
  const ex = feet[0] + dir[0] * wall.faceDist + into[0] * PARKOUR_EDGE_INSET;
  const ez = feet[2] + dir[2] * wall.faceDist + into[2] * PARKOUR_EDGE_INSET;
  const down = collider.surfaceHit([ex, ey, ez], [0, -1, 0], ey - (wall.y - 0.05));
  if (!Number.isFinite(down.dist)) return { ok: false, why: 'no-top' };
  const lipY = ey - down.dist;
  if (!down.normal || down.normal[1] < PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER) return { ok: false, why: 'steep-top' };
  const rise = lipY - feet[1];
  if (rise > high) return { ok: false, why: 'too-high' };
  if (rise < low - 0.05) return { ok: false, why: 'too-low' };
  const under = collider.raycastHit([feet[0], lipY - PARKOUR_UNDER, feet[2]], dir, wall.faceDist + 0.3);
  if (!Number.isFinite(under.dist)) return { ok: false, why: 'no-lip' };
  const face = [feet[0] + dir[0] * under.dist, lipY, feet[2] + dir[2] * under.dist];
  if (footing) {
    const f = collider.surfaceHit([face[0] + wn[0] * 0.1, lipY - PARKOUR_UNDER, face[2] + wn[2] * 0.1], [0, -1, 0], lipY - feet[1] + 0.5);
    if (Number.isFinite(f.dist) && lipY - PARKOUR_UNDER - f.dist - feet[1] > PARKOUR_FOOTING) return { ok: false, why: 'riser' };
  }
  const { depth } = topProfile(collider, face, into, lipY);
  const ledge = { ok: true, lipY, rise, normal: wn, into, face, depth, faceKey: wall.key, mantle: null, why: null };
  return landOn(collider, feet, ledge, opts);
}

export function senseEaveLedge(collider, feet, grip, opts) {
  const wn = grip.normal, into = [-wn[0], 0, -wn[2]], face = [grip.face[0], grip.lipY, grip.face[2]];
  const { depth } = topProfile(collider, face, into, grip.lipY);
  const ledge = { ok: true, lipY: grip.lipY, rise: grip.lipY - feet[1], normal: wn, into, face, depth, faceKey: grip.key ?? null, mantle: null, why: null };
  return landOn(collider, feet, ledge, opts);
}

function landOn(collider, feet, ledge, opts) {
  const { radius, crouch, stand, height = stand } = opts;
  const { lipY, rise, normal: wn, into, face, depth } = ledge;
  const full = radius + PARKOUR_TOP_INSET;
  let s;
  if (depth == null || depth >= full + 0.05) s = full;
  else if (depth >= PARKOUR_MIN_STAND_DEPTH) s = depth / 2;
  else { ledge.why = 'no-top'; return ledge; }
  const tangent = [-into[2], 0, into[0]];
  const bodies = height > crouch + 1e-6 ? [height, crouch] : [height];
  const split = splitFor(rise);
  let stage = 0;
  for (const body of bodies) {
    for (const n of PARKOUR_NUDGE) {
      const fx = face[0] + tangent[0] * n, fz = face[2] + tangent[2] * n;
      const land = landingAt(collider, fx, fz, into, lipY, s, radius);
      if (!land) continue;
      stage = Math.max(stage, 1);
      const top = [fx + into[0] * s, land.y + 0.02, fz + into[2] * s];
      if (!capsuleFits(collider, top, body)) continue;
      stage = 2;
      const upOff = radius + PARKOUR_UP_GAP;
      const up = [fx + wn[0] * upOff, lipY + PARKOUR_UP_GAP, fz + wn[2] * upOff];
      if (!capsuleFits(collider, up, body)) continue;
      if (!pathClear(collider, path(feet, up, top, split, PARKOUR_MANTLE_ARC), body)) continue;
      ledge.mantle = { up, top, crouch: body < height - 1e-6, split, arc: PARKOUR_MANTLE_ARC, key: land.key };
      return ledge;
    }
  }
  ledge.why = ['no-top', 'no-room', 'no-room-up'][stage];
  return ledge;
}

export function senseOver(collider, feet, ledge, opts, maxDrop) {
  if (!(ledge?.ok) || ledge.depth == null || ledge.depth > PARKOUR_VAULT_DEPTH) return null;
  const { radius, stand, height = stand } = opts;
  const { face, into, normal, lipY, depth } = ledge;
  const y = lipY + PARKOUR_VAULT_CLEAR;
  const out = depth + radius + 0.1;
  const tangent = [-into[2], 0, into[0]];
  for (const n of PARKOUR_NUDGE) {
    const fx = face[0] + tangent[0] * n, fz = face[2] + tangent[2] * n;
    const up = [fx + normal[0] * (radius + PARKOUR_UP_GAP), y, fz + normal[2] * (radius + PARKOUR_UP_GAP)];
    const over = [fx + into[0] * out, y, fz + into[2] * out];
    const below = collider.surfaceHit([over[0], y + 0.05, over[2]], [0, -1, 0], maxDrop + PARKOUR_VAULT_CLEAR + 0.05);
    if (!Number.isFinite(below.dist)) continue;
    if (!capsuleFits(collider, up, height) || !capsuleFits(collider, over, height)) continue;
    if (!pathClear(collider, path(feet, up, over, 0.4, 0.1), height)) continue;
    return { up, over, depth, floorY: y + 0.05 - below.dist, key: ledge.faceKey };
  }
  return null;
}

export function senseVault(collider, feet, ledge, opts) {
  if (!(ledge?.ok) || ledge.rise > PARKOUR_VAULT_MAX) return null;
  return senseOver(collider, feet, ledge, opts, PARKOUR_SAFE_DROP);
}

export function planMantle(feet, ledge, skill) {
  const { up, top, crouch, split, arc, key } = ledge.mantle;
  return {
    kind: 'mantle',
    from: [feet[0], feet[1], feet[2]],
    up: [...up],
    to: [...top],
    split, arc,
    dur: mantleDuration(ledge.rise, skill),
    crouch: !!crouch,
    exit: null,
    key: key ?? null,
    t: 0,
  };
}

export function planClamber(feet, ledge, over, skill) {
  return {
    kind: 'mantle',
    from: [feet[0], feet[1], feet[2]],
    up: [...over.up],
    to: [...over.over],
    split: 0.4, arc: 0.1,
    dur: mantleDuration(ledge.rise, skill) * 1.15,
    crouch: false,
    exit: [ledge.into[0] * PARKOUR_OVER_EXIT, ledge.into[2] * PARKOUR_OVER_EXIT],
    exitVy: 0,
    key: over.key ?? null,
    t: 0,
  };
}

export function planVault(feet, ledge, vault, skill, exitSpeed) {
  const s = Math.max(PARKOUR_VAULT_EXIT_MIN, exitSpeed || 0);
  return {
    kind: 'vault',
    from: [feet[0], feet[1], feet[2]],
    up: [...vault.up],
    to: [...vault.over],
    split: 0.4, arc: 0.1,
    dur: vaultDuration(ledge.rise, skill),
    crouch: false,
    exit: [ledge.into[0] * s, ledge.into[2] * s],
    exitVy: PARKOUR_VAULT_EXIT_VY,
    key: vault.key ?? null,
    t: 0,
  };
}

export function movePoint(m, t, out = [0, 0, 0]) {
  const u = clamp01(t);
  if (u <= m.split) {
    const k = smooth(m.split > 0 ? u / m.split : 1);
    out[0] = lerp(m.from[0], m.up[0], k);
    out[1] = lerp(m.from[1], m.up[1], k);
    out[2] = lerp(m.from[2], m.up[2], k);
  } else {
    const v = (u - m.split) / (1 - m.split);
    const k = smooth(v);
    out[0] = lerp(m.up[0], m.to[0], k);
    out[1] = lerp(m.up[1], m.to[1], v) + m.arc * Math.sin(Math.PI * v);
    out[2] = lerp(m.up[2], m.to[2], k);
  }
  return out;
}

export function offsetMove(m, offset) {
  for (const p of [m.from, m.up, m.to]) {
    p[0] += offset[0]; p[1] += offset[1]; p[2] += offset[2];
  }
  if (m.hang) m.hang.lipY += offset[1];
  if (m.next) offsetMove(m.next, offset);
}

export function carryMove(m, was, now) {
  const y0 = m.to[1];
  for (const p of [m.from, m.up, m.to]) carryPoint(p, was, now);
  if (m.hang) carryLip(m.hang, m.to[1] - y0, was, now);
  if (m.next) carryMove(m.next, was, now);
}

function carryLip(hold, rise, was, now) {
  const n = carryPoint([hold.normal[0], 0, hold.normal[2]], was, now, true);
  const l = Math.hypot(n[0], n[2]) || 1;
  hold.normal = [n[0] / l, 0, n[2] / l];
  if (hold.lipY != null) hold.lipY += rise;
}

function carryPoint(p, was, now, turn = false) {
  const wr = was.r, nr = now.r;
  const x = p[0] - (turn ? 0 : was.t[0]), y = p[1] - (turn ? 0 : was.t[1]), z = p[2] - (turn ? 0 : was.t[2]);
  const lx = wr ? wr[0] * x + wr[1] * y + wr[2] * z : x;
  const ly = wr ? wr[3] * x + wr[4] * y + wr[5] * z : y;
  const lz = wr ? wr[6] * x + wr[7] * y + wr[8] * z : z;
  p[0] = (nr ? nr[0] * lx + nr[3] * ly + nr[6] * lz : lx) + (turn ? 0 : now.t[0]);
  p[1] = (nr ? nr[1] * lx + nr[4] * ly + nr[7] * lz : ly) + (turn ? 0 : now.t[1]);
  p[2] = (nr ? nr[2] * lx + nr[5] * ly + nr[8] * lz : lz) + (turn ? 0 : now.t[2]);
  return p;
}

export const PARKOUR_GRIP_RUNG = 0.05;
export const PARKOUR_RAY_SCATTER = 0.001;
export const PARKOUR_WALL_MAX_NY = PARKOUR_TOP_MIN_NY;

export function senseGrip(collider, face, normal, lipY, opts, fit = true, eave = true) {
  if (!collider?.raycastHit || !Number.isFinite(lipY)) return null;
  const seen = new Map();
  const g = plainGrip(collider, face, normal, lipY, opts, fit, seen);
  if (g || !eave) return g;
  const back = opts.radius + PARKOUR_HANG_GAP;
  const dir = [-normal[0], 0, -normal[2]], ox = face[0] + normal[0] * back, oz = face[2] + normal[2] * back;
  for (const [i, d] of seen) {
    if (Math.abs(d - back) <= PARKOUR_EDGE_INSET) continue;
    if (!Number.isFinite(d) && faceGoesOn(collider, ox, lipY + PARKOUR_LIP_FOLLOW - i * PARKOUR_GRIP_RUNG, oz, dir, back, PARKOUR_GRIP_RUNG)) continue;
    return senseEave(collider, face, normal, lipY, opts, fit);
  }
  return null;
}

function plainGrip(collider, face, normal, lipY, opts, fit, seen) {
  const { radius, stand } = opts;
  const dir = [-normal[0], 0, -normal[2]];
  const back = radius + PARKOUR_HANG_GAP;
  const ox = face[0] + normal[0] * back, oz = face[2] + normal[2] * back;
  const far = back + PARKOUR_LIP_FOLLOW + PARKOUR_GRIP_DEPTH + 0.05;
  const rungs = Math.round((2 * PARKOUR_LIP_FOLLOW) / PARKOUR_GRIP_RUNG);
  const rungY = (i) => lipY + PARKOUR_LIP_FOLLOW - i * PARKOUR_GRIP_RUNG;
  const at = (i) => {
    if (!seen.has(i)) { const d = collider.raycast([ox, rungY(i), oz], dir, far); seen.set(i, Number.isFinite(d) ? d : Infinity); }
    return seen.get(i);
  };
  let hiY = null, loY = null;
  for (let i = 1; i <= rungs && hiY == null; i++) {
    const dist = at(i);
    if (Math.abs(dist - back) > PARKOUR_LIP_FOLLOW || at(i - 1) - dist <= PARKOUR_RAY_SCATTER) continue;
    if (dist - at(i + 1) > PARKOUR_EDGE_INSET) continue;
    if (!Number.isFinite(at(i - 1)) && faceGoesOn(collider, ox, rungY(i - 1), oz, dir, dist, PARKOUR_GRIP_RUNG)) continue;
    let deep = at(i - 1);
    for (let j = i - 2; j >= i - 3 && deep - dist < PARKOUR_GRIP_DEPTH; j--) {
      if (at(j) - deep < PARKOUR_GRIP_RUNG * PARKOUR_TOP_RUN - PARKOUR_RAY_SCATTER) break;
      deep = at(j);
    }
    if (deep - dist >= PARKOUR_GRIP_DEPTH) { hiY = rungY(i - 1); loY = rungY(i); }
  }
  if (hiY == null) return null;
  const d0 = collider.raycast([ox, loY, oz], dir, far);
  const ex = ox + dir[0] * (d0 + PARKOUR_EDGE_INSET), ez = oz + dir[2] * (d0 + PARKOUR_EDGE_INSET);
  const top = collider.surfaceHit([ex, hiY + 0.01, ez], [0, -1, 0], hiY - loY + 0.06);
  if (!Number.isFinite(top.dist) || !top.normal || top.normal[1] < PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER) return null;
  const y = hiY + 0.01 - top.dist;
  if (Math.abs(y - lipY) > PARKOUR_LIP_FOLLOW + 0.01) return null;
  const under = faceHit(collider, [ox, y - PARKOUR_UNDER, oz], dir, far)
    ?? faceHit(collider, [ox, Math.min(y - PARKOUR_UNDER, loY - PARKOUR_GRIP_RUNG), oz], dir, far);
  if (!under || under.normal[0] * normal[0] + under.normal[2] * normal[2] < PARKOUR_FACE_FOLLOW - PARKOUR_RAY_SCATTER) return null;
  const n = under.normal;
  const fx = ox + dir[0] * under.dist, fz = oz + dir[2] * under.dist;
  const feet = [fx + n[0] * back, y - PARKOUR_HANG_DROP, fz + n[2] * back];
  if (fit && !capsuleFits(collider, feet, stand)) return null;
  return { lipY: y, normal: n, face: [fx, y, fz], feet, key: top.key ?? under.key ?? null };
}

export const PARKOUR_EAVE_OUT = 0.8;
export const PARKOUR_EAVE_STEP = 0.1;
export const PARKOUR_EAVE_BISECT = 5;
export const PARKOUR_EAVE_IN = 0.2;
const DOWN = Object.freeze([0, -1, 0]);

function senseEave(collider, face, normal, lipY, opts, fit) {
  const { radius, stand } = opts;
  const n = normal, back = radius + PARKOUR_HANG_GAP;
  const y0 = lipY + PARKOUR_LIP_FOLLOW + 0.3, len = 2 * PARKOUR_LIP_FOLLOW + 0.3;
  const down = (s) => {
    const h = collider.raycastHit([face[0] + n[0] * s, y0, face[2] + n[2] * s], DOWN, len);
    return Number.isFinite(h.dist) && h.normal ? h : null;
  };
  const isTop = (h) => !!h && h.normal[1] >= PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER;
  let a = PARKOUR_EAVE_OUT + PARKOUR_EAVE_STEP, b = null;
  if (down(a)) return null;
  for (let s = PARKOUR_EAVE_OUT; s >= -PARKOUR_EAVE_IN - 1e-9; s -= PARKOUR_EAVE_STEP) {
    const h = down(s);
    if (!h) { a = s; continue; }
    if (!isTop(h)) return null;
    b = s;
    break;
  }
  if (b == null) return null;
  for (let k = 0; k < PARKOUR_EAVE_BISECT; k++) { const m = (a + b) / 2; if (down(m)) b = m; else a = m; }
  const ex = face[0] + n[0] * b, ez = face[2] + n[2] * b;
  const atEdge = down(b - 0.005), inset = down(b - PARKOUR_EDGE_INSET), deep = down(b - PARKOUR_GRIP_DEPTH);
  if (!isTop(atEdge) || !isTop(inset) || !isTop(deep)) return null;
  const edgeY = y0 - atEdge.dist, y = y0 - inset.dist;
  if (Math.abs(y - lipY) > PARKOUR_LIP_FOLLOW + 0.01 || y0 - deep.dist < y - PARKOUR_TOP_DROP) return null;
  const q = [ex + n[0] * back, Math.min(edgeY, y) - PARKOUR_UNDER, ez + n[2] * back];
  const under = collider.raycastHit(q, [-n[0], 0, -n[2]], back + PARKOUR_GRIP_DEPTH);
  if (Number.isFinite(under.dist)) {
    return plainGrip(collider, [q[0] - n[0] * under.dist, 0, q[2] - n[2] * under.dist], n, lipY, opts, fit, new Map());
  }
  const tn = inset.normal, tl = Math.hypot(tn[0], tn[2]);
  let nn = n;
  if (tl > 0.1 && (tn[0] * n[0] + tn[2] * n[2]) / tl >= PARKOUR_FACE_FOLLOW) nn = [tn[0] / tl, 0, tn[2] / tl];
  const feet = [ex + nn[0] * back, y - PARKOUR_HANG_DROP, ez + nn[2] * back];
  const hangs = !fit || capsuleFits(collider, feet, stand);
  return hangs ? { lipY: y, normal: nn, face: [ex, y, ez], feet, key: inset.key ?? null, eave: true } : null;
}

export function senseEaveAhead(collider, feet, dir, opts) {
  if (!collider?.raycastHit) return null;
  const { low, high, radius } = opts;
  const n = [-dir[0], 0, -dir[2]], y0 = feet[1] + high + 0.05;
  for (const d of [radius + 0.1, radius + 0.25, radius + PARKOUR_WALL_REACH]) {
    if (Number.isFinite(collider.raycast([feet[0], y0, feet[2]], dir, d + 0.02))) return null;
    const px = feet[0] + dir[0] * d, pz = feet[2] + dir[2] * d;
    const h = collider.raycastHit([px, y0, pz], DOWN, high + 0.05 - low);
    if (!Number.isFinite(h.dist) || !h.normal || h.normal[1] < PARKOUR_TOP_MIN_NY - PARKOUR_RAY_SCATTER) continue;
    for (let k = 0; k < 4; k++) {
      const g = senseGrip(collider, [px, 0, pz], n, y0 - h.dist - k * 2 * PARKOUR_LIP_FOLLOW, opts);
      if (g) return g.eave && g.lipY - feet[1] >= low - 0.05 ? g : null;
    }
  }
  return null;
}

export function catchClear(collider, feet, grip, height) {
  return pathClear(collider, path(feet, grip.feet, grip.feet, 1, 0), height);
}

export function planCatch(feet, grip) {
  return {
    kind: 'catch',
    from: [feet[0], feet[1], feet[2]],
    up: [...grip.feet],
    to: [...grip.feet],
    split: 1, arc: 0,
    dur: PARKOUR_CATCH_S,
    crouch: false,
    exit: null,
    hang: { normal: [...grip.normal], lipY: grip.lipY },
    key: grip.key ?? null,
    t: 0,
  };
}

export const PARKOUR_CORNER_PROBE = 0.1;
export const PARKOUR_CORNER_OFF = 0.1;
export const PARKOUR_CORNER_IN = 0.25;
export const PARKOUR_CORNER_CLEAR = 0.1;

export function moveClear(collider, m, height) {
  return pathClear(collider, m, height);
}

export function planCorner(from, mid, grip, skill, live = 0) {
  const len = Math.hypot(mid[0] - from[0], mid[1] - from[1], mid[2] - from[2])
    + Math.hypot(grip.feet[0] - mid[0], grip.feet[1] - mid[1], grip.feet[2] - mid[2]);
  return {
    kind: 'corner',
    from: [from[0], from[1], from[2]],
    up: [...mid],
    to: [...grip.feet],
    split: 0.5, arc: 0,
    dur: Math.max(0.2, len / shimmySpeed(skill, live)),
    crouch: false,
    exit: null,
    hang: { normal: [...grip.normal], lipY: grip.lipY },
    bill: false,
    key: grip.key ?? null,
    t: 0,
  };
}

export function wallContact(collider, feet, dir, height, radius, reach = PARKOUR_CONTACT) {
  if (!collider?.raycastHit) return null;
  let best = null;
  for (const k of PARKOUR_CONTACT_AT) {
    const h = collider.raycastHit([feet[0], feet[1] + height * k, feet[2]], dir, radius + reach);
    if (!Number.isFinite(h.dist) || !h.normal || Math.abs(h.normal[1]) > PARKOUR_WALL_MAX_NY) continue;
    const l = Math.hypot(h.normal[0], h.normal[2]);
    if (!best || h.dist < best.dist) best = { dist: h.dist, normal: [h.normal[0] / l, 0, h.normal[2] / l], key: h.key ?? null };
  }
  return best;
}

export function carryHold(pos, hold, was, now) {
  const y0 = pos[1];
  carryPoint(pos, was, now);
  carryLip(hold, pos[1] - y0, was, now);
}

export const PARKOUR_EDGE_DROP = 1.0;
export const PARKOUR_EDGE_AHEAD = 0.1;
export const PARKOUR_EDGE_BISECT = 6;
export const PARKOUR_EDGE_FACE_DROP = 0.1;
export const PARKOUR_EDGE_FACE_OUT = 0.6;
export const PARKOUR_LOWER_MIN_S = 1.0;
export const PARKOUR_LOWER_MAX_S = 0.6;
export const PARKOUR_LOWER_SPLIT = 0.4;

export function lowerDuration(skill) {
  return lerp(PARKOUR_LOWER_MIN_S, PARKOUR_LOWER_MAX_S, clamp01(skill / 100));
}

export const PARKOUR_EDGE_FLOOR_NY = Math.cos((70 * Math.PI) / 180);

function floorAt(collider, x, top, z, reach) {
  const h = collider.surfaceHit([x, top, z], [0, -1, 0], reach);
  return Number.isFinite(h.dist) && h.normal && h.normal[1] >= PARKOUR_EDGE_FLOOR_NY ? top - h.dist : null;
}

function faceUnder(collider, edge, out, lipY) {
  const o = [edge[0] + out[0] * PARKOUR_EDGE_FACE_OUT, lipY - PARKOUR_EDGE_FACE_DROP, edge[2] + out[2] * PARKOUR_EDGE_FACE_OUT];
  const h = faceHit(collider, o, [-out[0], 0, -out[2]], PARKOUR_EDGE_FACE_OUT + PARKOUR_WALL_REACH);
  if (!h || h.normal[0] * out[0] + h.normal[2] * out[2] < PARKOUR_FACING_DOT) return null;
  return { point: [o[0] - out[0] * h.dist, lipY, o[2] - out[2] * h.dist], normal: h.normal };
}

export function senseEdge(collider, feet, dir, opts) {
  if (!collider?.surfaceHit || !collider.raycastHit) return null;
  const { radius, stand } = opts;
  const top = feet[1] + PARKOUR_TOP_PROBE, reach = PARKOUR_TOP_PROBE + PARKOUR_EDGE_DROP;
  const ahead = radius + PARKOUR_EDGE_AHEAD;
  if (floorAt(collider, feet[0] + dir[0] * ahead, top, feet[2] + dir[2] * ahead, reach) != null) return null;
  let lo = 0, hi = ahead, lipY = floorAt(collider, feet[0], top, feet[2], reach);
  if (lipY == null) return null;
  for (let i = 0; i < PARKOUR_EDGE_BISECT; i++) {
    const mid = (lo + hi) / 2;
    const y = floorAt(collider, feet[0] + dir[0] * mid, top, feet[2] + dir[2] * mid, reach);
    if (y == null) hi = mid; else { lo = mid; lipY = y; }
  }
  const edge = [feet[0] + dir[0] * lo, lipY, feet[2] + dir[2] * lo];
  const face = faceUnder(collider, edge, dir, lipY);
  const grip = face ? senseGrip(collider, face.point, face.normal, lipY, opts) : senseGrip(collider, edge, dir, lipY, opts);
  if (!face && !grip?.eave) return null;
  if (!grip) return null;
  const m = planLower(feet, grip, 0);
  return pathClear(collider, m, stand) ? { grip, lipY: grip.lipY } : null;
}

export function planLower(feet, grip, skill) {
  const n = grip.normal, off = PARKOUR_BODY_RADIUS + PARKOUR_UP_GAP;
  return {
    kind: 'lower',
    from: [feet[0], feet[1], feet[2]],
    up: [grip.face[0] + n[0] * off, Math.max(feet[1], grip.lipY) + PARKOUR_UP_GAP, grip.face[2] + n[2] * off],
    to: [...grip.feet],
    split: PARKOUR_LOWER_SPLIT, arc: 0,
    dur: lowerDuration(skill),
    crouch: false,
    stand: true,
    exit: null,
    hang: { normal: [...grip.normal], lipY: grip.lipY },
    key: grip.key ?? null,
    t: 0,
  };
}

export function senseOverHang(collider, feet, ledge, opts) {
  if (!(ledge?.ok) || ledge.depth == null || ledge.depth > PARKOUR_VAULT_DEPTH) return null;
  const { radius, stand } = opts;
  const { face, into, normal, lipY, depth } = ledge;
  const y = lipY + PARKOUR_VAULT_CLEAR;
  const tangent = [-into[2], 0, into[0]];
  for (const n of PARKOUR_NUDGE) {
    const fx = face[0] + tangent[0] * n, fz = face[2] + tangent[2] * n;
    const far = faceUnder(collider, [fx + into[0] * depth, lipY, fz + into[2] * depth], into, lipY);
    if (!far) continue;
    const grip = senseGrip(collider, far.point, far.normal, lipY, opts);
    if (!grip) continue;
    const off = radius + PARKOUR_UP_GAP;
    const up = [fx + normal[0] * off, y, fz + normal[2] * off];
    const over = [grip.face[0] + grip.normal[0] * off, y, grip.face[2] + grip.normal[2] * off];
    if (!capsuleFits(collider, up, stand) || !capsuleFits(collider, over, stand)) continue;
    if (!pathClear(collider, path(feet, up, over, 0.4, 0.1), stand)) continue;
    if (!pathClear(collider, path(over, over, grip.feet, 0, 0), stand)) continue;
    return { up, over, grip };
  }
  return null;
}

export function planOverHang(feet, ledge, oh, skill) {
  const down = {
    kind: 'lower',
    from: [...oh.over],
    up: [...oh.over],
    to: [...oh.grip.feet],
    split: 0, arc: 0,
    dur: lowerDuration(skill) * (1 - PARKOUR_LOWER_SPLIT),
    crouch: false,
    stand: true,
    exit: null,
    hang: { normal: [...oh.grip.normal], lipY: oh.grip.lipY },
    key: oh.grip.key ?? null,
    t: 0,
  };
  return {
    kind: 'mantle',
    from: [feet[0], feet[1], feet[2]],
    up: [...oh.up],
    to: [...oh.over],
    split: 0.4, arc: 0.1,
    dur: mantleDuration(ledge.rise, skill) * 1.15,
    crouch: false,
    exit: null,
    key: ledge.faceKey ?? null,
    next: down,
    t: 0,
  };
}

export const PARKOUR_LEAP_SIDE_MIN = 1.5;
export const PARKOUR_LEAP_SIDE_MAX = 2.5;
export const PARKOUR_LEAP_UP_MIN = 1.0;
export const PARKOUR_LEAP_UP_MAX = 1.8;
export const PARKOUR_LEAP_SCAN = 0.1;
export const PARKOUR_LEAP_HEIGHTS = Object.freeze([0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]);
export const PARKOUR_LEAP_SPEED_MIN = 4;
export const PARKOUR_LEAP_SPEED_MAX = 6;
export const PARKOUR_LEAP_ARC = 0.25;
export const PARKOUR_LEAP_GRIP = 0.1;
export const PARKOUR_EJECT_OUT_MIN = 3.5;
export const PARKOUR_EJECT_OUT_MAX = 5.5;
export const PARKOUR_EJECT_UP_MIN = 3.0;
export const PARKOUR_EJECT_UP_MAX = 4.5;
export const PARKOUR_RUNLEAP_DIST_MIN = 4.0;
export const PARKOUR_RUNLEAP_DIST_MAX = 7.0;
export const PARKOUR_RUNLEAP_APEX_MIN = 0.45;
export const PARKOUR_RUNLEAP_APEX_MAX = 0.8;
export const PARKOUR_RUNLEAP_EDGE = 1.2;
export const PARKOUR_COYOTE_S = 0.15;
export const PARKOUR_RUN_SHARE = 0.75;
export const PARKOUR_LEAP_REACH = 0.25;
export const PARKOUR_WALLRUN_REACH = 1.0;
export const PARKOUR_WALLRUN_MIN = 1.0;
export const PARKOUR_WALLRUN_MAX = 2.0;
export const PARKOUR_WALLRUN_SPEED = 5;

export function leapSideReach(jumping) { return lerp(PARKOUR_LEAP_SIDE_MIN, PARKOUR_LEAP_SIDE_MAX, clamp01(jumping / 100)); }
export function leapUpReach(jumping) { return lerp(PARKOUR_LEAP_UP_MIN, PARKOUR_LEAP_UP_MAX, clamp01(jumping / 100)); }
export function leapSpeed(jumping) { return lerp(PARKOUR_LEAP_SPEED_MIN, PARKOUR_LEAP_SPEED_MAX, clamp01(jumping / 100)); }
export function ejectLaunch(jumping) {
  const t = clamp01(jumping / 100);
  return { out: lerp(PARKOUR_EJECT_OUT_MIN, PARKOUR_EJECT_OUT_MAX, t), up: lerp(PARKOUR_EJECT_UP_MIN, PARKOUR_EJECT_UP_MAX, t) };
}
export function runLeapLaunch(jumping, gravity) {
  const t = clamp01(jumping / 100);
  const apex = lerp(PARKOUR_RUNLEAP_APEX_MIN, PARKOUR_RUNLEAP_APEX_MAX, t), dist = lerp(PARKOUR_RUNLEAP_DIST_MIN, PARKOUR_RUNLEAP_DIST_MAX, t);
  const up = Math.sqrt(2 * gravity * apex);
  return { along: dist / ((2 * up) / gravity), up };
}
export function wallRunHeight(climbing, jumping) {
  return lerp(PARKOUR_WALLRUN_MIN, PARKOUR_WALLRUN_MAX, clamp01((clamp01(climbing / 100) + clamp01(jumping / 100)) / 2));
}

export function senseLeapHold(collider, feet, held, way, reach, opts, side = 0) {
  if (!collider?.raycastHit || !held) return null;
  const { stand, radius } = opts;
  const n = held.normal, t = [-n[2] * side, 0, n[0] * side], back = radius + PARKOUR_HANG_GAP;
  const faceNear = (face, lipY) => {
    const ox = face[0] + n[0] * back, oz = face[2] + n[2] * back;
    let best = null;
    for (let y = lipY - PARKOUR_LIP_FOLLOW - PARKOUR_GRIP_RUNG; y <= lipY + PARKOUR_LIP_FOLLOW + 1e-9; y += PARKOUR_GRIP_RUNG) {
      const h = faceHit(collider, [ox, y, oz], [-n[0], 0, -n[2]], back + PARKOUR_WALL_REACH);
      if (h && (!best || h.dist < best)) best = h.dist;
    }
    return best == null ? face : [ox - n[0] * best, lipY, oz - n[2] * best];
  };
  const tryGrip = (face, lipY, arc) => {
    const g = senseGrip(collider, faceNear(face, lipY), n, lipY, opts);
    if (!g || Math.abs(g.lipY - held.lipY) < 1e-3 && Math.hypot(g.feet[0] - feet[0], g.feet[2] - feet[2]) < 0.05) return null;
    const out = Math.max(feet[0] * n[0] + feet[2] * n[2], g.feet[0] * n[0] + g.feet[2] * n[2]);
    const mid = way === 'up'
      ? [g.feet[0], feet[1] + 0.25 * (g.feet[1] - feet[1]), g.feet[2]]
      : [(feet[0] + g.feet[0]) / 2, Math.max(feet[1], g.feet[1]) + arc, (feet[2] + g.feet[2]) / 2];
    const shift = out - (mid[0] * n[0] + mid[2] * n[2]);
    mid[0] += n[0] * shift; mid[2] += n[2] * shift;
    return pathClear(collider, path(feet, mid, g.feet, way === 'up' ? 0.3 : 0.5, 0), stand) ? { ...g, up: mid, split: way === 'up' ? 0.3 : 0.5 } : null;
  };
  if (way === 'up') {
    for (let d = 2 * PARKOUR_LIP_FOLLOW; d - PARKOUR_LIP_FOLLOW <= reach + 1e-9; d += 2 * PARKOUR_LIP_FOLLOW) {
      const g = tryGrip(held.face, held.lipY + d, 0);
      if (g && g.lipY > held.lipY + PARKOUR_LIP_FOLLOW && g.lipY - held.lipY <= reach + 1e-9) return g;
    }
    return null;
  }
  let runs = 0;
  const run = [];
  for (let at = { face: held.face, normal: n, lipY: held.lipY }; runs + PARKOUR_HAND_SPAN <= reach;) {
    const tt = [-at.normal[2] * side, 0, at.normal[0] * side];
    const g = senseGrip(collider, [at.face[0] + tt[0] * PARKOUR_HAND_SPAN, at.lipY, at.face[2] + tt[2] * PARKOUR_HAND_SPAN], at.normal, at.lipY, opts, false);
    if (!g || g.normal[0] * at.normal[0] + g.normal[2] * at.normal[2] < PARKOUR_FACE_FOLLOW - PARKOUR_RAY_SCATTER) break;
    run.push(g);
    at = { face: g.face, normal: g.normal, lipY: g.lipY };
    runs += PARKOUR_HAND_SPAN;
  }
  const onRun = (g) => run.some((r) => Math.hypot(r.face[0] - g.face[0], r.face[2] - g.face[2]) < PARKOUR_HAND_SPAN && Math.abs(r.lipY - g.lipY) < PARKOUR_LIP_FOLLOW);
  for (let s = 2 * PARKOUR_HAND_SPAN; s <= reach + 1e-9; s += PARKOUR_LEAP_SCAN) {
    const face = [held.face[0] + t[0] * s, held.lipY, held.face[2] + t[2] * s];
    for (const dy of PARKOUR_LEAP_HEIGHTS) {
      if (Math.abs(dy) > reach - s + 0.3) continue;
      if (Math.abs(dy) < PARKOUR_LIP_FOLLOW && s <= runs + PARKOUR_HAND_SPAN) continue;
      const g = tryGrip(face, held.lipY + dy, PARKOUR_LEAP_ARC);
      if (g && !(Math.abs(g.lipY - held.lipY) < PARKOUR_LIP_FOLLOW && s <= runs + PARKOUR_HAND_SPAN) && !onRun(g)) return g;
    }
  }
  return null;
}

export function planLeap(feet, g, jumping) {
  const len = Math.hypot(g.up[0] - feet[0], g.up[1] - feet[1], g.up[2] - feet[2]) + Math.hypot(g.feet[0] - g.up[0], g.feet[1] - g.up[1], g.feet[2] - g.up[2]);
  return {
    kind: 'leap',
    from: [feet[0], feet[1], feet[2]],
    up: [...g.up],
    to: [...g.feet],
    split: g.split ?? 0.5, arc: 0,
    dur: 0.15 + len / leapSpeed(jumping),
    crouch: false,
    exit: null,
    hang: { normal: [...g.normal], lipY: g.lipY },
    key: g.key ?? null,
    t: 0,
  };
}

export function senseWallRun(collider, feet, dir, height, reach, opts) {
  if (!collider?.raycastHit) return null;
  const { radius, stand } = opts;
  const hit = faceHit(collider, [feet[0], feet[1] + stand * 0.5, feet[2]], dir, radius + PARKOUR_WALLRUN_REACH);
  if (!hit) return null;
  const n = hit.normal, back = radius + PARKOUR_HANG_GAP;
  const fx = feet[0] + dir[0] * hit.dist, fz = feet[2] + dir[2] * hit.dist;
  const up = [fx + n[0] * back, feet[1] + 0.1, fz + n[2] * back];
  let lipTop = null;
  for (let y = feet[1] + stand * 0.5; y <= feet[1] + height + reach + 1e-9; y += PARKOUR_SCAN_STEP) {
    if (!Number.isFinite(collider.raycast([up[0], y, up[2]], [-n[0], 0, -n[2]], back + PARKOUR_FACE_LEAN + 0.05))) { lipTop = y; break; }
  }
  let grip = null, top = feet[1] + height;
  if (lipTop != null) {
    grip = senseGrip(collider, [fx, lipTop, fz], n, lipTop - PARKOUR_SCAN_STEP / 2, opts);
    if (!grip) return null;
    top = grip.feet[1];
  }
  const to = grip ? [...grip.feet] : [up[0], top, up[2]];
  if (to[1] <= feet[1] + 0.2) return null;
  return pathClear(collider, path(feet, up, to, 0.25, 0), stand) ? { up, to, grip, normal: n, key: hit.key ?? null } : null;
}

export function planWallRun(feet, run) {
  const len = Math.hypot(run.up[0] - feet[0], run.up[2] - feet[2]) + (run.to[1] - run.up[1]);
  return {
    kind: 'wallrun',
    from: [feet[0], feet[1], feet[2]],
    up: [...run.up],
    to: [...run.to],
    split: 0.25, arc: 0,
    dur: 0.1 + len / PARKOUR_WALLRUN_SPEED,
    crouch: false,
    exit: null,
    hang: run.grip ? { normal: [...run.grip.normal], lipY: run.grip.lipY } : null,
    wall: run.grip ? null : { normal: [...run.normal] },
    key: run.grip?.key ?? run.key ?? null,
    t: 0,
  };
}

export function senseDrop(collider, feet, dir, radius, ahead) {
  if (!collider?.surfaceHit) return false;
  const reach = PARKOUR_TOP_PROBE + PARKOUR_EDGE_DROP;
  let prev = feet[1];
  for (let s = radius; s <= radius + ahead + 1e-9; s += PARKOUR_LEAP_SCAN) {
    const y = floorAt(collider, feet[0] + dir[0] * s, prev + PARKOUR_TOP_PROBE, feet[2] + dir[2] * s, reach);
    if (y == null) return true;
    prev = y;
  }
  return false;
}
