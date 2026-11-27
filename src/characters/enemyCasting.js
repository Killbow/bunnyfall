// Enemy spellcasting AI: DFU's ranged and touch spell decisions, executed through one shared cast path.

import { CLASSIC_UPDATE_INTERVAL } from './weaponStates.js';
import { MELEE_DISTANCE, withinYaw } from './enemyMotor.js';
import { resetMeleeTimer } from './enemyAttack.js';
import { effectsAlreadyOnTarget } from '../magic/effects.js';
import { silenceBlocksCast } from '../magic/mysticism.js';

import { MIN_RANGED_DISTANCE, MAX_RANGED_DISTANCE } from './enemyAttack.js';
import { MISSILE_SPEED, MISSILE_COLLIDER_RADIUS } from '../magic/spellcast.js';
import { ARROW_ARM_LENGTH } from './weaponStates.js';
import { bloodCentre as sparkleCentre } from '../combat/hitEffects.js';

export { MIN_RANGED_DISTANCE, MAX_RANGED_DISTANCE };
export const RANGED_SPELL_CHANCE = 1 / 40;
export const SPELL_YAW_DEG = 22.5;

export function pickRangedSpell(entity, target, rolls = Math.random) {
  if ((entity.magicka ?? 0) <= 0) return null;
  const ranged = (entity.spells ?? []).filter((sp) => sp.rangeType === 2 || sp.rangeType === 4);
  if (!ranged.length) return null;
  const sp = ranged[Math.floor(rolls() * ranged.length)];
  return effectsAlreadyOnTarget(sp, target) ? null : sp;
}

export const hasMagickaToCast = (entity) => (entity?.magicka ?? 0) > 0;

export const hasRangedSpell = (entity) => ((entity?.magicka ?? 0) > 0)
  && (entity?.spells ?? []).some((sp) => sp.rangeType === 2 || sp.rangeType === 4);

export function pickTouchSpell(entity, target, rolls = Math.random) {
  if ((entity.magicka ?? 0) <= 0) return null;
  const touch = (entity.spells ?? []).filter((sp) => sp.rangeType === 1 || sp.rangeType === 0);
  if (!touch.length) return null;
  const sp = touch[Math.floor(rolls() * touch.length)];
  return effectsAlreadyOnTarget(sp, target) ? null : sp;
}

export function clearPathToShootSpell(ai) {
  if (typeof ai?.hasClearPathToShootProjectile !== 'function') return true;
  return ai.hasClearPathToShootProjectile(MISSILE_SPEED, ARROW_ARM_LENGTH, MISSILE_COLLIDER_RADIUS);
}

export class EnemyCaster {
  constructor(entity, rolls = Math.random) {
    this.entity = entity;
    this.rolls = rolls;
    this._classicTimer = 0;
    this.selectedSpell = null;
  }

  canCastRangedSpell() { return this.selectedSpell !== null; }

  /**
   * @param ai
   * @param attack
   * @param playerEntity
   * @returns { spell, touch }
   */
  update(dt, ai, attack, playerFeet, playerEntity) {
    const ent = this.entity;
    if (!ent.spells?.length) return null;
    const dist = ai._dist;
    const idle = attack.machine.state === 'Idle';
    const canAct = ai.canAct !== false;
    if (canAct && ai.inSight && ai.detected && ai.giveUpTimer > 0
        && attack.meleeTimer === 0 && dist <= MELEE_DISTANCE && ai._tacStrike !== false) {
      // A silenced enemy still draws the pick but leaves the shared melee timer alone.
      const sp = pickTouchSpell(ent, playerEntity, this.rolls);
      if (sp && !silenceBlocksCast(ent)) {
        // A touch cast cuts an in-flight swing, as DFU's state change does.
        if (!idle) { attack.machine.state = 'Idle'; attack.machine.acc = 0; }
        attack.meleeTimer = resetMeleeTimer(attack.playerLevel, attack.reflexes, this.rolls());
        return { spell: sp, touch: true };
      }
    }
    const dx = playerFeet[0] - ai.feet[0], dz = playerFeet[2] - ai.feet[2];
    this._classicTimer += dt;
    let decision = null;
    while (this._classicTimer >= CLASSIC_UPDATE_INTERVAL) {
      this._classicTimer -= CLASSIC_UPDATE_INTERVAL;
      const inBand = dist > MIN_RANGED_DISTANCE && dist < MAX_RANGED_DISTANCE;
      if (!canAct || ai.giveUpTimer <= 0 || !inBand || !ai.inSight || !ai.detected
          || attack.rangedAttack) { this.selectedSpell = null; continue; }
      this.selectedSpell = pickRangedSpell(ent, playerEntity, this.rolls);
      if (this.selectedSpell && !clearPathToShootSpell(ai)) this.selectedSpell = null;
      if (decision || !this.selectedSpell) continue;
      if (!idle || !withinYaw(ai.yaw, dx, dz, SPELL_YAW_DEG)) continue;
      if (ai._tacShoot === false) continue;
      if (this.rolls() >= RANGED_SPELL_CHANCE) continue;
      decision = { spell: this.selectedSpell, touch: false };
      ai._tacShot = (ai._tacShot ?? 0) + 1;
    }
    return decision;
  }
}

export function castEnemySpell(f, spell, {
  noSpellPointCost = false, playerEntity, playerFeet = null, playerHeight = 1.8,
  applySpell, foeSinks, calculateCastCost, silenceBlocksCast,
  playCastSound = null, explodeAt = null, fireMissile = null,
  hitEffects = null,
  rolls = Math.random,
  aimAt = null,
} = {}) {
  if (!noSpellPointCost && silenceBlocksCast(f.entity)) return false;
  if (!noSpellPointCost) {
    const cost = calculateCastCost(spell, playerEntity, { portMods: false }).sp;
    f.entity.magicka = Math.max(0, (f.entity.magicka ?? 0) - cost);
  }
  const casterTransformY = f.ai.feet[1] + (f.ai.centreOffset ?? (f.ai.height ?? 1.8) / 2);
  const from = [f.ai.feet[0], casterTransformY, f.ai.feet[2]];
  f._castPending = true;
  playCastSound?.(spell.element, from);
  if (spell.rangeType !== 2 && spell.rangeType !== 4) {
    hitEffects?.showMagicSparkles(sparkleCentre(f.ai.feet, f.ai.height));
  }
  if (spell.rangeType === 0) {
    applySpell(spell, f.entity.level, f.entity, foeSinks(f), rolls, { entity: f.entity, sinks: foeSinks(f) });
    return true;
  }
  if (spell.rangeType === 3) {
    explodeAt?.([f.ai.feet[0], casterTransformY, f.ai.feet[2]], spell, f.entity.level, playerFeet,
      { entity: f.entity, sinks: foeSinks(f), foe: f }, { excludeFoe: f, playerHeight });
    return true;
  }
  fireMissile?.(from, spell, f.entity.level, f, aimAt);
  return true;
}
