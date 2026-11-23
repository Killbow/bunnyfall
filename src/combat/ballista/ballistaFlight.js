// BUNNYFALL: THE ROYAL BALLISTA'S BOLT - an arc instead of a line, and a burst where it lands.
//
// The bolt is an arrow on the shared lanes (combat/arrowFlight.js for the street and a building, the dungeon's own
// missiles in scenes/dungeonContext.js), so its contact, its stop on a wall and its hit on a foe are the arrow's. Three
// things are this module's, each one call from those lanes:
//   - boltMeta(weapon, dir): the fields a ballista's bolt is fired with ({ arc, vel }); nothing for any other weapon.
//   - bendBolt(m, dt): each step, gravity on its velocity, and the lane's own `dir` and `speedScale` set from it - the
//     lanes move a shaft along `dir` at ARROW_FLIGHT_SPEED x speedScale, so that IS the velocity.
//   - ballistaBurst(m, ...): where it stopped (a wall, the ground, a body, never the end of its lifespan), every hostile
//     body round the spot is struck through the lane's own player-arrow door (the host's damage door, as a shaft's is) -
//     a flash, a thud and, close by, a shake. A peer's bolt (`visual`) bursts for the eye alone.
// And predictArc(...) integrates the same law from the same origin for the aiming arc (ui/heavyGearOverlay.js), so the
// arc drawn is the path flown.

import { ARROW_FLIGHT_SPEED, MISSILE_LIFESPAN_S, playerShotOrigin } from '../../magic/spellcast.js';
import { sparedByPlayer } from '../friendlyFire.js';
import {
  isBallistaItem, BOLT_SPEED, BOLT_GRAVITY, BURST_RADIUS, BURST_FLASH_ARCHIVE, BURST_FLASH_SCALE,
  BURST_KICK, BURST_SHAKE_RANGE,
} from '../../characters/heavyGearIds.js';

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** The fields a bolt is fired with: a ballista's (or a peer's ballista shot - `peerBolt`) arcs; anything else, none. */
export function boltMeta(weapon, dir, peerBolt = false) {
  if (!peerBolt && !isBallistaItem(weapon)) return null;
  const u = unit(dir);
  return { arc: true, vel: [u[0] * BOLT_SPEED, u[1] * BOLT_SPEED, u[2] * BOLT_SPEED], dir: u, speedScale: BOLT_SPEED / ARROW_FLIGHT_SPEED };
}

/** One step of the arc: gravity on the velocity, and the lane's direction and pace from it. A record without `arc`
 *  is untouched. */
export function bendBolt(m, dt) {
  if (!m?.arc || !m.vel || !(dt > 0)) return;
  m.vel[1] -= BOLT_GRAVITY * dt;
  const s = Math.hypot(m.vel[0], m.vel[1], m.vel[2]) || 1;
  m.dir[0] = m.vel[0] / s; m.dir[1] = m.vel[1] / s; m.dir[2] = m.vel[2] / s;
  m.speedScale = s / ARROW_FLIGHT_SPEED;
}

// The burst's voice and the camera's kick are the weapon rig's to hand over (it holds the audio and the shaker), so this
// module stays a leaf the lanes can import.
let _fx = { play: null, shake: null, eye: null };
/** `play(pos)` a thud at a point; `shake(magnitude)` the camera; `eye()` where the player's eye is now (for the shake's
 *  reach). Each may be null. */
export function bindBallistaFx(fx) { _fx = { play: fx?.play ?? null, shake: fx?.shake ?? null, eye: fx?.eye ?? null }; }

/** How far a point is from a standing body's capsule (feet up `height`), less its radius. */
function reachTo(at, feet, height = 1.8, radius = 0.4) {
  const y = Math.max(feet[1], Math.min(feet[1] + height, at[1]));
  return Math.hypot(at[0] - feet[0], at[1] - y, at[2] - feet[2]) - radius;
}

/** May the blast strike this body? Only one already hostile, never a body the player's blows pass by (a town's
 *  defenders, one's own crew - combat/friendlyFire.js), nor a companion: a bolt dropped beside a calm watchman or a
 *  friend is no crime and no betrayal. */
