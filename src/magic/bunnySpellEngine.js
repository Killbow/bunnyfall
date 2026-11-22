// @ts-check
// BUNNY-SPELLS (2026-10-30): WHAT BUNNYFALL'S OWN EFFECTS DO IN THE SCENE - built by the cast engine (scenes/hostMagic.js),
// one per engine, so every host that casts has them (THE FOUR HOSTS RULE: the engine is the one seam they share).
//
//   METEOR        an Area at Range spell carrying it falls on the spot aimed at, from the sky or from under whatever
//                 is overhead (`meteorStart`, drawn by meteorFall.js). Its burst (`burst`) throws the enemies in
//                 it back.
//   GRAVITY WELL  where an area spell carrying it bursts, a well pulls the enemies near it toward its center for its
//                 rounds, through their own collider. Allies, companions, and staff event bosses are skipped, and an
//                 enemy inside overlapping wells is pulled only by the strongest. The pull must not use the motor's
//                 knockback: renewed every frame, it holds an enemy in its Hurt state.
//   WALL OF EARTH a box of earth rises where the caster looks (`cast`), a collider bucket of its own that stops the
//                 player and every enemy. It lasts as long as the caster's buff. It is drawn as a mound (`draw`) that
//                 settles in the last 2 seconds of a timed buff and crumbles in five steps, its box lowered with it.
//                 Other players' walls and meteors appear here too (net/peer/peerConjured.js).
//   DECOY         a double appears where the caster looks and lasts as long as the buff; enemies lose track of the
//                 caster as they do of a blending one (effects.js isBlending), and hostile enemies near it go to it
//                 (their last known place of the target, the motor's own pursuit).
//   NECROMANCY    Cheb's summons and Recall Minions (systems/necromancy/necromancy.js necroCast) - the minions appear
//                 in the world and follow the caster through scenes/necroHost.js.
//   RESCUE        the party member, companion or allied creature the caster can see (`rescue`) is brought to their side
//                 - another player through their own client (the host's `rescuePeer`), anyone this engine runs here.

import {
  METEOR_TYPE, WELL_TYPE, WALL_TYPE, DECOY_TYPE, spellHas, METEOR_HEIGHT_M, METEOR_KNOCKBACK, RESCUE_REACH_M,
  RESCUE_SET_DOWN_M, WALL_REACH_M, WALL_SIZE, DECOY_REACH_M, DECOY_LURE_M, WELL_RADIUS_M, WELL_PULL,
} from './bunnySpellLaw.js';
import { hasActiveEffect, rollDuration } from './effects.js';
import { t } from '../ui/textManager.js';
import { necroCast, isNecroSpell } from '../systems/necromancy/necromancy.js';   // CHEB'S NECROMANCY: the summons and the recall
import { sweepHeight } from '../characters/foeSpacing.js';
import { rayHit } from '../player/groundRay.js';
import { moundModel, WALL_SKIRT_M } from '../world/earthWallModel.js';
import { placePictureSource, placePicture } from '../world/placePicture.js';
import { placeNow } from '../weather/placeClimate.js';
import { spellArt } from '../render/spellArt.js';
import { createSpellDebris, MAX_STONES } from './spellDebris.js';
import { boxCorners, pushOutOfBox, createObstacles } from './conjuredObstacle.js';
import { createMeteorFall, fallSeconds } from '../worldEvents/meteorFall.js';
import { coverDistance } from '../ai/cover.js';
import { MISSILE_SPEED } from './spellcast.js';
import { seededRandom } from '../world/flatMesh.js';

/** How often a standing shape shimmers, seconds. */
const SHIMMER_S = 0.45;
/** Seconds a round lasts (a magic round, DFU's). */
const ROUND_S = 5;
/** Knockback units per classic unit (enemyMotor.js KB): the motor's own scale. */
const KB = (v) => v / 3.95;
/** How near the aim a body must pass to be picked, metres. */
const PICK_SLACK_M = 0.9;
const WALL_RISE_S = 0.4, WALL_WARN_S = 2, WALL_SETTLE_M = 0.3, WALL_TRICKLE_S = 0.3, WALL_TREMBLE_M = 0.015;
const WALL_BOX_STEP_M = 0.05;
const WALL_CRUMBLE_STEPS = 5, WALL_STEP_S = 0.32, WALL_STEP_DROP_S = 0.06, WALL_STEP_CLODS = 6;
const PLAIN = { kind: 'rock', archive: 47, record: 0 };
const CAMERA_BACK_M = 12, CAMERA_SIDE_M = 2;
const METEOR_SLANT = [30, 45];

