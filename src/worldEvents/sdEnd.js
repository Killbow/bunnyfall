// @ts-check

import { SD_RETURN_SIZE, SD_RIFT_REACH_M, SD_RETURN_REACH_M, SD_END_TEXT, inSdPortal, SD_RIFT_OPEN_LOOK } from '../world/sdDungeon.js';
import { startRiftBell, tollRiftBell, RIFT_BELL_SECONDS } from './sdRiftSound.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../player/activate.js';
import { buildRiftStatic, buildRiftGear, buildHourRing, buildRiftStuds, irisModel, irisPositions, buildRiftShard, buildReturnModel, buildReturnHand, buildReturnParts, buildReturnPlate, returnSpringAt, SD_RETURN_PARTS, returnDialAt, riftCentreY, SD_RIFT_PARTS, SD_RIFT_STUDS, SD_RETURN_ARCH } from '../world/sdRiftModel.js';
import { sdRiftArt, SD_RIFT_RECORD, SD_RIFT_PLATE_RECORD } from '../world/sdRiftArt.js';
import { SD_REALM_ARCHIVE, SD_REALM_BRASS_RECORD, SD_REALM_COBBLE_RECORD, SD_REALM_EDGE_RECORD } from '../world/sdRealm.js';
import { realmArt } from '../world/sdRealmArt.js';
import { hallGlowArt, SD_GLOW_COLORS, SD_HALL_GLOW_RECORD } from '../world/sdHallArt.js';
import { SD_TICK_EASE_S, SD_LIGHT } from '../world/sdLook.js';
import { multiply } from '../world/mat4.js';

export const SD_HOME_TEXT = Object.freeze({
  title: 'The Way Home',
  to: 'To the Abyss Dungeon\'s door',
  taken: 'The way home carries you out of the Hour, to the Abyss Dungeon\'s door.',
  rises: 'The way home stands open.',
});
// Matches `PORTAL_RISE_MS` in `world/gateArena.js`.
export const SD_HOME_RISE_MS = 1500;
export const SD_HOME_SAY_MS = SD_HOME_RISE_MS + 1000;
export const SD_HOME_SCALE = 1.5;
export const SD_HOME_ASSEMBLY = Object.freeze({ jambs: Object.freeze([0, 0.45]), arches: Object.freeze([0.3, 0.75]), key: Object.freeze([0.65, 0.95]), swing: 1.2, drop: 1.2 });
export const SD_RIFT_KEY = 'sdrift:0';
export const SD_RETURN_KEY = 'sdreturn:0';
// A frame gap over `SD_STEP_GAP_MS` or a move over `SD_STEP_JUMP_M` (a teleport, door, or stalled host) resets the
// walk-in latch, so arriving inside a portal never counts as stepping in.
export const SD_STEP_GAP_MS = 2000;
export const SD_STEP_JUMP_M = 1.5;
export const SD_BELL_ASK_MS = 1000;
export const SD_IRIS_EASE_S = 0.6;
export const SD_RATCHET_S = 0.25;
export const SD_RATCHET_OVER = 0.08;
export const SD_EXHALE_MS = 1200;
export const SD_TOLL_SWELL = 0.15;
export const SD_TOLL_FADE_S = 1.2;
export const SD_REFUSE_S = 1;
export const SD_RIPPLE_S = 1.5;
export const SD_REVEAL_ASK_MS = 250;
export const SD_REVEAL_M = 30;
export const SD_REVEAL_S = 0.6;
export const SD_RIFT_LIGHT = Object.freeze({ ahead: 0.55, reach: 3, maxReach: 21, gain: 0.8, ret: 0.6, retReach: 4.5, column: 1.4 });

const N_GEAR = 0, N_RING = 1, N_IRIS_T = 2, N_TOLL = 3, N_IRIS = 4, N_CY = 5, N_A = 6, N_B = 7, N_R = 8;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NONE = Object.freeze([]);
const LIT_KEY = `${SD_REALM_ARCHIVE}_${SD_RIFT_RECORD.lit}`;
const PLATE_LIT = new Map([[LIT_KEY, `${SD_REALM_ARCHIVE}_${SD_RIFT_PLATE_RECORD}`]]);
export const SD_PLATE_HOLD_MS = 150;
const REMAP = Object.freeze({
  cold: new Map([[LIT_KEY, `${SD_REALM_ARCHIVE}_${SD_RIFT_RECORD.cold}`]]),
  red: new Map([[LIT_KEY, `${SD_REALM_ARCHIVE}_${SD_RIFT_RECORD.red}`]]),
});

