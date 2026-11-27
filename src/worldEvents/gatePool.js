// @ts-check
import { buildGateModel, gateArchProfile, insideGateStone, GATE_ARCHIVE, GATE_HEIGHT, GATE_HALF_W, PORTAL_CENTRE_Y, ARCH_Y0, ARCH_Y1, ARCH_PROFILE_N } from '../world/gateModel.js';
import { gateArt } from '../world/gateArt.js';
import { GatePassRenderer, GATE_PASS_PROGRAMS, gateSpinRate } from '../render/gatePass.js';
import { compiledPass } from '../render/glProgram.js';
import { gateSceneXZ } from './gateOmen.js';
import { setEventGround } from './eventGround.js';
import { gateYaw, gatePhase, gateCountdown, countdownText, countdownWords, gateModsOf, gatePortentsOf, gateBossOf, GATE_RISE_MS, GATE_COLLAPSE_MS } from '../net/gateLaw.js';
import { marksCardModel } from '../ui/gateMarksView.js';
import { trs } from '../world/mat4.js';
import { RAY_DISTANCE } from '../player/activate.js';
import { CAPSULE_RADIUS } from '../player/motor.js';
import { adoptLight } from '../render/lightId.js';

export const GATE_BUCKET = 'wb:gate';
export const GATE_REACH = 4;
export const GATE_BANNER_M = 60;
export const GATE_LIGHT_UP = PORTAL_CENTRE_Y;
export const GATE_LIGHT_RANGE = 24;
export const GATE_OPEN_EASE = 0.6;
const NO_GATE = Object.freeze([]);
export const RISE_SLACK_M = 0.3;
export const GATE_SAY_MS = 3000;
export const GATE_STEP_M = 1.5;

export const GATE_TEXT = Object.freeze({
  name: 'Dagon\'s Breach',
  opensIn: (left) => `The gate opens in ${left}.`,
  sealed: 'The gate has sealed.',
  collapsesIn: (left) => `The gate has sealed. It collapses in ${left}.`,
  notYet: 'The gate will not open to you yet.',
});

/**
 * @param {{day:number, px:number, py:number, spot:number[], phase:string, t:{omenAt:number, riseAt:number, openAt:number, sealAt:number, wrathAt:number}, fellAt:number|null}} g
 * @param {{pixelTranslation:(px:number, py:number)=>number[], heightAt:(x:number, z:number)=>number, now:number, groundAt?:((px:number, py:number, x:number, z:number)=>number)|null}} at
 */
export function gatePlacement(g, { pixelTranslation, heightAt, now, groundAt = null }) {
  if (!g) return null;
  const [x, z] = gateSceneXZ(g, pixelTranslation(g.px, g.py));
  let ground = heightAt(x, z);
  const coarse = !Number.isFinite(ground);
  if (coarse) ground = groundAt ? groundAt(g.px, g.py, x, z) : NaN;
  if (!Number.isFinite(ground)) return null;
  const phase = gatePhase(g.t, now, g.fellAt);
  let rise = 1, fade = 1;
  if (phase === 'rising') { rise = Math.max(0, Math.min(1, (now - g.t.riseAt) / GATE_RISE_MS)); fade = rise; }
  if (phase === 'collapsing') {
    const end = Number.isFinite(g.fellAt) ? Math.min(/** @type {number} */ (g.fellAt), g.t.wrathAt) : g.t.wrathAt;
    const sink = Math.max(0, Math.min(1, (now - end) / GATE_COLLAPSE_MS));
    rise = 1 - sink; fade = 1 - sink;
  }
  if (phase === 'gone' || phase === 'quiet' || phase === 'omen') return null;
  const eased = rise * rise * (3 - 2 * rise);
  const yaw = gateYaw(g.day);
  // The crown starts `RISE_SLACK_M` below the ground at the middle and at both arch ends, so the lintel never
  // shimmers through the ground or shows early on a slope.
  let sunk = GATE_HEIGHT + RISE_SLACK_M;
  if (rise < 1 && !coarse) for (const e of [-GATE_HALF_W, GATE_HALF_W]) {
    const h = heightAt(x + Math.cos(yaw) * e, z - Math.sin(yaw) * e);
    if (Number.isFinite(h)) sunk = Math.max(sunk, GATE_HEIGHT + RISE_SLACK_M + (ground - h));
  }
  return { day: g.day, phase, origin: [x, ground - (1 - eased) * sunk, z], ground, yaw, fade, risen: rise >= 1, coarse };
}

