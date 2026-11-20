// BUNNYFALL: THE GRAPPLING HOOK. The owner: "the grappling hook, wich can be used to fire in a direction and be pulled
// there with a cooldown".
//
// Held in the hand like a dagger (combat/fpsWeapon.js weaponTypeForItem) and never swung: the weapon rig hands the click
// here (grappleClick) instead of to the machine, and plays the hook's own frames (grappleFrame). The throw leaves on the
// throw frame. From there the PLAYER MOTOR runs it (player/motor.js `_step`, one hook: grappleStep), because the motor
// is the one thing in every host that knows the eye, the look, the collider and the body:
//   - THE THROW: a ray along the look from the eye, GRAPPLE_RANGE long, against the meshes and (outdoors) the terrain.
//     What it meets is the mark; nothing met, the hook flies out, falls short and is reeled in.
//   - THE MARK: a floor or a top (its normal up) - the body is set standing on it; a wall - onto the top just over the
//     hook when there is one within reach, else hanging under the hook against the wall. The place must hold the
//     body's capsule (player/parkour.js capsuleFits), nudged up or back toward the thrower if it does not; and indoors
//     it must lie inside the place's own bounds. No place that holds the body, no pull: the hook comes back.
//   - THE PULL: the body is moved toward the mark by the collider's own capsule sweep (collider.move), so it slides
//     along what it meets and never passes through it; a pull that stops making way ends where it is. While it pulls
//     there is no gravity and no fall: the fall's start is re-set every step, so a pull bills no falling damage (a
//     drop after it is billed from where it ended). Jump lets go. A body moved by anything else meanwhile (a
//     teleport, a door, the world's origin moving) ends it.
//   - THE REST: GRAPPLE_COOLDOWN_S after a throw that caught, GRAPPLE_MISS_COOLDOWN_S after one that did not, counted
//     on the motor's own clock (a paused game does not count it down). ui/heavyGearOverlay.js shows it, and the rope.

import { t } from '../../systems/textManager.js';
import { capsuleFits } from '../../player/parkour.js';
import {
  GRAPPLE_RANGE, HOOK_SPEED, PULL_SPEED, GRAPPLE_COOLDOWN_S, GRAPPLE_MISS_COOLDOWN_S, PULL_ARRIVE, FLOOR_NORMAL_Y,
  LEDGE_REACH,
} from '../../characters/heavyGearIds.js';

/** The hook's frames (combat/heavyGearArt.js, the owner's GIF's own timings, ms): the rest, the wind-up, the throw
 *  with the rope leaving (frame 3 - the hook leaves on it), the recovery. */
export const GRAPPLE_FRAME_MS = Object.freeze([200, 70, 60, 40, 60, 80, 120]);
export const GRAPPLE_THROW_FRAME = 3;
const THROW_AT = GRAPPLE_FRAME_MS.slice(0, GRAPPLE_THROW_FRAME).reduce((a, b) => a + b, 0) / 1000;
const ANIM_END = GRAPPLE_FRAME_MS.reduce((a, b) => a + b, 0) / 1000;
/** A miss: how long the hook takes to come back. */
const REEL_S = 0.35;
const BODY_RADIUS = 0.35;
const UP = Object.freeze([0, 1, 0]);

const G = {
  clock: 0,            // the motor's clock, seconds
  readyAt: 0,          // when the next throw may leave
  restLen: 0,          // the rest the last throw left (for the ring)
  held: false,         // the hook is in the hand, drawn
  anim: -1,            // the hand's clock (seconds since the click), -1 at rest
  released: false,     // the throw has left this animation
  wanted: false,       // a throw is owed to the next motor step
  hook: null,          // { pos, from, to, dir, dist, travelled, caught, path, reel }
  pull: null,          // { path, i, t, limit, stuck, last }
  say: null,
};

/** The rig's word door, for the hook's few lines. */
export function bindGrappleSay(say) { G.say = typeof say === 'function' ? say : null; }
const say = (line) => { try { G.say?.(line); } catch { /* words are not the hook's problem */ } };

