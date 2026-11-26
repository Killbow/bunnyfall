// Arrow flight for hosts without the dungeon missile system. The dungeon lane also calls playerArrowHitFoe, so
// every host prices a shot from the player the same way. arrowMatrix mirrors the dungeon arrow matrix.
import { abilityArrowAllowed, abilityFlightStep, previewDamage, settleAbilityArrow, weaponOpening } from './abilities/previewHits.js';
import { rayUprightCapsule } from '../world/passiveFish.js';
import { MISSILE_SPEED, ARROW_FLIGHT_SPEED, MISSILE_COLLIDER_RADIUS, MISSILE_LIFESPAN_S, playerShotOrigin, missileHitsCapsule, missileReach, PLAYER_BODY_RADIUS, BODY_CAPSULE_RADIUS, sphereOverlapsCapsule } from '../magic/spellcast.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';
import { trs } from '../world/mat4.js';
import { SWING_MODS, foeUnaware } from './playerWeapon.js';
import { bloodHit } from './bloodDecals.js';
import { calculateAttackDamage } from './formulas.js';
import { offHandToHit, OFF_HAND_BLOW } from './twoHands/handsLaw.js';
import { liveStat } from '../characters/statMods.js';
import { segmentBoxEntry } from '../systems/naval/navalBallistics.js';
import { bowDamageArrow } from './enemyEquipment.js';
import { backstabChanceOf, enemyPainVoice } from './hostCombat.js';
import { isBackFacing } from '../characters/enemyMotor.js';
import { hitSoundFor, ENEMY_HIT_VOLUME } from '../audio/soundClips.js';
import { addItem, ARROW_TEMPLATE } from '../items/inventory.js';
import { noteShotRecoverable, shotTallyOpen } from './shotTally.js';
import { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS } from '../items/loot.js';
import { playerWeaponHitEntity, blowFeedDamage } from '../world/worldTick.js';
import { sparedByPlayer } from './friendlyFire.js';
import { coverDistance, coverStep } from '../ai/cover.js';
import { blowMult, scaleBlowDamage, playerBody, tellTechniqueLanded } from './technique/techniqueBlow.js';
import { takeOwed } from '../player/playerDoor.js';
import { boltMeta, bendBolt, ballistaBurst } from './ballista/ballistaFlight.js';
import { monsterVolume } from '../audio/monsterVolume.js';

export const ARROW_MODEL_ID = 99800;

export const ARROW_LODGE_CHANCE = 0.5;
export const STUCK_ARROW_OWNER = 'stuckArrow';
export const STUCK_ARROWS_MAX = 40;
export const STUCK_ARROW_LIFT = 0.3;
export const STUCK_ARROW_EMBED = 0.25;
export const STUCK_ARROW_LABEL = 'Arrow';
export const STUCK_ARROW_NO_STORE = Object.freeze({ kg: 0, name: 'The arrow' });
const STUCK_ARROW_ICON = Object.freeze({ archive: RANDOM_TREASURE_ARCHIVE, record: RANDOM_TREASURE_ICONS[0] });

export function stickable(m) {
  return !!m?.fromPlayer && !m.visual && !m.summoned && !shotTallyOpen();
}

const stuckPilesOf = (loot) => (loot?._piles ?? []).filter((p) => p.owner === STUCK_ARROW_OWNER && !p.dead);
export const liveStuckArrows = (loot) => stuckPilesOf(loot).filter((p) => !p.inactive && p.items.length > 0);

// Classic Daggerfall loses an arrow that meets geometry. Here a real arrow from the player stays as an unsaved
// one-Arrow pile in the host loot pool, so the existing pickup paths take it back.
export function stickArrow(loot, at, dir, { pixelKey = null } = {}) {
  if (!loot?.seedPile || !Array.isArray(at)) return null;
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const pile = loot.seedPile([bowDamageArrow()], [at[0], at[1] - STUCK_ARROW_LIFT, at[2]], STUCK_ARROW_ICON, null, pixelKey,
    { unsaved: true, drawn: false, owner: STUCK_ARROW_OWNER });
  pile.label = STUCK_ARROW_LABEL;
  pile.noStore = STUCK_ARROW_NO_STORE;
  pile.stuckDir = [dir[0] / l, dir[1] / l, dir[2] / l];
  const all = stuckPilesOf(loot);
  for (let i = 0; i < all.length - STUCK_ARROWS_MAX; i++) loot.removePile(all[i]);
  return pile;
}