export function openingHalfWidth(profile, y) {
  if (!(y >= ARCH_Y0 && y <= ARCH_Y1)) return 0;
  const t = ((y - ARCH_Y0) / (ARCH_Y1 - ARCH_Y0)) * (ARCH_PROFILE_N - 1);
  const i = Math.min(ARCH_PROFILE_N - 1, Math.floor(t)), j = Math.min(ARCH_PROFILE_N - 1, i + 1);
  return profile[i] + (profile[j] - profile[i]) * (t - i);
}

export function fireBox(place, profile, halfW = null) {
  const w = halfW ?? Math.max(...profile), c = Math.cos(place.yaw), s = Math.sin(place.yaw), o = place.origin;
  const min = [Infinity, o[1] + ARCH_Y0, Infinity], max = [-Infinity, o[1] + ARCH_Y1, -Infinity];
  for (const lx of [-w, w]) for (const lz of [-0.5, 0.5]) {
    const x = o[0] + c * lx + s * lz, z = o[2] - s * lx + c * lz;
    min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x); min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
  }
  return { min, max };
}

// The sample heights are the player capsule's foot sphere, middle, and head sphere; 0.9 and 1.8 must match
// `CAPSULE_HEIGHT` in `player/motor.js`.
export const SEALED_AT = Object.freeze([CAPSULE_RADIUS, 0.9, 1.8 - CAPSULE_RADIUS]);
export function inGateRoot(place, p) {
  const [lx, ly, lz] = gateLocal(place, p);
  return SEALED_AT.some((h) => insideGateStone([lx, ly + h, lz]));
}

export function gateLocal(place, p) {
  const dx = p[0] - place.origin[0], dz = p[2] - place.origin[2];
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
  return [c * dx - s * dz, p[1] - place.origin[1], s * dx + c * dz];
}