const _uploaded = new WeakSet();
export function ensureSdEndArt(renderer) {
  if (!renderer || _uploaded.has(renderer) || typeof renderer.uploadTexture !== 'function') return;
  _uploaded.add(renderer);
  const realm = new Map(realmArt());
  /** @type {Array<[number, any]>} */
  const worn = [[SD_REALM_BRASS_RECORD, realm.get(SD_REALM_BRASS_RECORD)], [SD_REALM_COBBLE_RECORD, realm.get(SD_REALM_COBBLE_RECORD)], [SD_REALM_EDGE_RECORD, realm.get(SD_REALM_EDGE_RECORD)], [SD_HALL_GLOW_RECORD.fray, hallGlowArt(SD_GLOW_COLORS.fray)]];
  for (const [rec, art] of [...sdRiftArt(), ...worn]) {
    renderer.uploadTexture(SD_REALM_ARCHIVE, rec, art.albedo);
    renderer.uploadEmissionTexture?.(SD_REALM_ARCHIVE, rec, art.emission, { white: true });
  }
}

export function sdProbeOf(collider) {
  return {
    floor: (at) => { const d = collider.raycast([at[0], at[1] + 1, at[2]], [0, -1, 0], 3); return Number.isFinite(d) ? at[1] + 1 - d : null; },
    ray: (o, dir, max) => { const d = collider.raycast(o, dir, max); return Number.isFinite(d) ? d : null; },
  };
}

const boxOf = (at, half, height) => ({ min: [at[0] - half, at[1], at[2] - half], max: [at[0] + half, at[1] + height, at[2] + half] });
export const SD_RIFT_PRESS_M = 0.35;
function riftPress(r, key = SD_RIFT_KEY, yields = false) {
  const R = r.size / 2, top = r.cy + R, D = SD_RIFT_PRESS_M, b = r.base;
  const hx = Math.abs(b[0]) * R + Math.abs(b[8]) * D, hz = Math.abs(b[2]) * R + Math.abs(b[10]) * D;
  return {
    key, aabb: { min: [r.at[0] - hx, r.at[1], r.at[2] - hz], max: [r.at[0] + hx, r.at[1] + top, r.at[2] + hz] },
    obb: { m: Float64Array.from(b), box: [-R, 0, -D, R, top, D] }, noSurface: true, distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE,
    ...(yields ? { yields: true } : {}),
  };
}

const _t = new Float32Array(16), _r = new Float32Array(16);
function setT(m, x, y, z) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; m[12] = x; m[13] = y; m[14] = z; return m; }
function setRy(m, a) { m.fill(0); const c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[5] = 1; m[8] = s; m[10] = c; m[15] = 1; return m; }
function setRz(m, a) { m.fill(0); const c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = -s; m[4] = s; m[5] = c; m[10] = 1; m[15] = 1; return m; }
function setRx(m, a) { m.fill(0); const c = Math.cos(a), s = Math.sin(a); m[0] = 1; m[5] = c; m[6] = s; m[9] = -s; m[10] = c; m[15] = 1; return m; }
function about(out, base, n, iCy, iTheta) {
  const c = Math.cos(n[iTheta]), s = Math.sin(n[iTheta]), cy = n[iCy];
  for (let r = 0; r < 4; r++) {
    const b0 = base[r], b1 = base[4 + r];
    out[r] = c * b0 - s * b1; out[4 + r] = s * b0 + c * b1; out[8 + r] = base[8 + r]; out[12 + r] = cy * b1 + base[12 + r];
  }
  return out;
}
function setRxN(m, n, i) { m.fill(0); const c = Math.cos(n[i]), s = Math.sin(n[i]); m[0] = 1; m[5] = c; m[6] = s; m[9] = -s; m[10] = c; m[15] = 1; return m; }
function setRzN(m, n, i) { m.fill(0); const c = Math.cos(n[i]), s = Math.sin(n[i]); m[0] = c; m[1] = -s; m[4] = s; m[5] = c; m[10] = 1; m[15] = 1; return m; }
function setTyN(m, n, i) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; m[13] = n[i]; return m; }
function standAtN(m, at, n, iLift, iYaw) {
  m.fill(0); const c = Math.cos(n[iYaw]), s = Math.sin(n[iYaw]);
  m[0] = c; m[2] = -s; m[5] = 1; m[8] = s; m[10] = c; m[15] = 1; m[12] = at[0]; m[13] = at[1] + n[iLift]; m[14] = at[2];
  return m;
}