export function pruneStuckArrows(loot) {
  for (const p of stuckPilesOf(loot)) if (p.inactive || !p.items.length) loot.removePile(p);
}

export function stuckArrowSetBack(bounds) {
  if (!bounds || !(bounds[3] > 0)) return 0;
  return bounds[2] + bounds[3] - STUCK_ARROW_EMBED * 2 * bounds[3];
}

export function stuckArrowMatrix(pile, bounds = null) {
  const d = pile.stuckDir, back = stuckArrowSetBack(bounds);
  return arrowMatrix([pile.pos[0] - d[0] * back, pile.pos[1] + STUCK_ARROW_LIFT - d[1] * back, pile.pos[2] - d[2] * back], d);
}

export function groundEntry(a, b, c) {
  const da = a[1] - c.heightAt(a[0], a[2]), db = b[1] - c.heightAt(b[0], b[2]);
  const t = da > 0 && da - db > 0 ? Math.min(1, da / (da - db)) : 0;
  const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
  return [x, c.heightAt(x, z), z];
}

export function syncStuckArrowDraws(loot, draws, held, meshOf) {
  pruneStuckArrows(loot);
  const live = liveStuckArrows(loot);
  for (const [p, d] of held) {
    if (live.includes(p)) continue;
    const i = draws.indexOf(d);
    if (i >= 0) draws.splice(i, 1);
    held.delete(p);
  }
  if (live.every((p) => held.has(p))) return;
  const gpu = meshOf();
  if (!gpu) return;
  for (const p of live) {
    if (held.has(p)) continue;
    const d = { gpu, object: { matrix: stuckArrowMatrix(p, gpu.bounds) } };
    draws.push(d);
    held.set(p, d);
  }
}

export function techniquePierces(m, ref) {
  const t = m?.technique;
  if (!t || !(t.pierce > 1)) return false;
  (t.struck ??= []).push(ref);
  return t.struck.length < t.pierce;
}

export function sweepLinearAbility(m, unit, distance, targets, impact, wall = Infinity) {
  const radius = m.technique.linearRadius;
  if (!(distance > 0 && wall > 0) || !impact) return false;
  const start = m.pos;
  const contacts = [];
  for (const t of targets) {
    const foe = t?.ref ?? t;
    const feet = t?.feet ?? foe?.ai?.feet;
    if (!feet || !abilityArrowAllowed(m, foe) || m.technique.struck?.includes(foe)) continue;
    const height = foe.ai?.height ?? 1.8;
    const body = foe.radius ?? foe.ai?.radius ?? BODY_CAPSULE_RADIUS;
    const along = (feet[0] - start[0]) * unit[0] + (feet[1] + height * 0.5 - start[1]) * unit[1] + (feet[2] - start[2]) * unit[2];
    if (along - body >= wall) continue;
    const cap = Math.min(body, height * 0.5);
    const hit = sphereOverlapsCapsule(start, radius, feet, height, body) ? 0
      : rayUprightCapsule(start, unit, Math.min(distance, wall),
        [feet[0], feet[1] + cap - body - radius, feet[2]], body + radius,
        height - 2 * cap + 2 * (body + radius))?.dist;
    if (hit != null && hit < wall) contacts.push({ foe, hit });
  }
  contacts.sort((a, b) => a.hit - b.hit);
  for (const { foe, hit } of contacts) {
    if (!abilityArrowAllowed(m, foe) || m.technique.struck?.includes(foe)) continue;
    m.pos = [start[0] + unit[0] * hit, start[1] + unit[1] * hit, start[2] + unit[2] * hit];
    m.abilityContactDistance = (m.abilityStepStart ?? 0) + hit;
    impact(m, foe);
    if (!techniquePierces(m, foe)) return true;
  }
  m.pos = start;
  return false;
}
// A piercing shaft counts as one blow for the referee while no other blow lands between its bodies.
export function shaftSequence(m, q) {
  const t = m?.technique;
  if (!t) return q;
  const back = (q - 1) & 0x7fffffff;
  t.seq = t.struck?.length > 0 && t.seq === back ? back : q;
  return t.seq;
}