/**
 * @param {{ collider: any, foes: () => any[], playerEntity: any, say: (s: string) => void,
 *   burstFx: (kind: string, pos: number[], o?: any) => void, glowFx?: ((kind: string, pos: number[], o?: any) => void) | null, companions?: (() => any[]) | null,
 *   rescueTarget?: ((eye: number[], dir: number[], reach: number) => ({ id: string, name: string, distance: number } | null)) | null,
 *   rescuePeer?: ((id: string) => boolean) | null, casterLevel: () => number,
 *   getTexture?: ((archive: number) => Promise<any>) | null, thud?: ((pos: number[], o?: any) => void) | null, now?: (() => number) | null,
 *   flats?: any, peerMissileGone?: ((id: string) => void) | null }} deps
 */
export function createBunnySpellEngine(deps) {
  const { collider, foes, playerEntity, say, burstFx } = deps;
  const glowFx = deps.glowFx ?? burstFx;
  const ME = '';
  const walls = new Map();
  const sinking = [];
  const stones = new Map();
  const boxes = createObstacles('bunny-wall');
  /** @type {{ at: number[] } | null} */
  let decoy = null;
  /** @type {Array<{ at: number[], left: number }>} */
  const wells = [];
  const pulls = new Map();
  let shimmer = 0;
  let seen = null;
  const meteors = createMeteorFall({ collider, getTexture: deps.getTexture, flats: deps.flats, glow: glowFx, thud: deps.thud });
  const peerMeteors = createMeteorFall({ collider, getTexture: deps.getTexture, flats: deps.flats, glow: glowFx, thud: (p, o) => deps.thud?.(p, { ...o, peer: true }) });
  let meteorN = 0, lastMeteor = null, clock = 0;
  const peerMeteorAt = new Map();

  const unit = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
  const owner = () => collider?.target?.() ?? collider;
  /** Where the aim meets a surface within `reach`, or the point `reach` along it, set down on the floor beneath. In
   *  third person the aim starts at the drawn camera, and `reach` grows by how far the camera sits behind the head. */
  function aimPoint(eye, dir, reach) {
    const u = unit(dir);
    const c = seen && seen.frames <= 2 ? seen.at : null;
    if (c) {
      const b = [eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]], along = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
      const side = Math.hypot(b[0] - u[0] * along, b[1] - u[1] * along, b[2] - u[2] * along);
      if (along > -0.5 && along <= CAMERA_BACK_M && side <= CAMERA_SIDE_M) { reach += Math.max(0, along); eye = c; }
    }
    let t = reach;
    // rayHit, not collider.raycast: the outdoor ground is not a mesh, so raycast never meets it.
    const hit = rayHit(eye, u, reach, collider);
    if (Number.isFinite(hit)) t = Math.max(0.5, hit - 0.4);
    const p = [eye[0] + u[0] * t, eye[1] + u[1] * t, eye[2] + u[2] * t];
    try {
      const down = collider.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 40);
      if (Number.isFinite(down)) p[1] = p[1] + 0.5 - down;
      else if (typeof collider.heightAt === 'function') { const g = collider.heightAt(p[0], p[2]); if (Number.isFinite(g)) p[1] = g; }
    } catch { /* where it is */ }
    return p;
  }
  /** Is the way from the eye to `to` clear? */
  function clear(eye, to) {
    const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > 0)) return true;
    const h = rayHit(eye, unit(d), len, collider);
    return !(Number.isFinite(h) && h < len - 0.3);
  }

  // ── METEOR ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function overhead(at) {
    const o = [at[0], at[1] + 0.3, at[2]], u = [0, 1, 0];
    let h = Infinity;
    try { const m = collider.raycast(o, u, METEOR_HEIGHT_M); if (Number.isFinite(m) && m >= 0) h = m; } catch {}
    return Math.min(h, coverDistance(collider, o, u, METEOR_HEIGHT_M));
  }
  function fallClear(from, at) {
    const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]], len = Math.hypot(d[0], d[1], d[2]), u = unit(d);
    const g = typeof collider.heightAt === 'function' ? collider.heightAt(from[0], from[2]) : NaN;
    if (Number.isFinite(g) && g >= from[1]) return false;
    return !(Math.min(rayHit(from, u, len, collider), coverDistance(collider, from, u, len)) < len - 0.5);
  }
  function meteorPath(eye, dir, seed) {
    const to = aimPoint(eye, dir, 80), rnd = seededRandom(seed), up = overhead(to);
    if (Number.isFinite(up)) return { from: [to[0], to[1] + Math.max(1, up - 0.3), to[2]], to, indoor: true };
    const f = unit([dir[0], 0, dir[2]]), slant = ((METEOR_SLANT[0] + Math.sqrt(rnd()) * (METEOR_SLANT[1] - METEOR_SLANT[0])) * Math.PI) / 180;
    const side = (rnd() < 0.5 ? -1 : 1) * (25 + rnd() * 25), out = METEOR_HEIGHT_M * Math.tan(slant);
    for (const deg of [side, -side, 0, 70, -70, 35, -35]) {
      const a = (deg * Math.PI) / 180, h = [f[0] * Math.cos(a) - f[2] * Math.sin(a), 0, f[0] * Math.sin(a) + f[2] * Math.cos(a)];
      const from = [to[0] + h[0] * out, to[1] + METEOR_HEIGHT_M, to[2] + h[2] * out];
      if (fallClear(from, to)) return { from, to, indoor: false };
    }
    return { from: [to[0], to[1] + METEOR_HEIGHT_M, to[2]], to, indoor: false };
  }
  function meteorStart(sp, eye, dir) {
    if (!spellHas(sp, METEOR_TYPE) || sp.rangeType !== 4) return null;
    const seed = (Math.random() * 0x7fffffff) | 0, { from, to, indoor } = meteorPath(eye, dir, seed);
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], speed = Math.hypot(d[0], d[1], d[2]) / (fallSeconds(from, to, indoor) * MISSILE_SPEED);
    meteors.launch({ from, to, element: sp.element, seed, indoor });
    meteorN = (meteorN % 65535) + 1;
    lastMeteor = { n: meteorN, from: [...from], to: [...to], el: sp.element, seed, age: 0 };
    return { pos: from, dir: unit(d).map((v) => v * speed), to, indoor };
  }

  // ── BURSTS: Meteor's throw, Gravity Well's opening ─────────────────────────────────────────────────────────────
  function burst(pos, spell, radius) {
    if (spellHas(spell, METEOR_TYPE)) {
      for (const f of foes()) {
        const p = f?.ai?.feet;
        if (!p || f.dead || f.puppet) continue;
        const d = [p[0] - pos[0], 0, p[2] - pos[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > radius + 1) continue;
        const u = dist > 0.01 ? [d[0] / dist, 0.35, d[2] / dist] : [0, 1, 0];
        f.ai.knockbackSpeed = Math.max(f.ai.knockbackSpeed ?? 0, KB(METEOR_KNOCKBACK));
        f.ai.knockbackDir = unit(u);
      }
    }
    if (spellHas(spell, WELL_TYPE)) {
      const e = spell.effects.find((x) => x?.type === WELL_TYPE);
      const rounds = Math.max(1, rollDuration(e, deps.casterLevel()));
      wells.push({ at: [pos[0], pos[1], pos[2]], left: rounds * ROUND_S });
      say(t('spell.bunny.wellOpens', 'A well of gravity opens.'));
    }
  }

  // ── WALL OF EARTH and DECOY: placed at the cast ───────────────────────────────────────────────────────────────
  const wallBox = (at, f) => ({ at, f, r: [f[2], 0, -f[0]], hw: WALL_SIZE.w / 2, hd: WALL_SIZE.d / 2, y0: at[1] - 0.3, y1: at[1] + WALL_SIZE.h });
  const newWall = (stood, at, f, seed, src) => ({ ...stood, at, dir: f, age: 0, seed, mesh: null, mat: new Float32Array(16), gpu: null, trickle: 0, warn: false, warnAge: 0, settle: 0, src });
  function raiseWall(eye, dir) {
    dropWall(ME);
    const at = aimPoint(eye, dir, WALL_REACH_M);
    const f = unit([dir[0], 0, dir[2]]);
    const box = wallBox(at, f);
    const positions = boxCorners(box);
    const o = owner();
    pushOutOfBox(collider, [...(deps.companions?.() ?? []), ...foes()], box);
    const stood = boxes.stand(o, positions);
    if (!stood) return;
    const wall = newWall(stood, at, f, boxes.seq, placePictureSource(placeNow(at)));
    walls.set(ME, wall);
    earthBurst(wall, { sound: 'earthRise', heard: 40, shake: 2 });
  }
  function dropWall(id = ME, sink = true) {
    const wall = walls.get(id);
    if (!wall) return;
    if (sink) deps.thud?.([wall.at[0], wall.at[1] + 0.5, wall.at[2]], wall.peer ? { sound: 'earthSlide', heard: 30, peer: true } : { sound: 'earthSlide', heard: 30 });
    if (sink && wall.mesh) {
      sinking.push({ ...wall, age: 0, settle: wall.settle + (1 - riseShare(wall.age)) * (WALL_SIZE.h + WALL_SKIRT_M), steps: 0 });
    } else {
      boxes.remove(wall);
      freeMesh(wall);
    }
    walls.delete(id);
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  function stonesOf(w) {
    const k = `${w.src.kind}:${w.src.archive}:${w.src.record}`;
    if (!stones.has(k)) stones.set(k, { src: w.src, debris: createSpellDebris({ collider }), art: null });
    return stones.get(k).debris;
  }
  function throwStone(w, ...a) {
    let n = 0, old = null;
    for (const s of stones.values()) { n += s.debris.count; if (s.debris.count && (!old || s.debris.first < old.first)) old = s.debris; }
    if (n >= MAX_STONES) old.drop();
    stonesOf(w).throw(...a);
  }
  function earthBurst(w, o) {
    deps.thud?.([w.at[0], w.at[1] + 0.5, w.at[2]], o);
    const f = w.dir, r = [f[2], 0, -f[0]];
    for (let i = 0; i < 18; i++) {
      const a = (Math.random() - 0.5) * WALL_SIZE.w, side = i % 2 ? 1 : -1, out = rand(0.8, 3);
      throwStone(w, [w.at[0] + r[0] * a + f[0] * side * 0.4, w.at[1] + 0.15, w.at[2] + r[2] * a + f[2] * side * 0.4],
        [f[0] * side * out + rand(-0.5, 0.5), rand(3, 6), f[2] * side * out + rand(-0.5, 0.5)], rand(0.08, 0.2), w.at[1]);
    }
  }

  const riseShare = (age) => 1 - (1 - Math.min(1, Math.max(0, age) / WALL_RISE_S)) ** 3;
  function wallArt(r, src) {
    const a = spellArt(r, src, (s) => placePicture(s, deps.getTexture), PLAIN);
    return a && { key: a.key, mound: a.art, tile: src.tile, tileV: src.tileV ?? src.tile };
  }
  function freeMesh(w) {
    if (w.mesh) { try { w.gpu?.destroyMesh?.(w.mesh); } catch {} }
    w.mesh = null;
  }
  function buildMesh(r, w, art) {
    if (w.mesh && w.artKey === art.key) return true;
    if (w.mesh) freeMesh(w);
    try { w.mesh = r.createMesh(moundModel(w.seed, art)); } catch (e) { console.warn('[spells] Failed to build Wall of Earth mesh', e?.message ?? e); return false; }
    w.gpu = r; w.artKey = art.key;
    return true;
  }
  function drawMound(r, w, sunk, shake = [0, 0]) {
    const f = w.dir, x = [f[2], 0, -f[0]];
    w.mat.set([x[0], 0, x[2], 0, 0, 1, 0, 0, f[0], 0, f[2], 0,
      w.at[0] + x[0] * shake[0] + f[0] * shake[1], w.at[1] - sunk, w.at[2] + x[2] * shake[0] + f[2] * shake[1], 1]);
    r.drawMesh(w.mesh, w.mat);
  }
  function crumbleSunk(s, t) {
    const share = (WALL_SIZE.h + 0.3 - s.settle) / WALL_CRUMBLE_STEPS;
    const step = Math.min(WALL_CRUMBLE_STEPS - 1, Math.floor(t / WALL_STEP_S)), into = t - step * WALL_STEP_S;
    return s.settle + share * (step + Math.min(1, into / WALL_STEP_DROP_S));
  }
  function draw(r) {
    const cp = r?._camPos;
    if (cp && cp.length === 3 && [...cp].every(Number.isFinite)) seen = { at: [cp[0], cp[1], cp[2]], frames: 0 };
    let drew = meteors.draw(r);
    if (peerMeteors.draw(r)) drew = true;
    if ((!walls.size && !sinking.length && !stones.size) || !r?.createMesh || !r.drawMesh) return drew;
    for (const s of sinking) {
      if (s.mesh) drawMound(r, s, crumbleSunk(s, s.age));
      drew = true;
    }
    for (const s of stones.values()) {
      const a = wallArt(r, s.src);
      if (a) s.art = a;
      if (s.art && s.debris.draw(r, s.art.key, s.art.mound)) drew = true;
    }
    for (const wall of walls.values()) {
      const a = wallArt(r, wall.src);
      if (!a || !buildMesh(r, wall, a)) continue;
      const t = wall.age;
      const shake = wall.warn ? [WALL_TREMBLE_M * Math.sin(t * 41) * Math.sin(t * 7.3), WALL_TREMBLE_M * 0.6 * Math.sin(t * 33 + 1.7)] : [0, 0];
      drawMound(r, wall, wall.settle + (1 - riseShare(wall.age)) * (WALL_SIZE.h + WALL_SKIRT_M), shake);
      drew = true;
    }
    return drew;
  }
  function shedClods(w, crest, n) {
    if (!(crest > 0.2)) return;
    const f = w.dir, x = [f[2], 0, -f[0]];
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * WALL_SIZE.w * 0.9, side = Math.random() < 0.5 ? 1 : -1;
      throwStone(w, [w.at[0] + x[0] * a + f[0] * side * 0.25, w.at[1] + crest, w.at[2] + x[2] * a + f[2] * side * 0.25],
        [f[0] * side * rand(0.5, 1.5) + x[0] * rand(-0.4, 0.4), rand(0.3, 1.2), f[2] * side * rand(0.5, 1.5) + x[2] * rand(-0.4, 0.4)], rand(0.12, 0.28), w.at[1]);
    }
  }
  /** A magic round is one game minute, so the last round ends with this minute; with no clock, warn the whole round. */
  function endingSoon() {
    if (!lastRound()) return false;
    const m = Number(deps.now?.());
    if (!Number.isFinite(m)) return true;
    return (1 - (m - Math.floor(m))) * ROUND_S <= WALL_WARN_S;
  }
  function lastRound() {
    const e = playerEntity?.activeEffects?.find((a) => a.kind === 'wallOfEarth' && !a.ended);
    return !!e && !e.heldItem && e.roundsRemaining <= 0;
  }
  function trickle(w) {
    const r = [w.dir[2], 0, -w.dir[0]], f = w.dir;
    for (let i = 0; i < 2; i++) {
      const a = (Math.random() - 0.5) * WALL_SIZE.w * 0.9, side = Math.random() < 0.5 ? 1 : -1;
      for (let k = 0; k < 3; k++) throwStone(w, [w.at[0] + r[0] * a + f[0] * side * 0.2, w.at[1] + WALL_SIZE.h - w.settle - 0.1, w.at[2] + r[2] * a + f[2] * side * 0.2],
        [f[0] * side * rand(0.4, 1) + rand(-0.3, 0.3), rand(0, 0.8), f[2] * side * rand(0.4, 1) + rand(-0.3, 0.3)], rand(0.08, 0.16), w.at[1]);
    }
  }
  /** A caster-only cast just landed (the cast engine's CasterOnly arm): what it placed, where the caster looks. */
  function cast(sp, eye, dir) {
    // CHEB'S NECROMANCY (systems/necromancy/necromancy.js): a summon or a recall in the spell, wherever the caster looks
    if (isNecroSpell(sp)) { try { necroCast(sp, { entity: playerEntity, level: deps.casterLevel(), say }); } catch (e) { console.warn('[necromancy] the cast', e?.message ?? e); } }
    if (!eye || !dir) return;
    if (spellHas(sp, WALL_TYPE) && hasActiveEffect(playerEntity, 'wallOfEarth')) raiseWall(eye, dir);
    if (spellHas(sp, DECOY_TYPE) && hasActiveEffect(playerEntity, 'decoy')) {
      decoy = { at: aimPoint(eye, dir, DECOY_REACH_M) };
      burstFx('magic', [decoy.at[0], decoy.at[1] + 1, decoy.at[2]], { power: 1, heard: 30 });
    }
  }

  // ── RESCUE ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The body the aim passes nearest along it, within reach and in sight: `{ rec, feet, name }`. */
  function pickBody(eye, dir, bodies) {
    const u = unit(dir);
    let best = null, bestT = Infinity;
    for (const b of bodies) {
      const f = b.feet;
      const h = b.height ?? 1.8;
      const mid = [f[0], f[1] + h * 0.55, f[2]];
      const v = [mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]];
      const t = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      if (!(t > 0) || t > RESCUE_REACH_M || t >= bestT) continue;
      const off = Math.hypot(v[0] - u[0] * t, v[1] - u[1] * t, v[2] - u[2] * t);
      if (off > PICK_SLACK_M + h * 0.3) continue;
      if (!clear(eye, mid)) continue;
      best = b; bestT = t;
    }
    return best;
  }
  /** Where a rescued body is set down: a step in front of the caster, on the floor. */
  function setDownAt(feet, eye, dir) {
    const f = unit([dir[0], 0, dir[2]]);
    const p = [feet[0] + f[0] * RESCUE_SET_DOWN_M, feet[1], feet[2] + f[2] * RESCUE_SET_DOWN_M];
    try { const c = owner().findClearFloor?.(p); if (c) return c; } catch { /* the step itself */ }
    return p;
  }
  /** Cast: the one the caster sees is brought to them. Answers whether anyone was. */
  function rescue(eye, dir, feet) {
    if (!eye || !dir || !feet) { say(t('spell.bunny.noRescue', 'There is no one in sight to rescue.')); return false; }
    // another player first (their own client moves them: the host's door)
    const peer = deps.rescueTarget?.(eye, dir, RESCUE_REACH_M) ?? null;
    if (peer && deps.rescuePeer?.(peer.id)) { say(t('spell.bunny.rescueCall', 'You call {name} to your side.', { name: peer.name })); return true; }
    const bodies = [];
    for (const c of deps.companions?.() ?? []) {
      const f = c?.ai?.feet;
      if (c && !c.dead && !c.puppet && Array.isArray(f)) bodies.push({ rec: c, feet: f, height: c.ai.height, name: c.entity?.name || 'your companion' });
    }
    for (const c of foes()) {
      const f = c?.ai?.feet;
      const allied = (c?.entity?.mobileTeam ?? c?.entity?.basics?.team) === 'PlayerAlly';
      if (c && !c.dead && !c.puppet && allied && Array.isArray(f)) bodies.push({ rec: c, feet: f, height: c.ai.height, name: c.entity?.name || 'your ally' });
    }
    const hit = pickBody(eye, dir, bodies);
    if (!hit) { say(t('spell.bunny.noRescue', 'There is no one in sight to rescue.')); return false; }
    const to = setDownAt(feet, eye, dir);
    const ai = hit.rec.ai;
    burstFx('magic', [hit.feet[0], hit.feet[1] + 1, hit.feet[2]], { power: 0.8, heard: 30 });
    ai.feet[0] = to[0]; ai.feet[1] = to[1]; ai.feet[2] = to[2];
    if (ai.knockbackSpeed) ai.knockbackSpeed = 0;
    burstFx('magic', [to[0], to[1] + 1, to[2]], { power: 0.8, heard: 30 });
    say(t('spell.bunny.rescuePull', 'You pull {name} to your side.', { name: hit.name }));
    return true;
  }

  // ── THE FRAME ──────────────────────────────────────────────────────────────────────────────────────────────────
  function update(dt) {
    if (seen) seen.frames++;
    clock += dt;
    if (lastMeteor) lastMeteor.age += dt;
    if (walls.has(ME) && !hasActiveEffect(playerEntity, 'wallOfEarth')) dropWall(ME);
    if (decoy && !hasActiveEffect(playerEntity, 'decoy')) decoy = null;
    shimmer -= dt;
    const glow = shimmer <= 0;
    if (glow) shimmer = SHIMMER_S;
    if (decoy) {
      if (glow) glowFx('magic', [decoy.at[0], decoy.at[1] + 1, decoy.at[2]], { scale: 0.6, power: 0.3 });
      for (const f of foes()) {
        const p = f?.ai?.feet;
        if (!p || f.dead || f.puppet || !f.ai.isHostile) continue;
        if (Math.hypot(p[0] - decoy.at[0], p[2] - decoy.at[2]) > DECOY_LURE_M) continue;
        f.ai.lastKnownTargetPos = [decoy.at[0], decoy.at[1], decoy.at[2]];
      }
    }
    for (const wall of walls.values()) {
      wall.age += dt;
      // Once begun, a warning holds through the buff's last round, even when endingSoon() turns false.
      const warned = wall.warn;
      wall.warn = wall.peer ? warned || (wall.warnSaid && wall.age > WALL_RISE_S) : wall.age > WALL_RISE_S && (warned ? lastRound() : endingSoon());
      if (wall.warn && !warned) deps.thud?.([wall.at[0], wall.at[1] + 0.5, wall.at[2]], wall.peer ? { sound: 'earthSettle', heard: 25, peer: true } : { sound: 'earthSettle', heard: 25 });
      if (wall.warn) {
        wall.warnAge += dt;
        wall.settle = WALL_SETTLE_M * Math.min(1, wall.warnAge / WALL_WARN_S) ** 1.5;
        if (wall.settle - wall.boxSunk >= WALL_BOX_STEP_M) boxes.lower(wall, wall.settle);
        if ((wall.trickle -= dt) <= 0) { wall.trickle = WALL_TRICKLE_S; trickle(wall); }
      }
    }
    for (let i = sinking.length - 1; i >= 0; i--) {
      const s = sinking[i];
      s.age += dt;
      if (s.steps < WALL_CRUMBLE_STEPS && s.age >= s.steps * WALL_STEP_S) {
        shedClods(s, WALL_SIZE.h - crumbleSunk(s, s.steps * WALL_STEP_S), WALL_STEP_CLODS);
        boxes.lower(s, crumbleSunk(s, s.steps * WALL_STEP_S + WALL_STEP_DROP_S));
        s.steps++;
      }
      if (s.age >= WALL_CRUMBLE_STEPS * WALL_STEP_S) { boxes.lower(s, Infinity); freeMesh(s); sinking.splice(i, 1); }
    }
    for (const [k, s] of stones) { s.debris.step(dt); if (!s.debris.count) { s.debris.free(); stones.delete(k); } }
    meteors.step(dt);
    peerMeteors.step(dt);
    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      w.left -= dt;
      if (w.left <= 0) { wells.splice(i, 1); continue; }
      if (glow) glowFx('magic', [w.at[0], w.at[1] + 0.5, w.at[2]], { scale: 0.8, power: 0.4, area: WELL_RADIUS_M * 0.4 });
      for (const f of foes()) {
        const ai = f?.ai, p = ai?.feet;
        if (!p || f.dead || f.puppet || f.entity?.staffBoss || !ai.collider?.move) continue;
        if (f.companion != null || f.entity?.team === 'PlayerAlly') continue;
        const d = [w.at[0] - p[0], 0, w.at[2] - p[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > WELL_RADIUS_M || dist < 0.8) continue;
        const step = Math.min(WELL_PULL * dt, dist - 0.8);
        if (step > (pulls.get(f)?.step ?? 0)) pulls.set(f, { step, x: d[0] / dist, z: d[2] / dist });
      }
    }
    for (const [f, q] of pulls) {
      const ai = f.ai;
      ai.collider.move(ai.feet, q.x * q.step, 0, q.z * q.step, sweepHeight(ai), !(ai.flies || ai.swims || ai.levitating));
    }
    pulls.clear();
  }

  /** A floating origin's shift: every place this engine keeps moves with the scene. */
  function shift(o) {
    for (const p of [...[...walls.values()].map((w) => w.at), decoy?.at, seen?.at, lastMeteor?.from, lastMeteor?.to, ...wells.map((w) => w.at), ...sinking.map((s) => s.at)]) if (p) { p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; }
    for (const s of stones.values()) s.debris.shift(o);
    meteors.shift(o);
    peerMeteors.shift(o);
    for (const [id, s] of walls) if (s.key && !boxes.move(s, o)) { freeMesh(s); walls.delete(id); }
    for (const s of sinking) if (s.key) boxes.move(s, o);
  }
  /** The scene is leaving: nothing stands in the next. */
  function clearAll() {
    for (const id of [...walls.keys()]) dropWall(id, false);
    for (const s of sinking) { boxes.lower(s, Infinity); freeMesh(s); }
    for (const s of stones.values()) s.debris.clear();
    stones.clear();
    meteors.clear();
    peerMeteors.clear();
    sinking.length = 0; decoy = null; wells.length = 0; seen = null; lastMeteor = null; peerMeteorAt.clear();
  }

  function peerWall(peer, spec, me = null) {
    if (walls.get(peer)?.seed === spec.id) return null;
    dropWall(peer);
    const box = wallBox([...spec.at], spec.f), body = me ? { ai: { feet: [...me.feet], radius: me.radius, height: me.height } } : null;
    const stuck = pushOutOfBox(collider, [...(deps.companions?.() ?? []), ...foes(), ...(body ? [body] : [])], box);
    const corners = boxCorners(box);
    const stood = (!body || !stuck.includes(body) ? boxes.stand(owner(), corners) : null) ?? { key: null, owner: owner(), positions: corners, boxSunk: 0 };
    const wall = { ...newWall(stood, box.at, spec.f, spec.id, spec.src), peer: true, warnSaid: !!spec.warn };
    walls.set(peer, wall);
    if (spec.risen) { wall.age = WALL_RISE_S; wall.warn = !!spec.warn; } else earthBurst(wall, { sound: 'earthRise', heard: 40, shake: 2, peer: true });
    const f = body?.ai.feet;
    return f && (f[0] !== me.feet[0] || f[2] !== me.feet[2]) ? f : null;
  }
  const peerWallUp = (peer, id) => walls.get(peer)?.seed === id;
  function peerWallWarn(peer) { const w = walls.get(peer); if (w?.peer) w.warnSaid = true; }
  function peerWallEnd(peer) { if (walls.get(peer)?.peer) dropWall(peer); }
  function peerClear() { for (const [id, w] of walls) if (w.peer) dropWall(id, false); }
  function peerMeteor(peer, { from, to, element, seed, indoor }) {
    peerMeteors.launch({ from, to, element, seed, indoor });
    deps.peerMissileGone?.(peer);
    peerMeteorAt.set(peer, clock);
    if (peerMeteorAt.size > 64) for (const [id, t] of peerMeteorAt) if (clock - t > 1) peerMeteorAt.delete(id);
  }
  const peerMeteorJust = (peer) => peer != null && clock - (peerMeteorAt.get(peer) ?? -Infinity) < 0.5;
  function wallOut() { const w = walls.get(ME); return w ? { id: w.seed, at: w.at, f: w.dir, warn: w.warn, src: w.src } : null; }
  const meteorOut = () => lastMeteor;
  const conjured = { peerWall, peerWallUp, peerWallWarn, peerWallEnd, peerClear, peerMeteor, peerMeteorJust, wallOut, meteorOut };

  return { meteorStart, burst, cast, rescue, update, draw, shift, clearAll, meteors, conjured };
}
