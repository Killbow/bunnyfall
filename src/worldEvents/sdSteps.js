// @ts-check
// Every client moves the steps from the shared realm clock, so all players see the same step in the same place.
// Crumble steps break per player and are not synced.
import { realmToDungeon, SD_REALM_ORIGIN } from '../net/sdBrain.js';
import { SD_COURSE, SD_BEAT_HALF, SD_BEAT_CYCLE, SD_BEAT_SOLID, SD_BEAT_BLINK, SD_CRUMBLE_DELAY, SD_CRUMBLE_BACK, SD_CRUMBLE_FALL_G, SD_GUST_EVERY, stepAt, beatStands, beatBlinks, crumbleAfter, gustAt, breathSeen, inBreath, inVoid, spanAt, castBackTo } from '../world/sdSteps.js';
import {
  SD_STEP_KINDS, SD_BREATH, SD_PENDULUM, SD_BEAT_DISSOLVE, SD_GRIT, SD_WAYSTONES, SD_VANE, sdWaystonesOf, sdVaneAt, buildStepModel, stepTris, buildChecksModel, checkFloorTris, buildBreathModel,
  buildBeatDissolve, buildPendulum, pendulumAngle, buildCrumbleChunks, buildGritModel, buildWaystoneModel, buildVaneModel, vaneYawInto,
} from '../world/sdStepsModel.js';
import { stepsArt, SD_STEPS_RECORD } from '../world/sdStepsArt.js';
import { SD_REALM_ARCHIVE } from '../world/sdRealm.js';
import { identity } from '../world/mat4.js';
import { SdStepsPass, SD_GHOST_STEPS, SD_GHOSTS_MAX, SD_GHOST, sdGhostStepsOf, sdStepsPrograms } from '../render/sdStepsPass.js';
import { compiledPass, parallelCompile, startPrograms } from '../render/glProgram.js';
import { SD_SKY_STEPS } from '../render/sdSky.js';
import { isTouchDevice } from '../ui/touchDevice.js';

export const SD_STEPS_TEXT = Object.freeze({ cast: 'The Hour casts you back.' });
export const sdStepKey = (i) => `sd:step:${i}`;
export const SD_CHECKS_KEY = 'sd:steps:checks';
export const SD_STEPS_SOUNDS = Object.freeze({ tick: 433, grind: 68, wind: 70, moan: 66, clack: 433 });
export const SD_STEP_GONE_Y = -400;
// `SD_BEAT_BLINK_HZ` must stay below the project flash ceiling `TELEGRAPH_THROB_MAX_HZ` (3 Hz).
export const SD_CRUMBLE_SHAKE = 0.035;
export const SD_BEAT_BLINK_HZ = 2.5;
export const SD_CRUMBLE_SEEN = 40;
export const SD_BEAT_FRAME_S = SD_BEAT_SOLID / 12;
export const SD_BEAT_IN_S = 0.15;
export const SD_BEAT_OUT_STAGE_S = SD_BEAT_BLINK / SD_BEAT_DISSOLVE.keep.length;
export const SD_CHUNK = Object.freeze({ rewind: 0.6, rise: 2.2, drift: 0.5, spin: 2.2, shudder: 0.25, settle: 0.02 });
// Caps the breath push per frame so a long frame hitch does not throw the player off the course.
const BREATH_DT_MAX = 0.1;
export const SD_BREATH_BAND_M = 3;
export function sdBreathBand(course) {
  if (course === SD_COURSE) return null;
  let a = Infinity, b = -Infinity;
  for (const s of course.steps) { const h = (s.w ?? 0) / 2 + (s.amp ?? 0) + SD_BREATH_BAND_M; a = Math.min(a, s.x - h); b = Math.max(b, s.x + h); }
  return [a, b];
}
const _at = [0, 0, 0];
const _now = new Float64Array(1);
const _crumble = { drop: 0, whole: true, shaking: false };
const _gust = { push: 0, warn: false };
const _breath = { dir: 0, k: 0 };
const _p = new Float64Array(6);
const _vane = new Float64Array(2);