/** @param {{ renderer?: any, audio?: any, now?: () => number, onRift?: () => (boolean|null|void), onReturn?: () => void, riftTo?: string | (() => string), retTitle?: string, retTo?: string, riftCount?: () => (string | null), look?: () => any, clock?: () => number, riftKey?: string, riftTitle?: string | (() => string), walkIn?: boolean, riftYields?: boolean }} [deps] */
export function createSdEnd({ renderer = null, audio = null, now = () => performance.now(), onRift = () => {}, onReturn = () => {}, riftTo = SD_END_TEXT.riftTo, retTitle = SD_END_TEXT.ret, retTo = SD_END_TEXT.retTo, riftCount = () => null, look = () => SD_RIFT_OPEN_LOOK, clock = null, riftKey = SD_RIFT_KEY, riftTitle = SD_END_TEXT.rift, walkIn = true, riftYields = false } = {}) {
  /** @type {any} */
  let rift = null;
  /** @type {any} */
  let ret = null;
  let bell = null, bellAskedAt = -Infinity, bellAt = -Infinity;
  let wasRift = null, wasRet = null, hasLast = false;
  const lastFeet = [0, 0, 0], lastAt = new Float64Array([-Infinity]);
  let draws = null;
  const mine = [];
  let _targets = NONE;
  const retarget = () => {
    const out = [];
    if (rift) out.push(riftPress(rift, riftKey, riftYields));
    if (ret) out.push({ key: SD_RETURN_KEY, aabb: boxOf(ret.at, (SD_RETURN_SIZE.w / 2) * ret.scale, SD_RETURN_SIZE.h * ret.scale), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
    _targets = out.length ? Object.freeze(out) : NONE;
  };
  const standMesh = (model, noShadow) => {
    if (!renderer?.createMesh) return null;
    ensureSdEndArt(renderer);
    const d = { gpu: renderer.createMesh(model), object: { matrix: new Float32Array(16) }, noShadow, texRemap: null, sdEnd: true };
    mine.push(d);
    draws?.push(d);
    return d;
  };
  const dropMesh = (d) => {
    if (!d) return;
    const i = mine.indexOf(d); if (i >= 0) mine.splice(i, 1);
    const j = draws ? draws.indexOf(d) : -1; if (j >= 0) draws.splice(j, 1);
    try { renderer?.destroyMesh?.(d.gpu); } catch { }
  };

  const standRet = (at, yaw, scale = 1, parts = false) => {
    const w = SD_RETURN_SIZE.w, h = SD_RETURN_SIZE.h;
    const pm = parts ? buildReturnParts(w, h) : null;
    const r = { at: [...at], yaw, scale, parts: pm ? SD_RETURN_PARTS.map((n) => standMesh(pm[n], true)) : null, arch: standMesh(buildReturnModel(w, h), false), hand: standMesh(buildReturnHand(), true), plate: standMesh(buildReturnPlate(), true), hoverAt: -Infinity, base: new Float32Array(16), window: new Float32Array(16), n: new Float64Array([0, yaw, 0]), outAt: -Infinity };
    setT(_t, at[0], at[1], at[2]); multiply(_t, setRy(_r, yaw), r.base);
    return r;
  };

  const lightNow = (L, t) => {
    if (!rift) return 0;
    const sinceToll = Number.isFinite(rift.n[N_TOLL]) ? (t - rift.n[N_TOLL]) / 1000 : Infinity;
    const swell = sinceToll < SD_TOLL_FADE_S ? SD_TOLL_SWELL * (1 - sinceToll / SD_TOLL_FADE_S) : 0;
    const sinceReveal = (t - rift.revealAt) / 1000;
    const flare = sinceReveal >= 0 && sinceReveal < SD_REVEAL_S ? 0.6 * (1 - sinceReveal / SD_REVEAL_S) : 0;
    return L.light * (1 + swell + flare);
  };

  const api = {
    stand({ rift: r, retAt, dynamicDraws = null, probe = null, floor = null, hollow = false }) {
      if (rift || !r?.at) return false;
      draws = dynamicDraws ?? draws ?? [];
      const size = r.size, R = size / 2, face = r.face ?? [0, 0, 1], yaw = Math.atan2(face[0], face[2]);
      rift = {
        at: [...r.at], size, face: [...face], yaw, cy: riftCentreY(size), probe,
        base: new Float32Array(16), centre: new Float32Array(16), toLocal: new Float32Array(9),
        statics: standMesh(buildRiftStatic(size, floor), false),
        gear: standMesh(buildRiftGear(size), true),
        ring: standMesh(buildHourRing(size), true),
        studs: null, studKey: '',
        iris: standMesh(irisModel(size, SD_RIFT_OPEN_LOOK.aperture), true),
        shards: [0, 1, 2].map((k) => standMesh(buildRiftShard(size, k), true)),
        toned: null, studLit: -1, studEmber: -1, remap: undefined,
        n: new Float64Array(9),
        radii: new Float32Array(8), tolls: 0, revealAt: -Infinity, revealed: false, revealAskAt: 0,
        refusedAt: -Infinity, steppedAt: -Infinity, exhaleAt: -Infinity, ring0: 0, ripple: [0, 0, 0, 9], light: [0, 0, 0],
        hollow: hollow ? { floor: riftCentreY(size) } : null, turn: hollow ? -1 : 1,
      };
      rift.n[N_TOLL] = -Infinity; rift.n[N_IRIS] = SD_RIFT_OPEN_LOOK.aperture; rift.n[N_IRIS_T] = now(); rift.n[N_CY] = rift.cy; rift.n[N_R] = (SD_RIFT_PARTS.shardOrbit * size) / 2;
      rift.toned = [rift.statics, rift.gear, rift.ring, rift.iris, ...rift.shards].filter(Boolean);
      setT(_t, r.at[0], r.at[1], r.at[2]); multiply(_t, setRy(_r, yaw), rift.base);
      multiply(rift.base, setT(_t, 0, rift.cy, 0), rift.centre);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      rift.toLocal.set([c, 0, s, 0, 1, 0, -s, 0, c]);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, lx = Math.cos(a), lz = Math.sin(a);
        const dir = [lx * c + lz * s, 0, -lx * s + lz * c];
        const d = probe?.ray?.([r.at[0], r.at[1] + 0.3, r.at[2]], dir, 3 * size) ?? null;
        rift.radii[k] = Math.max(R * 0.95, Math.min(3 * size, d == null ? 1.6 * size : d - 0.1));
      }
      rift.reach = 0; for (let k = 0; k < 8; k++) rift.reach = Math.max(rift.reach, rift.radii[k]);
      if (retAt) ret = { ...standRet(retAt, yaw), risesAt: -Infinity, pressed: false, up: true };
      retarget();
      bell = startRiftBell(audio, [r.at[0], r.at[1] + rift.cy, r.at[2]]);
      bellAskedAt = now();
      if (bell) bellAt = now();
      api.frame(null);
      return true;
    },
    standReturn(at, age = Infinity, { dynamicDraws = null, yaw = 0, scale = undefined } = {}) {
      if (ret || !at) return false;
      draws = dynamicDraws ?? draws ?? [];
      const ago = Number.isFinite(age) ? Math.max(0, age) : Infinity;
      ret = { ...standRet(at, yaw, scale ?? (rift?.hollow ? SD_HOME_SCALE : 1), ago < SD_HOME_RISE_MS), risesAt: now() - ago, pressed: true, up: false, lift: 0 };
      wasRet = null;
      retarget();
      if (ago < SD_HOME_SAY_MS) tollRiftBell(audio, [at[0], at[1] + SD_RETURN_SIZE.h / 2, at[2]]);
      api.frame(null);
      return true;
    },
    returnOut() { if (!ret) return; dropMesh(ret.arch); dropMesh(ret.hand); dropMesh(ret.plate); for (const d of ret.parts ?? NONE) dropMesh(d); ret = null; wasRet = null; retarget(); },
    pulse(kind, t = now()) {
      if (!rift) return;
      if (kind === 'refused') rift.refusedAt = t;
      if (kind === 'step') rift.steppedAt = t;
      if (kind === 'exhale') rift.exhaleAt = t;
    },
    frame(feet, eye = null) {
      const t = now();
      if (rift && !bell && audio && t - bellAskedAt >= SD_BELL_ASK_MS) { bellAskedAt = t; bell = startRiftBell(audio, [rift.at[0], rift.at[1] + rift.cy, rift.at[2]]); if (bell) bellAt = t; }
      if (rift) frameRift(t, eye);
      if (ret) frameRet(t);
      if (!feet) { wasRift = wasRet = null; hasLast = false; return null; }
      const dx = feet[0] - lastFeet[0], dy = feet[1] - lastFeet[1], dz = feet[2] - lastFeet[2];
      const gap = t - lastAt[0] > SD_STEP_GAP_MS || !hasLast || dx * dx + dy * dy + dz * dz > SD_STEP_JUMP_M * SD_STEP_JUMP_M;
      lastAt[0] = t; lastFeet[0] = feet[0]; lastFeet[1] = feet[1]; lastFeet[2] = feet[2]; hasLast = true;
      const inRift = !!rift && walkIn && inSdPortal(feet, rift.at, Math.min(SD_RIFT_REACH_M, rift.size / 4), rift.size);
      const inRet = !!ret && !ret.pressed && inSdPortal(feet, ret.at, SD_RETURN_REACH_M, SD_RETURN_SIZE.h);
      const enteredRift = inRift && wasRift === false && !gap;
      const enteredRet = inRet && wasRet === false && !gap;
      wasRift = inRift; wasRet = inRet;
      // An `onRift` result of false means the host has not taken the step, so the walk-in stays armed.
      if (enteredRift) { const took = onRift(); if (took === false) wasRift = false; seen(took); return 'rift'; }
      if (enteredRet) { onReturn(); return 'return'; }
      return null;
    },
    targets() { return _targets; },
    hoverName(key) {
      if (key === riftKey && rift) { const n = riftCount(), to = typeof riftTo === 'function' ? riftTo() : riftTo; return { title: typeof riftTitle === 'function' ? riftTitle() : riftTitle, subs: n ? [to, n] : [to] }; }
      if (key === SD_RETURN_KEY && ret) { ret.hoverAt = now(); return { title: retTitle, subs: [retTo] }; }
      return null;
    },
    press(key) {
      if (key === riftKey && rift) { seen(onRift()); return true; }
      if (key === SD_RETURN_KEY && ret) { onReturn(); return true; }
      return false;
    },
    batches: () => NONE,
    look(eye, sky, hour = 12) {
      if (!rift && !ret) return null;
      // `look`, `halos`, and `lights` return reused records that are valid only until the next call.
      const out = _look;
      out.window = null; out.floor = null; out.bay = null;
      const t = now(), L = look() ?? SD_RIFT_OPEN_LOOK;
      if (rift) {
        const R = rift.size / 2, light = lightNow(L, t), refused = (t - rift.refusedAt) / 1000;
        const ember = refused >= 0 && refused < SD_REFUSE_S ? 1 - refused / SD_REFUSE_S : L.tone === 'ember' ? 0.35 : 0;
        const stepped = (t - rift.steppedAt) / 1000;
        // The ripple time stays finite, because a sine of infinity is NaN and a NaN ray blanks the window.
        rift.ripple[2] = stepped >= 0 && stepped < SD_RIPPLE_S ? 1 : 0; rift.ripple[3] = stepped >= 0 && stepped < SD_RIPPLE_S ? stepped : SD_RIPPLE_S;
        if (L.aperture > 0.01 && (sky?.map || rift.hollow)) {
          const w = (out.window = _win);
          w.model = rift.centre; w.toLocal = rift.toLocal; w.radius = SD_RIFT_PARTS.window * R; w.eye = eye; w.light = light; w.ember = ember; w.ripple = rift.ripple; w.sky = sky; w.hollow = rift.hollow;
        }
        if (light > 0.01) {
          const col = L.tone === 'red' ? SD_LIGHT.red : L.tone === 'ember' ? SD_LIGHT.ember : SD_LIGHT.gold;
          rift.light[0] = col[0] * light; rift.light[1] = col[1] * light; rift.light[2] = col[2] * light;
          const since = Number.isFinite(rift.n[N_TOLL]) ? (t - rift.n[N_TOLL]) / 1000 : Infinity;
          const fl = (out.floor = _floor);
          fl.model = rift.base; fl.reach = rift.reach; fl.radii = rift.radii; fl.crater = SD_RIFT_PARTS.crater1 * R; fl.gear = rift.n[N_GEAR]; fl.pulse = since < 3 ? since * 5 : -1; fl.color = rift.light;
        }
      }
      if (ret && ret.up !== false) {
        const fade = Number.isFinite(ret.outAt) ? clamp01((t - ret.outAt) / 1500) : 0;
        const b = (out.bay = _bay);
        b.model = ret.window ?? ret.base; b.hour = hour; b.clouds = t / 1000; b.fade = fade;
      }
      return out;
    },
    halos() {
      let n = 0;
      const t = now();
      if (rift) {
        const L = look() ?? SD_RIFT_OPEN_LOOK, k = lightNow(L, t) * Math.max(0.25, L.aperture);
        if (k > 0.01) { const c = L.tone === 'red' ? SD_LIGHT.red : L.tone === 'ember' ? SD_LIGHT.ember : SD_LIGHT.gold; put3(_core.at, rift.at[0], rift.at[1] + rift.cy, rift.at[2]); _core.size = rift.size * 0.32; tint(_core.color, c, 0.55 * k); _halos[n++] = _core; }
      }
      if (ret && ret.up !== false) { const d = RETURN_DIAL, b = ret.base; put3(_key.at, b[12] + b[8] * d[2], b[13] + d[1], b[14] + b[10] * d[2]); _key.size = 0.35; tint(_key.color, SD_LIGHT.moon, 0.35); _halos[n++] = _key; }
      if (_halos.length !== n) _halos.length = n;
      return _halos;
    },
    lights() {
      let n = 0;
      const t = now();
      if (rift) {
        const L = look() ?? SD_RIFT_OPEN_LOOK, k = lightNow(L, t);
        if (k > 0.01) {
          const c = L.tone === 'red' ? SD_LIGHT.red : L.tone === 'ember' ? SD_LIGHT.ember : rift.hollow ? SD_LIGHT.moon : SD_LIGHT.gold, b = rift.base, a = -SD_RIFT_LIGHT.ahead * rift.size;
          _rl.x = b[12] + b[8] * a; _rl.y = rift.at[1] + rift.cy; _rl.z = b[14] + b[10] * a;
          _rl.range = Math.min(SD_RIFT_LIGHT.maxReach, SD_RIFT_LIGHT.reach * rift.size); tint(_rl.color, c, k * SD_RIFT_LIGHT.gain);
          _lights[n++] = _rl;
        }
      }
      if (ret) { const b = ret.base, up = ret.up !== false; _ml.x = b[12] - b[8] * 0.6; _ml.y = ret.at[1] + 1.4 * ret.scale; _ml.z = b[14] - b[10] * 0.6; _ml.range = SD_RIFT_LIGHT.retReach * (up ? 1 : ret.scale); tint(_ml.color, SD_LIGHT.moon, up ? SD_RIFT_LIGHT.ret : SD_RIFT_LIGHT.column); _lights[n++] = _ml; }
      if (_lights.length !== n) _lights.length = n;
      return _lights;
    },
    get rift() { return rift ? { at: [...rift.at], size: rift.size, face: [...rift.face] } : null; },
    get ret() { return ret ? { at: [...ret.at], foot: ret.base[13] + (ret.lift ?? 0) * ret.scale } : null; },
    get hasRet() { return !!ret; },
    get parts() { return rift ? { draws: [...mine], aperture: rift.n[N_IRIS], ringAngle: rift.n[N_RING], gearAngle: rift.n[N_GEAR], studs: rift.studKey } : { draws: [...mine] }; },
    clear() {
      for (const d of [...mine]) dropMesh(d);
      rift = null; ret = null; _targets = NONE;
      try { if (bell?.fadeStop) bell.fadeStop(); else bell?.stop?.(); } catch { }
      bell = null; bellAskedAt = -Infinity; bellAt = -Infinity;
    },
  };
  const _halos = [], _core = { at: [0, 0, 0], size: 1, color: [0, 0, 0] }, _key = { at: [0, 0, 0], size: 0.35, color: [0, 0, 0] };
  const _look = { window: null, floor: null, bay: null };
  const _win = { model: null, toLocal: null, radius: 0, eye: null, light: 0, ember: 0, ripple: null, sky: null, hollow: false };
  const _floor = { model: null, reach: 0, radii: null, crater: 0, gear: 0, pulse: -1, color: null };
  const _bay = { model: null, key: 'return', outline: RETURN_OUTLINE, half: RETURN_HALF, hour: 12, clouds: 0, fade: 0 };
  const _lights = [], _rl = { x: 0, y: 0, z: 0, range: 1, color: [0, 0, 0] }, _ml = { x: 0, y: 0, z: 0, range: 1, color: [0, 0, 0] };

  function seen(took) {
    const L = look() ?? SD_RIFT_OPEN_LOOK;
    if (took !== false && took !== null) api.pulse(L.state === 'open' ? 'step' : 'refused');
  }

  function frameRift(t, eye) {
    const L = look() ?? SD_RIFT_OPEN_LOOK, s = clock ? clock() : t / 1000;
    const pitch = (Math.PI * 2) / SD_RIFT_PARTS.teeth, refused = (t - rift.refusedAt) / 1000;
    const jerk = refused >= 0 && refused < 0.3 ? -pitch * (1 - refused / 0.3) : 0;
    const sx = s * L.tickHz, si = Math.floor(sx), se = Math.min(1, (sx - si) / SD_TICK_EASE_S);
    rift.n[N_GEAR] = (L.tickHz > 0 ? (si + se * se * (3 - 2 * se)) * pitch + jerk : jerk) * rift.turn;
    if (rift.gear) about(rift.gear.object.matrix, rift.base, rift.n, N_CY, N_GEAR);
    const period = RIFT_BELL_SECONDS, since = Number.isFinite(bellAt) ? (t - bellAt) / 1000 - 0.05 : s;
    const tolls = Math.floor(since / period), into = since - tolls * period;
    if (L.tickHz > 0 && tolls !== rift.tolls) { rift.tolls = tolls; rift.n[N_TOLL] = t - into * 1000; }
    const e0 = into / SD_RATCHET_S, e = e0 < 0 ? 0 : e0 > 1 ? 1 : e0, jolt = e < 1 ? 1 - (1 - e) * (1 - e) * (1 + SD_RATCHET_OVER * 6 * e) : 1;
    rift.ring0 = L.tickHz > 0 ? -((tolls - 1) + jolt) * (Math.PI / 6) * rift.turn : rift.ring0;
    const ex = (t - rift.exhaleAt) / SD_EXHALE_MS, xe = ex > 0 && ex < 1 ? ex * ex * (3 - 2 * ex) : 0;
    rift.n[N_RING] = rift.ring0 - xe * Math.PI * 2 * rift.turn;
    if (rift.ring) about(rift.ring.object.matrix, rift.base, rift.n, N_CY, N_RING);
    if ((L.studs !== rift.studLit || L.ember !== rift.studEmber) && renderer?.createMesh) {
      rift.studLit = L.studs; rift.studEmber = L.ember; rift.studKey = `${L.studs}|${L.ember}`;
      dropMesh(rift.studs);
      rift.studs = standMesh(buildRiftStuds(rift.size, Math.min(SD_RIFT_STUDS, L.studs), Math.min(SD_RIFT_STUDS - L.studs, L.ember)), true);
    }
    if (rift.studs) rift.studs.object.matrix.set(rift.ring?.object.matrix ?? rift.centre);
    const want = L.aperture;
    if (Math.abs(rift.n[N_IRIS] - want) > 1e-4) {
      const dt = Math.min(0.1, Math.max(0, (t - rift.n[N_IRIS_T]) / 1000));
      const stepA = dt / SD_IRIS_EASE_S;
      rift.n[N_IRIS] = Math.abs(want - rift.n[N_IRIS]) <= stepA ? want : rift.n[N_IRIS] + Math.sign(want - rift.n[N_IRIS]) * stepA;
      if (rift.iris && renderer?.updateMeshVertices) { const p = irisPositions(rift.size, rift.n[N_IRIS]); renderer.updateMeshVertices(rift.iris.gpu, p.positions, p.normals); }
    }
    rift.n[N_IRIS_T] = t;
    if (rift.iris) rift.iris.object.matrix.set(rift.centre);
    for (let k = 0; k < 3; k++) {
      const d = rift.shards[k];
      if (!d) continue;
      const m = d.object.matrix, n = rift.n;
      n[N_A] = (k - 1) * 0.42; multiply(rift.centre, setRxN(_t, n, N_A), m);
      n[N_A] = (s * (0.05 + 0.02 * k) * (k === 1 ? -1 : 1)) * Math.PI * 2 + (k * Math.PI * 2) / 3; multiply(m, setRzN(_t, n, N_A), m);
      multiply(m, setTyN(_t, n, N_R), m);
      n[N_B] = s * (0.6 + 0.2 * k); multiply(m, setRxN(_t, n, N_B), m);
    }
    const remap = L.tone === 'cold' ? REMAP.cold : L.tone === 'red' ? REMAP.red : null;
    if (remap !== rift.remap) { rift.remap = remap; for (const d of rift.toned) d.texRemap = remap; }
    if (rift.statics) rift.statics.object.matrix.set(rift.base);
    if (!rift.hollow && !rift.revealed && eye && t >= rift.revealAskAt && L.state === 'open') {
      rift.revealAskAt = t + SD_REVEAL_ASK_MS;
      const dx = rift.at[0] - eye[0], dy = rift.at[1] + rift.cy - eye[1], dz = rift.at[2] - eye[2], dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < SD_REVEAL_M && dist > 1) {
        const hit = rift.probe?.ray?.(eye, [dx / dist, dy / dist, dz / dist], dist) ?? null;
        if (hit == null || hit >= dist - rift.size * 0.6) { rift.revealed = true; rift.revealAt = t; tollRiftBell(audio, [rift.at[0], rift.at[1] + rift.cy, rift.at[2]]); }
      }
    }
  }
  function frameRet(t) {
    const k0 = ret.pressed ? (t - ret.risesAt) / SD_HOME_RISE_MS : 1, k = k0 < 0 ? 0 : k0 > 1 ? 1 : k0, n = ret.n;
    ret.up = k >= 1;
    standAtN(ret.base, ret.at, n, 0, 1);
    const sc = ret.scale;
    if (sc !== 1) { ret.base[0] *= sc; ret.base[2] *= sc; ret.base[5] = sc; ret.base[8] *= sc; ret.base[10] *= sc; }
    if (ret.arch) { ret.arch.object.matrix.set(ret.base); ret.arch.hidden = !!ret.parts && k < 1; }
    if (ret.parts) assemble(k);
    if (ret.plate) { ret.plate.object.matrix.set(ret.base); ret.plate.hidden = !!ret.parts && k < 1; ret.plate.texRemap = t - ret.hoverAt < SD_PLATE_HOLD_MS ? PLATE_LIT : null; }
    if (ret.hand) {
      ret.hand.hidden = !!ret.parts && k < SD_HOME_ASSEMBLY.key[1];
      multiply(ret.base, RETURN_DIAL_T, ret.hand.object.matrix);
      const hs = t / 1000, hi = Math.floor(hs), he = Math.min(1, (hs - hi) / SD_TICK_EASE_S);
      n[2] = (hi + he * he * (3 - 2 * he)) * (Math.PI * 2) / 60;
      multiply(ret.hand.object.matrix, setRzN(_t, n, 2), ret.hand.object.matrix);
    }
    multiply(ret.base, RETURN_WINDOW_T, ret.window);
  }
  function assemble(k) {
    const A = SD_HOME_ASSEMBLY, sx = RETURN_SPRING[0], sy = RETURN_SPRING[1], done = k >= 1;
    ret.lift = done ? 0 : -SD_RETURN_SIZE.h * 0.7 * (1 - stage(k, A.jambs));
    for (let i = 0; i < ret.parts.length; i++) {
      const d = ret.parts[i];
      if (!d) continue;
      d.hidden = done;
      if (done) continue;
      let px = 0, py = 0, a = 0, lift = 0;
      if (i < 2) lift = ret.lift;
      else if (i < 4) { px = i === 2 ? -sx : sx; py = sy; a = (i === 2 ? 1 : -1) * A.swing * (1 - stage(k, A.arches)); }
      else lift = A.drop * (1 - stage(k, A.key));
      const c = Math.cos(a), s = Math.sin(a);
      _asm.fill(0); _asm[0] = c; _asm[1] = s; _asm[4] = -s; _asm[5] = c; _asm[10] = 1; _asm[15] = 1;
      _asm[12] = px - c * px + s * py; _asm[13] = py + lift - s * px - c * py;
      multiply(ret.base, _asm, d.object.matrix);
    }
  }
  return api;
}