/** The rig, every frame: is the hook in the hand and drawn? */
export function setGrappleHeld(held) { G.held = !!held; if (!held && !G.released) G.anim = -1; }
/** Seconds of rest left, and the whole rest it is part of. */
export const grappleCooldownLeft = () => Math.max(0, G.readyAt - G.clock);
export const grappleCooldownTotal = () => G.restLen;
const busy = () => !!(G.hook || G.pull);

/** The rig, on the attack button: `pressed` the button's press edge. Starts the throw's animation when the hook may go. */
export function grappleClick(pressed) {
  if (!pressed || !G.held) return false;
  if (G.anim >= 0 || busy()) return false;
  if (grappleCooldownLeft() > 0) { say(t('grapple.coiling', 'The rope is still being coiled.')); return false; }
  G.anim = 0; G.released = false;
  return true;
}

/** The rig, every frame: the hand's clock, and the throw owed on its throw frame. Answers the frame to draw. */
export function grappleFrame(dt) {
  if (G.anim < 0) return 0;
  G.anim += Math.max(0, dt || 0);
  if (!G.released && G.anim >= THROW_AT) { G.released = true; G.wanted = true; }
  if (G.anim >= ANIM_END) { G.anim = -1; G.released = false; return 0; }
  let ms = G.anim * 1000;
  for (let i = 0; i < GRAPPLE_FRAME_MS.length; i++) { if (ms < GRAPPLE_FRAME_MS[i]) return i; ms -= GRAPPLE_FRAME_MS[i]; }
  return 0;
}

/** What the overlay draws: the hook's place (null when it is in the hand), whether it pulls, and the rest. */
export function grappleView() {
  return {
    held: G.held,
    hook: G.hook ? G.hook.pos : G.pull ? G.pull.anchor : null,
    pulling: !!G.pull,
    cooldownLeft: grappleCooldownLeft(),
    cooldownTotal: G.restLen,
  };
}

/** End it all at once (a scene torn down, a death). */
export function cancelGrapple() { G.hook = null; G.pull = null; G.wanted = false; }

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const groundAt = (c, x, z) => { const h = c?.heightAt?.(x, z); return Number.isFinite(h) ? h : -Infinity; };

/** The first thing the throw meets: `{ dist, normal }`, or null. The meshes by their ray, the terrain by a march (the
 *  mesh ray never sees bare ground - collider.js surfaceHit says why). */
export function castHook(c, eye, dir, range = GRAPPLE_RANGE) {
  let best = null;
  const out = { dist: Infinity, key: null, normal: [0, 0, 0] };
  const h = c?.raycastHit?.(eye, dir, range, null, out);
  if (h && Number.isFinite(h.dist) && h.dist <= range) best = { dist: h.dist, normal: [...h.normal] };
  if (Number.isFinite(groundAt(c, eye[0], eye[2]))) {
    const lim = best ? best.dist : range;
    let prev = 0;
    for (let s = 0.5; s <= lim + 1e-6; s += 0.5) {
      const p = add(eye, dir, s);
      if (p[1] <= groundAt(c, p[0], p[2])) {
        let lo = prev, hi = s;   // the crossing, to a few centimetres
        for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; const q = add(eye, dir, mid); if (q[1] <= groundAt(c, q[0], q[2])) hi = mid; else lo = mid; }
        const at = add(eye, dir, hi);
        best = { dist: hi, normal: c.groundNormal ? c.groundNormal(at[0], at[2]) : [0, 1, 0] };
        break;
      }
      prev = s;
    }
  }
  return best;
}

/** Is a place inside the world the collider holds? Outdoors (a terrain under it) any place is; indoors, inside the
 *  bounds of what is built, by a metre. */
function insideWorld(c, p) {
  if (Number.isFinite(groundAt(c, p[0], p[2]))) return true;
  const b = c?.bounds?.();
  if (!b) return true;
  for (let k = 0; k < 3; k++) if (p[k] < b.min[k] - 1 || p[k] > b.max[k] + 1) return false;
  return true;
}