// Built once because the renderer caches draws by the remap object itself; a new map each frame would miss that
// cache.
const key = (rec) => `${SD_REALM_ARCHIVE}_${rec}`;
const BEAT_FRAMES = Object.freeze(SD_STEPS_RECORD.beat.map((rec, k) => (k === 0 ? null : new Map([[key(SD_STEPS_RECORD.beat[0]), key(rec)]]))));
const BEAT_FALTER = new Map([[key(SD_STEPS_RECORD.beat[0]), key(SD_STEPS_RECORD.falter)]]);
const CRUMBLE_STAGES = Object.freeze(SD_STEPS_RECORD.crumble.map((rec, k) => (k === 0 ? null : new Map([[key(SD_STEPS_RECORD.crumble[0]), key(rec)]]))));
const WAYSTONE_DARK = new Map([[key(SD_STEPS_RECORD.parts), key(SD_STEPS_RECORD.partsDark)]]);
export { BEAT_FRAMES as SD_BEAT_FRAMES, CRUMBLE_STAGES as SD_CRUMBLE_STAGES, WAYSTONE_DARK as SD_WAYSTONE_DARK };
export const sdChunkWays = (chunks) => chunks.map((c, j) => {
  const l = Math.hypot(c.at[0], c.at[2]) || 1, ox = c.at[0] / l, oz = c.at[2] / l;
  return { at: c.at, ox, oz, kx: oz, kz: -ox, w: SD_CHUNK.spin * (0.8 + 0.15 * j), g: 1 + 0.06 * (j - 1.5) };
});
export function sdChunkMatrix(m, C, tau, x, y, z) {
  const a = C.w * tau, c = Math.cos(a), sn = Math.sin(a), v = 1 - c;
  m[0] = c + v * C.kx * C.kx; m[1] = sn * C.kz; m[2] = v * C.kx * C.kz; m[3] = 0;
  m[4] = -sn * C.kz; m[5] = c; m[6] = sn * C.kx; m[7] = 0;
  m[8] = v * C.kx * C.kz; m[9] = -sn * C.kx; m[10] = c + v * C.kz * C.kz; m[11] = 0;
  m[12] = x + C.at[0] + C.ox * SD_CHUNK.drift * tau; m[13] = y + C.at[1] - 0.5 * SD_CRUMBLE_FALL_G * tau * tau * C.g; m[14] = z + C.at[2] + C.oz * SD_CHUNK.drift * tau; m[15] = 1;
  return m;
}