const put3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; };
const tint = (o, c, g) => { o[0] = c[0] * g; o[1] = c[1] * g; o[2] = c[2] * g; };
const _asm = new Float32Array(16);
const stage = (k, w) => { const u = (k - w[0]) / (w[1] - w[0]), c = u < 0 ? 0 : u > 1 ? 1 : u; return c * c * (3 - 2 * c); };
const RETURN_DIAL = Object.freeze(returnDialAt(SD_RETURN_SIZE.h));
const RETURN_DIAL_T = setT(new Float32Array(16), RETURN_DIAL[0], RETURN_DIAL[1], RETURN_DIAL[2]);
const RETURN_WINDOW_T = setT(new Float32Array(16), 0, SD_RETURN_SIZE.h / 2 - 0.02, 0);
const RETURN_SPRING = Object.freeze(returnSpringAt(SD_RETURN_SIZE.w, SD_RETURN_SIZE.h));
const RETURN_HALF = Object.freeze([SD_RETURN_SIZE.w / 2, SD_RETURN_SIZE.h / 2]);
const RETURN_OUTLINE = Object.freeze((() => {
  const hw = SD_RETURN_SIZE.w / 2 - SD_RETURN_ARCH.jamb, h = SD_RETURN_SIZE.h, spring = h * SD_RETURN_ARCH.spring, top = h - SD_RETURN_ARCH.jamb * 1.2, n = SD_RETURN_ARCH.segs;
  const left = [];
  for (let j = 0; j <= n; j++) { const t = j / n; left.push([-hw + hw * Math.sin((t * Math.PI) / 2), spring + (top - spring) * (1 - Math.cos((t * Math.PI) / 2)) ** 0.9]); }
  const pts = [[-hw, 0.08], ...left, ...left.slice(0, -1).reverse().map((p) => [-p[0], p[1]]), [hw, 0.08], [-hw, 0.08]];
  return pts.map((p) => Object.freeze([p[0], p[1] - h / 2]));
})());