/** A place near `p` the body fits in: as it is, a little higher, or a little back toward `back`. */
function fitNear(c, p, height, back) {
  const fits = (q) => insideWorld(c, q) && (!c?.penetrationAt || capsuleFits(c, q, height));
  for (let up = 0; up <= 3; up++) {
    for (let k = 0; k <= 6; k++) {
      const q = [p[0] + back[0] * 0.3 * k, p[1] + 0.25 * up, p[2] + back[2] * 0.3 * k];
      if (fits(q)) return q;
    }
  }
  return null;
}

/** Where the body is to end, and the way there (the motor's feet). `hit` the hook's point, `n` the surface's normal,
 *  `dir` the throw's. Null when no place there holds it. */
export function pullPlan(c, feet, height, hit, n, dir) {
  const back = unit([-dir[0], 0, -dir[2]]);
  if (n[1] >= FLOOR_NORMAL_Y) {
    const dest = fitNear(c, [hit[0], hit[1] + 0.02, hit[2]], height, back);
    if (!dest) return null;
    return dest[1] > feet[1] + 0.3 ? [add(dest, UP, 0.35), dest] : [dest];
  }
  const nh = unit([n[0], 0, n[2]]);
  // a wall: the top over the hook, if a hand there would find one
  const probe = [hit[0] - nh[0] * (BODY_RADIUS + 0.15), hit[1] + LEDGE_REACH + 0.3, hit[2] - nh[2] * (BODY_RADIUS + 0.15)];
  const down = c?.surfaceHit?.(probe, [0, -1, 0], LEDGE_REACH + 0.8) ?? c?.raycastHit?.(probe, [0, -1, 0], LEDGE_REACH + 0.8);
  if (down && Number.isFinite(down.dist)) {
    const top = [probe[0], probe[1] - down.dist + 0.02, probe[2]];
    const flat = !down.normal || down.normal[1] >= FLOOR_NORMAL_Y;
    if (flat && top[1] >= hit[1] - 0.3 && c?.penetrationAt && capsuleFits(c, top, height)) {
      const lip = [hit[0] + nh[0] * (BODY_RADIUS + 0.1), top[1] + 0.3, hit[2] + nh[2] * (BODY_RADIUS + 0.1)];
      return [lip, top];
    }
  }
  // no top: hang under the hook, against the wall
  const hang = [hit[0] + nh[0] * (BODY_RADIUS + 0.08), Math.max(hit[1] - (height - 0.2), groundAt(c, hit[0], hit[2])), hit[2] + nh[2] * (BODY_RADIUS + 0.08)];
  const dest = fitNear(c, hang, height, nh);
  return dest ? [dest] : null;
}

/** May the body throw now? Not riding, levitating, on a wall or a ledge, held by a teleport's settle or knocked down. */
function bodyFree(m) {
  return !(m.riding || m.levitating || m.climb?.isClimbing || m._wall || m._pkMove || m.freezeMotor > 0 || m._downLeft > 0);
}

function launch(m, yaw, pitch) {
  if (!bodyFree(m)) { say(t('grapple.cannot', 'You cannot throw the hook now.')); return; }
  const c = m.collider;
  const eye = m.eye;
  const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const from = add(eye, dir, 0.5);
  const hit = castHook(c, eye, dir);
  const plan = hit ? pullPlan(c, m.pos, m.height, add(eye, dir, hit.dist), hit.normal, dir) : null;
  const to = hit ? add(eye, dir, hit.dist) : add(eye, dir, GRAPPLE_RANGE * 0.8);
  const caught = !!plan;
  G.restLen = caught ? GRAPPLE_COOLDOWN_S : GRAPPLE_MISS_COOLDOWN_S;
  G.readyAt = G.clock + G.restLen;
  G.hook = { pos: [...from], from, to, dir, dist: Math.max(0.5, dist(from, to)), travelled: 0, caught, path: plan, reel: -1, body: m, last: [...m.pos] };
  if (!hit) say(t('grapple.nothing', 'The hook finds nothing to catch.'));
  else if (!plan) say(t('grapple.noHold', 'The hook catches, but there is no footing for you there.'));
}

