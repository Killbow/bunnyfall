import { abilityArrowAllowed } from '../abilities/previewHits.js';
import { coverDistance } from '../../ai/cover.js';
import { rayHit } from '../../player/groundRay.js';
import { techniqueMotion } from '../technique/techniqueFx.js';
import { ARROW_FLIGHT_SPEED, MISSILE_LIFESPAN_S, playerShotOrigin } from '../../magic/spellcast.js';
import { sparedByPlayer } from '../friendlyFire.js';
import {
  isBallistaItem, BOLT_SPEED, BOLT_GRAVITY, BURST_RADIUS, BURST_FLASH_ARCHIVE, BURST_FLASH_SCALE,
  BURST_KICK, BURST_SHAKE_RANGE,
} from '../../characters/heavyGearIds.js';

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function boltMeta(weapon, dir, peerBolt = false) {
  if (!peerBolt && !isBallistaItem(weapon)) return null;
  const u = unit(dir);
  return { arc: true, vel: [u[0] * BOLT_SPEED, u[1] * BOLT_SPEED, u[2] * BOLT_SPEED], dir: u, speedScale: BOLT_SPEED / ARROW_FLIGHT_SPEED };
}

export function bendBolt(m, dt) {
  if (!m?.arc || !m.vel || !(dt > 0)) return;
  m.vel[1] -= BOLT_GRAVITY * dt;
  const s = Math.hypot(m.vel[0], m.vel[1], m.vel[2]) || 1;
  m.dir[0] = m.vel[0] / s; m.dir[1] = m.vel[1] / s; m.dir[2] = m.vel[2] / s;
  // The lanes move a shaft along dir at ARROW_FLIGHT_SPEED times speedScale, so these fields carry the velocity.
  m.speedScale = s / ARROW_FLIGHT_SPEED;
}

let _fx = { play: null, shake: null, eye: null };
export function bindBallistaFx(fx) { _fx = { play: fx?.play ?? null, shake: fx?.shake ?? null, eye: fx?.eye ?? null }; }

function reachTo(at, feet, height = 1.8, radius = 0.4) {
  const y = Math.max(feet[1], Math.min(feet[1] + height, at[1]));
  return Math.hypot(at[0] - feet[0], at[1] - y, at[2] - feet[2]) - radius;
}

export const burstMayStrike = (ref) => !!ref && !ref.dead && !sparedByPlayer(ref) && ref.companion == null && ref.ai?.isHostile !== false;

export function ballistaBurst(m, { targets = [], hit = null, effects = null, collider = null } = {}) {
  if (!m?.arc || m.burst) return 0;
  m.burst = true;
  if (!(m.age <= MISSILE_LIFESPAN_S)) return 0;
  const at = [m.pos[0], m.pos[1], m.pos[2]];
  const ability = m.technique?.ability ? m.technique : null;
  const scale = ability?.burstScale ?? 1;
  const radius = ability?.burstRadius ?? BURST_RADIUS;
  try { effects?.showImpactFlash?.(BURST_FLASH_ARCHIVE, at, BURST_FLASH_SCALE * scale); } catch { }
  try { _fx.play?.(at); } catch { }
  const eye = _fx.eye?.();
  if (eye && Math.hypot(eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]) < BURST_SHAKE_RANGE) {
    try { _fx.shake?.(BURST_KICK * (ability?.burstScale ? Math.min(scale, 1.4) * techniqueMotion() : 1)); } catch { }
  }
  if (m.visual || !m.fromPlayer || typeof hit !== 'function') return 0;
  const candidates = [];
  for (const t of targets) {
    const ref = t?.ref ?? t;
    const feet = t?.feet ?? ref?.ai?.feet;
    if (!feet) continue;
    const reach = reachTo(at, feet, ref.ai?.height ?? 1.8, ref.ai?.radius ?? 0.4);
    if (reach <= radius) candidates.push({ ref, feet, reach });
  }
  if (ability?.burstRadius) candidates.sort((a, b) => a.reach - b.reach);
  const limit = ability ? Math.max(0, ability.burstCap - ability.targets.size) : Infinity;
  let n = 0;
  for (const { ref, feet, reach } of candidates) {
    if (n >= limit) break;
    if (!burstMayStrike(ref) || !abilityArrowAllowed(m, ref)) continue;
    if (ability && collider) {
      const to = [feet[0] - at[0], feet[1] + (ref.ai?.height ?? 1.8) / 2 - at[1], feet[2] - at[2]];
      const distance = Math.hypot(...to);
      const dir = unit(to);
      const wall = ability.burstRadius
        ? Math.min(rayHit(at, dir, distance, collider), coverDistance(collider, at, dir, distance))
        : collider.raycast(at, dir, distance);
      if (Number.isFinite(wall) && wall < distance - 0.05) continue;
    }
    const away = unit([feet[0] - at[0], 0.15, feet[2] - at[2]]);
    const splashShare = ability?.burstRadius ? 0.66 - 0.3 * Math.max(0, reach) / radius : null;
    try { hit({ ...m, pos: at, dir: away, summoned: true, splash: true, splashShare }, ref); n++; } catch (e) { console.warn('[ballista] a burst blow threw', e); }
  }
  return n;
}

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