export const burstMayStrike = (ref) => !!ref && !ref.dead && !sparedByPlayer(ref) && ref.companion == null && ref.ai?.isHostile !== false;

/**
 * THE BURST. `targets` each `{ feet, ref }` (the lane's foe list) or a foe record (feet off `ai.feet`); `hit(m, ref)` the
 * lane's player-arrow door. Once per bolt (`m.burst`); a bolt that ran out its lifespan in the air bursts nowhere.
 * The blast's blow is the bolt's own (the same roll a shaft makes), carried by a copy that lodges no arrow (`summoned`)
 * and pushes each body away from the spot. Answers how many it struck.
 */
export function ballistaBurst(m, { targets = [], hit = null, effects = null } = {}) {
  if (!m?.arc || m.burst) return 0;
  m.burst = true;
  if (!(m.age <= MISSILE_LIFESPAN_S)) return 0;
  const at = [m.pos[0], m.pos[1], m.pos[2]];
  try { effects?.showImpactFlash?.(BURST_FLASH_ARCHIVE, at, BURST_FLASH_SCALE); } catch { /* the picture is not the blow's problem */ }
  try { _fx.play?.(at); } catch { /* nor the sound */ }
  const eye = _fx.eye?.();
  if (eye && Math.hypot(eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]) < BURST_SHAKE_RANGE) {
    try { _fx.shake?.(BURST_KICK); } catch { /* nor the shake */ }
  }
  if (m.visual || !m.fromPlayer || typeof hit !== 'function') return 0;
  let n = 0;
  for (const t of [...targets]) {
    const ref = t?.ref ?? t;
    const feet = t?.feet ?? ref?.ai?.feet;
    if (!feet || !burstMayStrike(ref)) continue;
    if (reachTo(at, feet, ref.ai?.height ?? 1.8, ref.ai?.radius ?? 0.4) > BURST_RADIUS) continue;
    const away = unit([feet[0] - at[0], 0.15, feet[2] - at[2]]);
    try { hit({ ...m, pos: at, dir: away, summoned: true, splash: true }, ref); n++; } catch (e) { console.warn('[ballista] a burst blow threw', e); }
  }
  return n;
}

/**
 * THE AIMING ARC: where a bolt loosed now from `eye` along `look` would fly, step by step under the same law, until it
 * meets the collider (a wall, a floor, the ground under the streamed terrain) or `maxT` runs out. Answers
 * `{ points, land, normal }` - the polyline (world points) and the spot it lands (null if it lands nowhere in time).
 */
export function predictArc(eye, look, collider, { maxT = 4, dt = 1 / 40 } = {}) {
  const o = playerShotOrigin(eye, look, null);
  const m = { arc: true, ...boltMeta(null, look, true), pos: o };
  const points = [[...o]];
  for (let t = 0; t < maxT; t += dt) {
    bendBolt(m, dt);
    const step = ARROW_FLIGHT_SPEED * m.speedScale * dt;
    const p = m.pos;
    let hitD = Infinity;
    let normal = null;
    if (collider?.raycastHit) {
      const h = collider.raycastHit(p, m.dir, step);
      if (h && Number.isFinite(h.dist)) { hitD = h.dist; normal = h.normal ?? null; }
    }
    const next = [p[0] + m.dir[0] * step, p[1] + m.dir[1] * step, p[2] + m.dir[2] * step];
    const ground = collider?.heightAt?.(next[0], next[2]);
    if (Number.isFinite(ground) && next[1] <= ground && m.dir[1] < 0) {
      const g0 = collider.heightAt(p[0], p[2]);
      const above = p[1] - (Number.isFinite(g0) ? g0 : ground), below = ground - next[1];
      const k = above + below > 0 ? Math.max(0, Math.min(1, above / (above + below))) : 1;
      if (k * step < hitD) { hitD = k * step; normal = [0, 1, 0]; }
    }
    if (Number.isFinite(hitD)) {
      const land = [p[0] + m.dir[0] * hitD, p[1] + m.dir[1] * hitD, p[2] + m.dir[2] * hitD];
      points.push(land);
      return { points, land, normal };
    }
    m.pos = next;
    points.push(next);
  }
  return { points, land: null, normal: null };
}