function hookStep(m, dt) {
  const h = G.hook;
  if (h.body !== m || dist(m.pos, h.last) > 1) { G.hook = null; return; }   // another body, or this one moved by something else (a door, a teleport, the world's origin): the throw is void
  h.last = [...m.pos];
  if (h.reel >= 0) {   // a miss coming back to the hand
    h.reel += dt;
    const k = Math.min(1, h.reel / REEL_S);
    const hand = add(m.eye, h.dir, 0.5);
    h.pos = add(h.to, [hand[0] - h.to[0], hand[1] - h.to[1], hand[2] - h.to[2]], k);
    if (k >= 1) G.hook = null;
    return;
  }
  h.travelled = Math.min(h.dist, h.travelled + HOOK_SPEED * dt);
  h.pos = add(h.from, unit([h.to[0] - h.from[0], h.to[1] - h.from[1], h.to[2] - h.from[2]]), h.travelled);
  if (h.travelled < h.dist) return;
  if (!h.caught) { h.reel = 0; return; }
  const total = dist(m.pos, h.path[h.path.length - 1]);
  G.pull = { path: h.path, i: 0, t: 0, limit: total / PULL_SPEED * 1.8 + 0.8, stuck: 0, last: [...m.pos], anchor: [...h.to], body: m };
  G.hook = null;
}

function endPull(m) {
  G.pull = null;
  m.velY = 0; m._airVelX = 0; m._airVelZ = 0;
  m.falling = false; m.fallStart = m.pos[1];   // a drop from here is billed from here, the pull itself never
}

function pullStep(m, dt, input) {
  const p = G.pull;
  if (p.body !== m) { G.pull = null; return false; }   // another body steps now: the pull was the last one's
  if (dist(m.pos, p.last) > 1 || !bodyFree(m)) { endPull(m); return false; }   // moved by something else: let go
  if (input?.jump) { endPull(m); return false; }   // Jump lets go
  p.t += dt;
  const wp = p.path[p.i];
  const d = [wp[0] - m.pos[0], wp[1] - m.pos[1], wp[2] - m.pos[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < PULL_ARRIVE) {
    if (++p.i >= p.path.length) { endPull(m); return true; }
    p.last = [...m.pos];
    return true;
  }
  const speed = PULL_SPEED * Math.min(1, 0.35 + p.t / 0.25);   // it takes up the slack, then hauls
  const s = Math.min(len, speed * dt);
  const before = [...m.pos];
  const r = m.collider.move(m.pos, d[0] / len * s, d[1] / len * s, d[2] / len * s, m.height, false);
  m.grounded = !!r?.grounded;
  m.velY = 0; m._airVelX = 0; m._airVelZ = 0; m.jumping = false; m.standing = false;
  m.falling = false; m.fallStart = m.pos[1];   // NO FALL from the pull
  p.stuck = dist(m.pos, before) < s * 0.3 ? p.stuck + 1 : 0;
  p.last = [...m.pos];
  if (p.stuck >= 8 || p.t > p.limit) endPull(m);   // blocked, or too long: it ends where it is
  return true;
}

/**
 * THE MOTOR'S ONE HOOK (player/motor.js `_step`, after the freeze): the clock, a throw owed, the hook in the air, the
 * pull. Answers true while the pull holds the body - the step is the pull's, nothing else moves it.
 */
export function grappleStep(m, dt, input, yaw, pitch) {
  G.clock += dt;
  if (!m?.collider) return false;
  if (G.wanted) { G.wanted = false; if (!busy()) launch(m, yaw, pitch); }
  if (G.hook) hookStep(m, dt);
  return G.pull ? pullStep(m, dt, input) : false;
}