/** @param {{ renderer?: any, gl?: WebGL2RenderingContext|null, collider?: () => any, standing: () => any, pixelTranslation: (px:number, py:number) => number[], heightAt: (x:number, z:number) => number, now: () => number, feet?: () => (number[]|null), say?: (text: string) => void, banner?: (text: string|null) => void, ready?: () => boolean, enter?: (gate: any) => void, landBefore?: (gate: any) => boolean, groundAt?: ((px:number, py:number, x:number, z:number) => number)|null, marks?: (card: any) => void, arches?: any, }} deps */
export function createGatePool({
  renderer = null, gl = null, collider = () => null, standing, pixelTranslation, heightAt, now,
  feet = () => null, say = () => {}, banner = () => {}, ready = () => false, enter = () => {}, groundAt = null,
  landBefore = () => false, marks = () => {}, arches = null,
}) {
  const model = buildGateModel();
  let box = null, boxAt = null;
  const profile = gateArchProfile(model);
  let mesh = null, meshTried = false;
  let pass = null;
  const firePass = compiledPass(gl, GATE_PASS_PROGRAMS, () => new GatePassRenderer(gl, profile), (e) => console.warn('[gate] the fire would not build', e?.message ?? e));
  let place = null, g = null;
  setEventGround('gate', () => (place ? [place.origin] : null));
  let open = 0;
  let spin = 0;
  let colliderAt = null;
  let lastLz = null;
  let saidAt = -Infinity;

  let _mat = null, _matKey = '';
  const matrixOf = (p) => { const k = `${p.origin[0]},${p.origin[1]},${p.origin[2]},${p.yaw}`; if (k !== _matKey) { _matKey = k; _mat = trs(p.origin[0], p.origin[1], p.origin[2], 0, (p.yaw * 180) / Math.PI, 0); } return _mat; };
  const fireHalfW = Math.max(...profile);
  const sameMatrix = (a, b) => { if (!a || !b) return false; for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) >= 5e-4) return false; return true; };

  function ensureMesh() {
    if (mesh || meshTried || !renderer?.createMesh) return;
    meshTried = true;
    try {
      for (const [rec, art] of gateArt()) {
        renderer.uploadTexture?.(GATE_ARCHIVE, rec, art.albedo);
        renderer.uploadEmissionTexture?.(GATE_ARCHIVE, rec, art.emission, { white: true });
      }
      mesh = renderer.createMesh(model);
    } catch (e) { console.warn('[gate] the stone would not build', e?.message ?? e); mesh = null; }
  }
  function ensurePass() { pass ??= firePass(); }
  function standCollider() {
    const col = collider();
    if (!col?.addMesh) return;
    const want = place?.risen && !place.coarse ? matrixOf(place) : null;
    if (want ? sameMatrix(want, colliderAt) : colliderAt === null) return;
    col.removeBucket?.(GATE_BUCKET);
    colliderAt = null;
    if (!want) return;
    col.addMesh(GATE_BUCKET, model.positions, model.indices, want);
    colliderAt = want;
    // The collider appears whole in one frame once the stone has risen, so a player caught inside the stone is
    // moved out in front of the gate.
    const f = feet();
    if (f && g && inGateRoot(place, f)) landBefore(g);
  }
  function refuse(text) {
    const t = now();
    if (t - saidAt < GATE_SAY_MS) return;
    saidAt = t;
    say(text);
  }
  function tryEnter() {
    if (!place || !g || place.coarse) return false;
    if (place.phase === 'open') {
      if (!ready()) { refuse(GATE_TEXT.notYet); return false; }
      enter({ day: g.day, near: g.near, origin: place.origin, yaw: place.yaw, px: g.px, py: g.py, spot: g.spot });
      return true;
    }
    const cd = gateCountdown(g.t, now(), place.phase);
    refuse(cd?.to === 'open' ? GATE_TEXT.opensIn(countdownText(cd.ms)) : cd?.to === 'collapse' ? GATE_TEXT.collapsesIn(countdownText(cd.ms)) : GATE_TEXT.sealed);
    return false;
  }

  return {
    frame(dt = 0) {
      try { arches?.frame?.(dt); } catch (e) { console.warn('[eg] arches', e?.message ?? e); }
      if (arches?.stands?.()) ensurePass();
      g = standing?.() ?? null;
      place = g ? gatePlacement(g, { pixelTranslation, heightAt, now: now(), groundAt }) : null;
      const target = place?.phase === 'open' ? 1 : 0;
      open += Math.sign(target - open) * Math.min(Math.abs(target - open), GATE_OPEN_EASE * Math.max(0, dt));
      spin = (spin + gateSpinRate(open) * Math.max(0, dt)) % 1;
      if (place) { ensureMesh(); ensurePass(); }
      standCollider();
      const f = place && !place.coarse ? feet() : null;
      if (f && place.phase === 'open') {
        const [lx, ly, lz] = gateLocal(place, f);
        const inside = Math.abs(lx) < openingHalfWidth(profile, Math.max(ARCH_Y0 + 0.05, ly + 0.9)) && Math.abs(lz) < GATE_STEP_M;
        if (inside && lastLz !== null && Math.sign(lz) !== Math.sign(lastLz) && lz !== 0) tryEnter();
        lastLz = inside ? lz : null;
      } else lastLz = null;
      if (place && f && Math.hypot(f[0] - place.origin[0], f[2] - place.origin[2]) <= GATE_BANNER_M) {
        const cd = gateCountdown(g.t, now(), place.phase);
        banner(cd ? `${GATE_TEXT.name} - ${cd.to === 'collapse' ? 'sealed, ' : ''}${countdownWords(cd)}` : null);
        marks(cd && place.phase !== 'collapsing' ? marksCardModel(gateModsOf(g.day), gateBossOf(g.day), { mode: 'gate', pt: gatePortentsOf(g.day) }) : null);
      } else { banner(null); marks(null); }
      return place;
    },
    draw(r = renderer, texRemap = null) {
      const n = arches?.draw?.(r, texRemap) ?? 0;
      if (!place || place.coarse || !mesh || !r?.drawMesh) return n;
      r.drawMesh(mesh, matrixOf(place), texRemap);
      return 1 + n;
    },
    stands: () => !!pass && (!!place || !!arches?.stands?.()),
    drawPass(proj, view, eye, seconds, fog = null) {
      if (!pass) return 0;
      const list = place ? [{ origin: place.origin, yaw: place.yaw, open, fade: place.fade, spin, beaconOnly: !!place.coarse }] : [];
      for (const d of arches?.passDraws?.() ?? NO_GATE) list.push(d);
      if (!list.length) return 0;
      pass.draw(list, proj, view, eye, seconds, fog);
      return pass.drawn;
    },
    lights() {
      const al = arches?.lights?.() ?? NO_GATE;
      if (!place || place.coarse || place.fade <= 0) return al.length ? al : NO_GATE;
      const gl1 = adoptLight({ x: place.origin[0], y: place.origin[1] + GATE_LIGHT_UP, z: place.origin[2], range: GATE_LIGHT_RANGE * place.fade * (0.5 + 0.5 * open) }, place);
      return al.length ? [gl1, ...al] : [gl1];
    },
    // The target box covers the fire's slab, not the stone. A player in the threshold is inside the stone's bounds,
    // so a stone box would win every press there.
    targets() {
      const at = arches?.targets?.() ?? NO_GATE;
      if (!place || !place.risen || place.coarse) return at.length ? at : NO_GATE;
      const o = place.origin;
      if (!box || !boxAt || boxAt[0] !== o[0] || boxAt[1] !== o[1] || boxAt[2] !== o[2] || boxAt[3] !== place.yaw || boxAt[4] !== place.day) {
        boxAt = [o[0], o[1], o[2], place.yaw, place.day];
        box = [{ key: `gate:${place.day}`, aabb: fireBox(place, profile, fireHalfW), distance: RAY_DISTANCE, reach: GATE_REACH, noSurface: true }];
      }
      return at.length ? [...box, ...at] : box;
    },
    // `composeNamer` in `player/worldHover.js` takes the first answer with a `title`, so this returns a `{ title,
    // subs }` record, never a string.
    hoverName(key) {
      if (typeof key === 'string' && key.startsWith('egarch:')) return arches?.hoverName?.(key) ?? null;
      if (typeof key !== 'string' || !key.startsWith('gate:') || !place || !g) return null;
      const cd = gateCountdown(g.t, now(), place.phase);
      const words = countdownWords(cd);
      return { title: GATE_TEXT.name, subs: words ? [...(cd.to === 'collapse' ? ['Sealed'] : []), words[0].toUpperCase() + words.slice(1)] : [] };
    },
    activate(key) { if (typeof key === 'string' && key.startsWith('egarch:')) return !!arches?.activate?.(key); return typeof key === 'string' && key.startsWith('gate:') ? tryEnter() : false; },
    state: () => ({ place, open, collider: !!colliderAt, mesh: !!mesh, pass: !!pass }),
    place: () => place,
    destroyAll() {
      collider()?.removeBucket?.(GATE_BUCKET);
      arches?.downColliders?.();
      colliderAt = null; place = null; lastLz = null;
      banner(null);
    },
  };
}