const _uploaded = new WeakSet();
export function ensureSdStepsArt(renderer) {
  if (!renderer || _uploaded.has(renderer) || typeof renderer.uploadTexture !== 'function') return;
  _uploaded.add(renderer);
  for (const [rec, art] of stepsArt()) { renderer.uploadTexture(SD_REALM_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(SD_REALM_ARCHIVE, rec, art.emission, { white: true }); }
}
function translate(out, x, y, z) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
function leanAbout(out, a, x, y, z) {
  const c = Math.cos(a), s = Math.sin(a);
  out.fill(0);
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c; out[10] = 1; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
function yawAbout(out, yw, x, y, z) {
  const c = Math.cos(yw), s = Math.sin(yw);
  out.fill(0);
  out[0] = c; out[2] = -s; out[5] = 1; out[8] = s; out[10] = c; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
const hide = (d) => { if (d && !d.hidden) { d.object.matrix.fill(0); d.hidden = true; } };

/** @param {{ renderer?: any, audio?: any, ending?: string | null, lite?: boolean, course?: any }} deps */
export function createSdSteps({ renderer = null, audio = null, ending = null, lite = isTouchDevice(), course = SD_COURSE } = {}) {
  const ghosts = course === SD_COURSE ? SD_GHOST_STEPS : sdGhostStepsOf(course).slice(0, SD_GHOSTS_MAX);
  const waystones = course === SD_COURSE ? SD_WAYSTONES : sdWaystonesOf(course), vaneAt = course === SD_COURSE ? SD_VANE.at : sdVaneAt(course);
  const steps = course.steps.map((s) => ({ s, key: sdStepKey(s.i), T: [0, SD_STEP_GONE_Y, 0], was: [0, SD_STEP_GONE_Y, 0], solid: false, wasSolid: false, draw: null, touched: null, ghost: ghosts.indexOf(s), pend: null, chunks: null, grit: null, back: -Infinity }));
  const byKey = new Map(steps.map((st) => [st.key, st]));
  const lastStep = steps[steps.length - 1];
  /** @type {Map<string, any>} */
  const meshes = new Map();
  /** @type {any[] | null} */
  let draws = null;
  let checksMesh = null, lastTick = null, lastWarned = null;
  const band = sdBreathBand(course);
  let breathMesh = null, breathDraw = null, lastSpan = -1;
  /** @type {any[]} */
  let dissolve = [], chunkMeshes = [];
  let pendMesh = null, gritMesh = null, stoneMesh = null, vaneMesh = null, vaneDraw = null, lit = -2, pass = null;
  const ghostsDoor = () => (renderer?.gl ? compiledPass(renderer.gl, sdStepsPrograms(), () => new SdStepsPass(renderer.gl, ghosts), (e) => console.warn('[sd] the Steps\' ghosts would not build', e?.message ?? e)) : null);
  let passOf = ghostsDoor();
  if (renderer?.gl && parallelCompile(renderer.gl)) startPrograms(renderer.gl, sdStepsPrograms());
  /** @type {any[]} */
  const stoneDraws = [];
  /** @type {Array<{ at: ReadonlyArray<number>, ox: number, oz: number, kx: number, kz: number, w: number, g: number }>} */
  let chunkWays = [];
  const ghostStep = new Float32Array(SD_GHOSTS_MAX * 4), ghostState = new Float32Array(SD_GHOSTS_MAX * 4);
  // Culling only skips drawing: a culled step still moves, carries the player, and triggers cast-backs.
  /** @type {any[]} */
  let mine = [];
  let culled = false;
  const cull = (on) => { on = !!on; if (on === culled) return; culled = on; for (const d of mine) d.culled = on; };

  const make = (model) => { if (!model || !renderer?.createMesh) return null; try { return renderer.createMesh(model); } catch (e) { console.warn('[sd] the Steps would not build', e?.message ?? e); return null; } };
  const drop = (mesh) => { if (mesh) { try { renderer?.destroyMesh?.(mesh); } catch { } } };
  const play = (rec, vol, pitch = 1) => { try { audio?.playOneShot?.(rec, vol, pitch); } catch { } };
  const play3 = (rec, at, vol, pitch = 1) => { try { audio?.play3d?.(rec, at, vol, { maxDistance: 30, pitch }); } catch { } };
  function driftLook(st) {
    const m = st.pend.object.matrix, a = pendulumAngle(_at[0] - st.s.x), c = Math.cos(a), sn = Math.sin(a);
    m[0] = c; m[1] = sn; m[4] = -sn; m[5] = c;
    m[12] = SD_REALM_ORIGIN[0] + st.s.x; m[13] = _p[1] + SD_PENDULUM.len; m[14] = _p[2];
  }
  function beatLook(st, solid, falter) {
    const s = st.s, u = (((_now[0] - s.beat) % SD_BEAT_CYCLE) + SD_BEAT_CYCLE) % SD_BEAT_CYCLE, warned = u - (SD_BEAT_SOLID - SD_BEAT_BLINK);
    if (st.draw && solid) {
      st.draw.texRemap = falter ? BEAT_FALTER : BEAT_FRAMES[Math.min(11, Math.floor(u / SD_BEAT_FRAME_S))];
      const out = warned >= 0 ? Math.min(dissolve.length - 1, Math.floor(warned / SD_BEAT_OUT_STAGE_S)) : -1, into = u < SD_BEAT_IN_S ? 2 - Math.floor((u / SD_BEAT_IN_S) * 3) : -1;
      st.draw.gpu = (out >= 0 ? dissolve[out] : into >= 0 ? dissolve[into] : null) ?? meshes.get('beat');
    }
    if (st.ghost < 0) return;
    const o = st.ghost * 4, left = SD_BEAT_CYCLE - u, k = (SD_GHOST.rise - left) / SD_GHOST.rise, e = k < 0 ? 0 : k > 1 ? 1 : k;
    ghostStep[o] = _p[0]; ghostStep[o + 1] = _p[1]; ghostStep[o + 2] = _p[2];
    ghostState[o] = solid ? 0 : 1; ghostState[o + 1] = solid ? 0 : left / (SD_BEAT_CYCLE - SD_BEAT_SOLID); ghostState[o + 2] = SD_GHOST.base + (SD_GHOST.peak - SD_GHOST.base) * e * e * (3 - 2 * e);
  }
  function crumbleLook(st, shaking, whole) {
    const t = _now[0], since = _p[5], x = _p[0], y = _p[1], z = _p[2];
    if (!shaking && since < 0 && t >= st.back && t - st.back < SD_CHUNK.shudder) { const k = 1 - (t - st.back) / SD_CHUNK.shudder; _p[3] = SD_CHUNK.settle * k * Math.sin(t * 83); _p[4] = SD_CHUNK.settle * k * Math.cos(t * 61); }
    if (st.draw) st.draw.texRemap = shaking ? CRUMBLE_STAGES[1 + Math.min(2, Math.floor((since / SD_CRUMBLE_DELAY) * 3))] : null;
    const g = st.grit;
    if (g) {
      if (shaking) { const m = g.object.matrix; m[0] = m[5] = m[10] = m[15] = 1; m[12] = x + _p[3]; m[13] = y - ((t * SD_GRIT.speed) % SD_GRIT.period); m[14] = z + _p[4]; g.hidden = false; } else hide(g);
    }
    const f = whole ? -1 : since - SD_CRUMBLE_DELAY, back = SD_CRUMBLE_BACK - SD_CHUNK.rewind;
    if (st.chunks) {
      const r = f >= back ? 1 - (f - back) / SD_CHUNK.rewind : 0, tau = f >= back ? SD_CHUNK.rise * r * r : f, show = f >= back || (f >= 0 && _crumble.drop < SD_CRUMBLE_SEEN);
      for (let j = 0; j < st.chunks.length; j++) {
        const d = st.chunks[j];
        if (!show) { hide(d); continue; }
        sdChunkMatrix(d.object.matrix, chunkWays[j], tau, x, y, z);
        d.hidden = false;
      }
    }
    if (st.ghost < 0) return;
    const o = st.ghost * 4, k = (f - back) / SD_CHUNK.rewind, e = k < 0 ? 0 : k > 1 ? 1 : k;
    ghostStep[o] = x; ghostStep[o + 1] = y; ghostStep[o + 2] = z;
    ghostState[o] = f >= 0 ? 1 : 0; ghostState[o + 1] = f >= 0 ? (SD_CRUMBLE_BACK - f) / SD_CRUMBLE_BACK : 0; ghostState[o + 2] = SD_GHOST.base + (SD_GHOST.peak - SD_GHOST.base) * e * e * (3 - 2 * e);
  }

  function pose(st) {
    const s = st.s, t = _now[0];
    st.was[0] = st.T[0]; st.was[1] = st.T[1]; st.was[2] = st.T[2];
    st.wasSolid = st.solid;
    stepAt(s, t, _at);
    const x = SD_REALM_ORIGIN[0] + _at[0], y = SD_REALM_ORIGIN[1] + _at[1], z = SD_REALM_ORIGIN[2] + _at[2];
    let solid = true, seen = true, drawY = y, sx = 0, sz = 0;
    _p[0] = x; _p[1] = y; _p[2] = z;
    if (s.kind === 'drift') {
      if (st.pend) driftLook(st);
    } else if (s.kind === 'beat') {
      solid = beatStands(s, t);
      const warned = (((t - s.beat) % SD_BEAT_CYCLE) + SD_BEAT_CYCLE) % SD_BEAT_CYCLE - (SD_BEAT_SOLID - SD_BEAT_BLINK);
      const falter = beatBlinks(s, t) && Math.floor(warned * 2 * SD_BEAT_BLINK_HZ) % 2 === 1;
      seen = solid;
      beatLook(st, solid, falter);
    } else if (s.kind === 'crumble') {
      let since = -1;
      if (st.touched != null) {
        since = t - st.touched;
        if (since >= SD_CRUMBLE_DELAY + SD_CRUMBLE_BACK && since < SD_CRUMBLE_DELAY + SD_CRUMBLE_BACK + 1) {
          st.back = st.touched + SD_CRUMBLE_DELAY + SD_CRUMBLE_BACK;
          play3(SD_STEPS_SOUNDS.clack, [x, y, z], 0.7, 2.6);
        }
        if (!(since >= 0 && since < SD_CRUMBLE_DELAY + SD_CRUMBLE_BACK)) { st.touched = null; since = -1; }
      }
      const c = crumbleAfter(since, _crumble);
      solid = c.whole;
      seen = c.whole;
      if (c.shaking) { sx = SD_CRUMBLE_SHAKE * Math.sin(t * 71); sz = SD_CRUMBLE_SHAKE * Math.cos(t * 53); }
      _p[3] = sx; _p[4] = sz; _p[5] = since;
      crumbleLook(st, c.shaking, c.whole);
      sx = _p[3]; sz = _p[4];
    }
    st.solid = solid;
    st.T[0] = x; st.T[2] = z;
    if (solid) st.T[1] = y; else st.T[1] = SD_STEP_GONE_Y;
    if (st.draw) { if (seen) translate(st.draw.object.matrix, x + sx, drawY, z + sz); else st.draw.object.matrix.fill(0); st.draw.hidden = !seen; }
    if (st === lastStep) poseMarks();
  }
  function poseBreath() {
    if (!breathDraw) return;
    breathSeen(_now[0], _breath);
    const m = breathDraw.object.matrix;
    if (!_breath.dir) { if (!breathDraw.hidden) { m.fill(0); breathDraw.hidden = true; } return; }
    translate(m, SD_REALM_ORIGIN[0] + _breath.dir * (_breath.k - 0.5) * SD_BREATH.sweep, SD_REALM_ORIGIN[1], SD_REALM_ORIGIN[2]);
    m[0] = _breath.dir;
    breathDraw.hidden = false;
  }
  function poseMarks() {
    if (vaneDraw) {
      _vane[0] = _now[0];
      vaneYawInto(_vane);
      const m = vaneDraw.object.matrix, c = Math.cos(_vane[1]), sn = Math.sin(_vane[1]);
      m[0] = c; m[2] = -sn; m[8] = sn; m[10] = c;
    }
    const mine = lastSpan < 0 ? 0 : lastSpan;
    if (mine === lit) return;
    lit = mine;
    for (let k = 0; k < stoneDraws.length; k++) stoneDraws[k].texRemap = k === mine ? null : WAYSTONE_DARK;
  }

  return {
    stand({ dynamicDraws, collider = null }) {
      if (draws) return false;
      draws = dynamicDraws;
      const from = draws.length;
      ensureSdStepsArt(renderer);
      for (const kind of SD_STEP_KINDS) { const m = make(buildStepModel(kind)); if (m) meshes.set(kind, m); }
      checksMesh = make(buildChecksModel(course));
      if (checksMesh) draws.push({ gpu: checksMesh, object: { matrix: identity() } });
      breathMesh = make(buildBreathModel(course));
      if (breathMesh) { breathDraw = { gpu: breathMesh, object: { matrix: new Float32Array(16) }, hidden: true, noShadow: true }; draws.push(breathDraw); }
      dissolve = SD_BEAT_DISSOLVE.keep.map((k) => make(buildBeatDissolve(k)));
      pendMesh = make(buildPendulum({ teeth: !lite }));
      const chunks = buildCrumbleChunks(lite ? 2 : 4);
      chunkMeshes = chunks.map((c) => make(c.model));
      chunkWays = sdChunkWays(chunks);
      gritMesh = make(buildGritModel());
      for (const st of steps) {
        const gpu = meshes.get(st.s.kind);
        if (gpu) { st.draw = { gpu, object: { matrix: new Float32Array(16) }, noShadow: true, texRemap: null }; draws.push(st.draw); }
        if (st.s.kind === 'drift' && pendMesh) { st.pend = { gpu: pendMesh, object: { matrix: leanAbout(new Float32Array(16), 0, ...realmToDungeon(st.s.x, st.s.y + SD_PENDULUM.len, st.s.z)) }, noShadow: true }; draws.push(st.pend); }
        if (st.s.kind === 'crumble') {
          st.chunks = chunkMeshes.filter(Boolean).map((m) => ({ gpu: m, object: { matrix: new Float32Array(16) }, hidden: true, noShadow: true }));
          for (const d of st.chunks) draws.push(d);
          if (gritMesh) { st.grit = { gpu: gritMesh, object: { matrix: new Float32Array(16) }, hidden: true, noShadow: true }; draws.push(st.grit); }
        }
        const { positions, indices } = stepTris(st.s.kind);
        try { collider?.addMesh?.(st.key, positions, indices, identity(), () => st.T); } catch (e) { console.warn('[sd] a step\'s collider', e?.message ?? e); }
      }
      stoneMesh = make(buildWaystoneModel());
      if (stoneMesh) for (const w of waystones) { const d = { gpu: stoneMesh, object: { matrix: translate(new Float32Array(16), ...realmToDungeon(w[0], w[1], w[2])) }, noShadow: true, texRemap: null }; stoneDraws.push(d); draws.push(d); }
      vaneMesh = make(buildVaneModel(ending));
      if (vaneMesh) { vaneDraw = { gpu: vaneMesh, object: { matrix: new Float32Array(16) }, noShadow: true }; yawAbout(vaneDraw.object.matrix, 0, ...realmToDungeon(vaneAt[0], vaneAt[1], vaneAt[2])); draws.push(vaneDraw); }
      const tris = checkFloorTris(course), idx = [];
      for (let k = 0; k < tris.length / 3; k++) idx.push(k);
      try { collider?.addMesh?.(SD_CHECKS_KEY, tris, idx, identity()); } catch (e) { console.warn('[sd] the checkpoints\' floors', e?.message ?? e); }
      mine = draws.slice(from);
      if (culled) for (const d of mine) d.culled = true;
      return true;
    },
    /**
     * Call before the motor each frame: it moves the step colliders and carries the body, so the motor resolves
     * against this frame's step positions.
     * @returns {number[] | null}
     */
    ride(t, dt, body = null, live = true, seen = undefined) {
      if (seen !== undefined) cull(!seen);
      if (!draws) return null;
      const on = body?.grounded && typeof body.groundKey === 'string' ? byKey.get(body.groundKey) ?? null : null;
      if (on && live && on.s.kind === 'crumble' && on.touched == null) {
        on.touched = t;
        play3(SD_STEPS_SOUNDS.grind, [on.T[0], on.T[1], on.T[2]], 1, 1.3);
      }
      _now[0] = t;
      for (const st of steps) pose(st);
      poseBreath();
      // Carries the body only when the step was solid last frame and is solid now, so a step vanishing or returning
      // never counts as movement.
      if (on && on.solid && on.wasSolid) {
        const dx = on.T[0] - on.was[0], dy = on.T[1] - on.was[1], dz = on.T[2] - on.was[2];
        if (dx || dy || dz) body.carryBy?.(dx, dy, dz);
      }
      if (!live || !body?.pos) return null;
      const ry = body.pos[1] - SD_REALM_ORIGIN[1], rz = body.pos[2] - SD_REALM_ORIGIN[2];
      const span = spanAt(rz, course);
      if (body.grounded) lastSpan = on ? on.s.span : span;
      const g = gustAt(t, _gust), rx = body.pos[0] - SD_REALM_ORIGIN[0], onLine = !band || (rx >= band[0] && rx <= band[1]);
      if (g.push && onLine && inBreath(rz, course) && dt > 0) body.collider?.move?.(body.pos, g.push * Math.min(dt, BREATH_DT_MAX), 0, 0, body.height, !!body.grounded && !body.jumping);
      const gust = Math.floor(t / SD_GUST_EVERY);
      if (g.warn && onLine && span === 2 && lastWarned !== gust) { lastWarned = gust; play(SD_STEPS_SOUNDS.wind, 0.9); play(SD_STEPS_SOUNDS.clack, 0.45, 2.2); }
      if (span === 1) {
        const b = Math.floor(t / SD_BEAT_HALF);
        if (lastTick != null && b !== lastTick) play(SD_STEPS_SOUNDS.tick, 0.35, 1.6);
        lastTick = b;
      } else lastTick = null;
      // Casts back to the checkpoint of the span the player last stood in, not the span the fall crosses, so a fall
      // under an earlier span still returns.
      if (inVoid(ry)) {
        play(SD_STEPS_SOUNDS.moan, 1);
        return realmToDungeon(...castBackTo(lastSpan, course));
      }
      return null;
    },
    drawPass(proj, view, fog = null) {
      if (!draws || culled || !renderer?.gl) return false;
      pass ??= passOf?.(true) ?? null;
      if (!pass) return false;
      const vp = renderer._worldViewportPx;
      return pass.draw(proj, view, ghostStep, ghostState, fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic, vp?.[2] ?? 0, vp?.[3] ?? 0);
    },
    get ghosts() { return { step: ghostStep, state: ghostState }; },
    touch(i, at) { const st = steps[i]; if (st?.s.kind === 'crumble') st.touched = at; },
    standOn(span) { lastSpan = span; },
    cull,
    get culled() { return culled; },
    get steps() { return steps.map((st) => ({ i: st.s.i, kind: st.s.kind, key: st.key, T: [...st.T], solid: st.solid, touched: st.touched, matrix: st.draw ? Float32Array.from(st.draw.object.matrix) : null, remap: st.draw?.texRemap ?? null, gpu: st.draw?.gpu ?? null, chunks: st.chunks ? st.chunks.map((d) => Float32Array.from(d.object.matrix)) : null })); },
    clear() {
      for (const m of meshes.values()) drop(m);
      drop(checksMesh);
      drop(breathMesh);
      for (const m of [...dissolve, ...chunkMeshes, pendMesh, gritMesh, stoneMesh, vaneMesh]) drop(m);
      try { pass?.destroy(); } catch { }
      meshes.clear();
      checksMesh = null; breathMesh = null; breathDraw = null;
      dissolve = []; chunkMeshes = []; pendMesh = null; gritMesh = null; stoneMesh = null; vaneMesh = null; vaneDraw = null; pass = null; passOf = ghostsDoor(); lit = -2;
      stoneDraws.length = 0;
      mine = []; culled = false;
      for (const st of steps) { st.draw = null; st.pend = null; st.chunks = null; st.grit = null; }
      draws = null;
    },
  };
}