export function arrowMatrix(pos, dir, technique = null) {
  const yaw = Math.atan2(dir[0], dir[2]) * 180 / Math.PI;
  const pitch = Math.asin(-Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
  const scale = technique?.projectileScale ?? (technique?.linearRadius ? 1.65 : 1);
  return trs(pos[0], pos[1], pos[2], pitch, yaw, 0, scale, scale, scale);
}

export class ArrowFlight {
  constructor({ getGpuMesh, collider = null, effects = null, loot = null, pixelKeyAt = null }) {
    this.getGpuMesh = getGpuMesh;
    this._collider = collider;
    this._loot = loot;
    this._pixelKeyAt = pixelKeyAt;
    this._stuckGpu = null;
    this._effects = effects;
    this.arrows = [];
  }

  fire(from, dir, meta = {}) {
    const origin = meta.fromPlayer
      ? playerShotOrigin(from, dir, meta.muzzle)
      : [...from];
    const arc = meta.technique?.linearRadius ? null : boltMeta(meta.weapon, dir, !!meta.peerBolt);
    this.arrows.push({ pos: origin, dir: [...dir], age: 0, gpu: null, dead: false, ...meta, ...arc });
  }

  tick(dt, ctxOf) {
    if (this.arrows.length) this.update(dt, ctxOf());
    else if (this._loot) pruneStuckArrows(this._loot);
  }

  update(dt, { playerFeet = null, playerHeight = CAPSULE_HEIGHT, onPlayerHit = null, foeTargets = null, onFoeHit = null,
    onPlayerArrowHitFoe = null, boxTargets = null, onPlayerArrowHitBox = null } = {}) {
    let live = 0;
    const c = typeof this._collider === 'function' ? this._collider() : this._collider;
    if (this._loot) pruneStuckArrows(this._loot);
    for (const m of this.arrows) {
      if (m.dead) { continue; }
      live++;
      m.age += dt;
      if (m.age > MISSILE_LIFESPAN_S) { m.dead = true; continue; }
      bendBolt(m, dt);
      const step = abilityFlightStep(m, (m.orb ? MISSILE_SPEED : ARROW_FLIGHT_SPEED) * (m.speedScale ?? 1) * dt);
      if (m.technique?.ability && dt > 0 && step <= 0) { m.dead = true; m.burst = true; continue; }
      const { unit, reach } = missileReach(m.dir, step);
      const cs = c ? coverStep(coverDistance(c, m.pos, unit, reach), c.raycast(m.pos, unit, reach), reach, reach - step * Math.hypot(m.dir[0], m.dir[1], m.dir[2]), step * Math.hypot(m.dir[0], m.dir[1], m.dir[2])) : null;
      if (m.technique?.linearRadius) {
        const travel = step * Math.hypot(...m.dir) * (cs?.advance ?? 1);
        const end = m.pos.map((n, i) => n + unit[i] * travel);
        const ground = c && end[1] <= c.heightAt(end[0], end[2]) ? groundEntry(m.pos, end, c) : null;
        const stop = Math.min(cs?.stop ?? Infinity, ground ? Math.hypot(...ground.map((n, i) => n - m.pos[i])) : Infinity);
        if (sweepLinearAbility(m, unit, travel, foeTargets ?? [], onPlayerArrowHitFoe, stop)) {
          m.dead = true;
          continue;
        }
      }
      if (cs && Number.isFinite(cs.stop)) {
        const contact = [m.pos[0] + unit[0] * cs.stop, m.pos[1] + unit[1] * cs.stop, m.pos[2] + unit[2] * cs.stop];
        this._stick(m, contact, unit);
        if (m.technique?.ability && m.arc) m.pos = contact.map((v, i) => v - unit[i] * 0.02);
        m.dead = true;
        continue;
      }
      const adv = cs ? step * cs.advance : step;
      const from = m.fromPlayer ? [m.pos[0], m.pos[1], m.pos[2]] : null;
      const was = boxTargets?.length && m.fromPlayer ? [m.pos[0], m.pos[1], m.pos[2]] : null;
      m.pos[0] += m.dir[0] * adv;
      m.pos[1] += m.dir[1] * adv;
      m.pos[2] += m.dir[2] * adv;
      // As in classic Daggerfall, any body stops a shaft, but an enemy shaft hurts only its intended target.
      if (m.enemy && playerFeet && onPlayerHit) {
        if (missileHitsCapsule(m.pos, playerFeet, playerHeight, PLAYER_BODY_RADIUS)) {
          if (!m.aimFoe) onPlayerHit(m);
          m.dead = true;
          continue;
        }
      }
      // Another player's drawn shaft stops on contact and applies nothing; its owner already dealt the damage.
      if (m.visual) {
        if ((playerFeet && missileHitsCapsule(m.pos, playerFeet, playerHeight, PLAYER_BODY_RADIUS))
          || (foeTargets ?? []).some((t) => t?.feet && !t.ref?.dead && missileHitsCapsule(m.pos, t.feet, t.ref?.ai?.height))) m.dead = true;
        else if (c && m.pos[1] <= c.heightAt(m.pos[0], m.pos[2])) m.dead = true;
        continue;
      }
      const foeImpact = m.enemy ? onFoeHit : (m.fromPlayer ? onPlayerArrowHitFoe : null);
      if (foeImpact && foeTargets && !m.technique?.linearRadius) {
        for (const t of foeTargets) {
          if (!t?.feet || t.ref === m.shooterFoe || t.ref?.dead || !abilityArrowAllowed(m, t.ref)) continue;
          if (m.fromPlayer && sparedByPlayer(t.ref)) continue;
          if (m.technique && (playerBody(t.ref) || m.technique.struck?.includes(t.ref))) continue;
          if (missileHitsCapsule(m.pos, t.feet, t.ref?.ai?.height)) {
            if (!m.enemy || t.ref === m.aimFoe) foeImpact(m, t.ref);
            if (techniquePierces(m, t.ref)) continue;
            m.dead = true;
            break;
          }
        }
        if (m.dead) continue;
      }
      if (was && onPlayerArrowHitBox) {
        const hit = boxTargets.find((t) => t?.box && segmentBoxEntry(was, m.pos, t.box, MISSILE_COLLIDER_RADIUS));
        if (hit && !m.technique?.ability) { onPlayerArrowHitBox(m, hit); m.dead = true; continue; }
      }
      // The mesh raycast never sees bare terrain, so a shaft at or under the height floor has landed.
      if (c && m.pos[1] <= c.heightAt(m.pos[0], m.pos[2])) {
        if (from) {
          const impact = groundEntry(from, m.pos, c);
          this._stick(m, impact, m.dir);
          if (m.technique?.ability && m.arc) m.pos = [impact[0], impact[1] + 0.02, impact[2]];
        }
        m.dead = true;
      }
    }
    for (const m of this.arrows) if (m.dead) {
      if (m.arc && !m.burst) ballistaBurst(m, { targets: foeTargets ?? [], hit: onPlayerArrowHitFoe, effects: this._effects, collider: c });
      settleAbilityArrow(m);
    }
    if (!live) this.arrows.length = 0;
  }

  _stick(m, at, dir) {
    if (this._loot && stickable(m)) stickArrow(this._loot, at, dir, { pixelKey: this._pixelKeyAt?.() ?? null });
  }

  _stuckMesh() {
    if (this._stuckGpu === null) {
      this._stuckGpu = false;
      Promise.resolve(this.getGpuMesh(ARROW_MODEL_ID)).then((g) => { if (g) this._stuckGpu = g; }, () => {});
    }
    return this._stuckGpu || null;
  }

  clear() {
    for (const m of this.arrows) { settleAbilityArrow(m); m.dead = true; }
    this.arrows.length = 0;
    this._stuckGpu = null;
  }

  draw(renderer, texRemap = undefined) {
    for (const m of this.arrows) {
      if (!m.dead && m.gpu) renderer.drawMesh(m.gpu, arrowMatrix(m.pos, m.dir, m.technique), texRemap);
    }
    const stuck = this._loot ? liveStuckArrows(this._loot) : [];
    const gpu = stuck.length ? this._stuckMesh() : null;
    if (gpu) for (const p of stuck) renderer.drawMesh(gpu, stuckArrowMatrix(p, gpu.bounds), texRemap);
  }
}

export function shaftOnRelayBody(m, entity, rolled) {
  if (m?.technique?.ability) return 0;
  const body = { name: entity?.name ?? '', entity };
  const dmg = m?.technique ? scaleBlowDamage(rolled, blowMult(m.technique, body)) : rolled;
  if (m?.technique) tellTechniqueLanded(m.technique, body, dmg);
  const owed = takeOwed(entity);
  return dmg > 0 ? dmg + owed : dmg;
}

export function playerArrowHitFoe(m, foe, {
  playerEntity, playerWeapon = null, playerFeet = null, dealDamage = null,
  audio = null, hitEffects = null, say = null, onInflictPoison = null,
  onAttackFromPlayer = null,
  rolls = Math.random,
} = {}) {
  if (!foe || foe.dead || !playerEntity || !abilityArrowAllowed(m, foe)) return 0;
  const ability = m.technique?.ability ? m.technique : null;
  if (ability && ability.actor !== playerEntity) return 0;
  const secondary = !!m.splash || (ability?.targets.size ?? 0) > 0;
  ability?.targets.add(foe.entity);
  if (ability?.rainTargets) ability.rainTargets.set(foe.entity, (ability.rainTargets.get(foe.entity) ?? 0) + 1);
  if (foe.yielded || foe.executing || foe.sparing || foe.leaving || foe.roaring) return 0;
  const swing = SWING_MODS[playerWeapon?.machine?.state] ?? { damage: 0, toHit: 0 };
  const back = foe.ai && playerFeet ? isBackFacing(foe.ai.yaw, foe.ai.feet, playerFeet) : false;
  const off = !!playerWeapon?.isOffHandItem?.(m.weapon);
  const unaware = foeUnaware(foe);
  const rolled = calculateAttackDamage(playerEntity, foe.entity, {
    weapon: m.weapon ?? null,
    damageMod: swing.damage + (ability?.damageMod ?? 0), toHitMod: swing.toHit + (off ? offHandToHit(liveStat(playerEntity, 'agility')) : 0),
    armorPierce: ability?.armorPierce,
    ...(off ? OFF_HAND_BLOW : {}),
    backstabChance: backstabChanceOf(playerEntity, back, foe),
    weaponAnimTime: playerWeapon?.lastDrawMs ?? 0,
    rolls, onInflictPoison, say,
    unaware,
  });
  let dmg = ability ? previewDamage(ability, rolled, foe, {
    pos: m.pos, secondary, distance: m.abilityContactDistance, splashShare: m.splashShare, unaware,
  })
    : m.technique && !playerBody(foe) ? scaleBlowDamage(rolled, blowMult(m.technique, foe)) : rolled;
  if (!ability && m.technique && !playerBody(foe)) tellTechniqueLanded(m.technique, foe, dmg);
  const at = foe.ai?.feet ?? [m.pos[0], m.pos[1], m.pos[2]];
  // As in classic Daggerfall, the splash sits at the enemy's transform origin (feet plus centreOffset), while the
  // hit sound and the pain voice stay at the feet.
  const bloodAt = foe.ai?.feet
    ? [at[0], at[1] + (foe.ai.centreOffset ?? (foe.ai.height ?? 1.8) / 2), at[2]]
    : at;
  if (dmg > 0) {
    const axeBonus = weaponOpening(playerEntity, foe, { exploit: 'axe', opening: { channel: 'arrow', seconds: 7, share: .65 } });
    if (axeBonus) dmg = Math.round(dmg * (1 + axeBonus));
    audio?.play3d?.(hitSoundFor(m.weapon ?? null), at, ENEMY_HIT_VOLUME, { maxDistance: 16 });
    hitEffects?.showBloodSplash?.(foe.entity?.basics?.bloodIndex ?? 0, bloodAt, null, bloodHit(dmg, foe.bloodOf ?? foe.entity, { fromPlayer: true, weapon: m.weapon ?? null }));
    const pain = enemyPainVoice(foe, dmg, rolls);
    if (pain && pain.clip >= 0) audio?.play3d?.(pain.clip, [at[0], at[1] + 0.9, at[2]], monsterVolume(), { maxDistance: 16, pitch: 1 + pain.pitchLift });
    dealDamage?.(foe, dmg);
  }
  settleAbilityArrow(m, dmg, foe);
  // This runs for every shaft that connects, even at zero damage, and stays out of dealDamage because that path
  // adds knockback.
  onAttackFromPlayer?.(foe, dmg);
  const stillFlying = ability && ability.targets.size < ability.pierce;
  // The lodge roll comes last so every earlier roll on the stream stays the same.
  if (foe.entity?.items && !m.summoned && !stillFlying && rolls() < ARROW_LODGE_CHANCE) {
    addItem(foe.entity.items, bowDamageArrow());
    if (!foe.entity.bout && foe.rival == null) noteShotRecoverable(ARROW_TEMPLATE);
  }
  // An arena rival is a player: no hit dispatch, as a melee blow on one has none.
  if (foe.rival == null) playerWeaponHitEntity(playerEntity, foe.entity, { mobileType: foe.mobileType ?? null, damage: blowFeedDamage(foe, dmg) });
  return dmg;
}
