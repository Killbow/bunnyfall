import { isDayFromMinutes } from '../world/gameDate.js';
import { SPECIAL_ABILITY_BITS, REGENERATION_FLAGS } from './specialAdvantages.js';
import { onlineMpOf } from './renownLayer.js';
import { regenShare } from '../worldEvents/courtRules.js';
import { cloakState } from '../systems/survival/temperature.js';

export const SUN_DAMAGE_AMOUNT = 12;
export const HOLY_DAMAGE_AMOUNT = 12;
export const REGENERATE_AMOUNT = 1;
export const SUN_DAMAGE_PER_ROUNDS = 4;
export const HOLY_DAMAGE_PER_ROUNDS = 4;
export const REGENERATE_PER_ROUNDS = 4;
export const MAGERY_REDUCED_FRACTION = -0.33;
export const MAGERY_UNABLE = -10000000;
export const FIGHTER_TRAINERS_FACTION = 849;

let _host = null;
export function setPassiveSpecialsHost(host) { const prev = _host; _host = host ?? null; return prev; }

export function playerInSunlight(nowMinutes = null) {
  const now = nowMinutes ?? _host?.now?.() ?? 0;
  return isDayFromMinutes(now) && !(_host?.isInside?.() ?? false) && !(_host?.inPrison?.() ?? false);
}
export const playerInDarkness = (nowMinutes = null) => (_host !== null || nowMinutes !== null) && !playerInSunlight(nowMinutes);
export const playerInHolyPlace = () => !!(_host?.isHolyPlace?.() ?? false);

const bitfield = (career) => career?.abilityFlagsAndSpellPointsBitfield ?? 0;
export const careerSunDamage = (career) => !!(bitfield(career) & SPECIAL_ABILITY_BITS.sunDamage);
export function careerSunAverse(entity) {
  if (!careerSunDamage(entity?.career)) return false;
  return !cloakState(entity.equip?.slots ?? null).hood;
}
export const careerHolyDamage = (career) => !!(bitfield(career) & SPECIAL_ABILITY_BITS.holyDamage);
export const careerLightMagery = (career) => (bitfield(career) >> 6) & 3;
export const careerDarknessMagery = (career) => (bitfield(career) >> 8) & 3;

export function passiveSpecialsMagicRound(entity, { nowMinutes = 0, clockMinutes = nowMinutes, sinks = null } = {}) {
  if (!entity?.isPlayer) return;
  const isDay = isDayFromMinutes(clockMinutes);
  const career = entity.career ?? null;
  const override = (entity.racialOverride && !entity.racialOverride.ended) ? entity.racialOverride : null;

  if (nowMinutes % REGENERATE_PER_ROUNDS === 0 && career?.regeneration) {
    const day = isDay;
    const dungeon = !!(_host?.inDungeon?.() ?? false);
    let regenerate = false;
    if (career.regeneration === REGENERATION_FLAGS.general) regenerate = true;
    else if (career.regeneration === REGENERATION_FLAGS.inDarkness) regenerate = !day || dungeon;
    else if (career.regeneration === REGENERATION_FLAGS.inLight) regenerate = day && !dungeon;
    else if (career.regeneration === REGENERATION_FLAGS.whileImmersed) regenerate = !!(_host?.isSwimming?.() ?? false);
    const held = regenerate ? regenShare(REGENERATE_AMOUNT, 'career', entity) : 0;
    if (held > 0) sinks?.heal?.(held);
  }

  if (nowMinutes % SUN_DAMAGE_PER_ROUNDS === 0
    && careerSunAverse(entity)
    && playerInSunlight(clockMinutes)) {
    sinks?.hurt?.(SUN_DAMAGE_AMOUNT);
  }

  if (nowMinutes % HOLY_DAMAGE_PER_ROUNDS === 0
    && (careerHolyDamage(career) || override?.holyDamage)
    && playerInHolyPlace()) {
    sinks?.hurt?.(HOLY_DAMAGE_AMOUNT);
  }

  let magery = 0;
  const _mod = entity.maxMagickaModifier ?? 0;
  entity.maxMagickaModifier = 0;
  const raw = Math.max(0, (entity.maxMagicka ?? 0) - onlineMpOf(entity));
  entity.maxMagickaModifier = _mod;
  const dark = !isDay || (_host?.isInside?.() ?? false);
  if (dark) {
    const light = careerLightMagery(career);
    if (light === 2) magery += Math.trunc(raw * MAGERY_REDUCED_FRACTION);
    else if (light === 1) magery += MAGERY_UNABLE;
  }
  if (playerInSunlight(clockMinutes)) {
    const darkness = careerDarknessMagery(career);
    if (darkness === 2) magery += Math.trunc(raw * MAGERY_REDUCED_FRACTION);
    else if (darkness === 1) magery += MAGERY_UNABLE;
  }
  entity.maxMagickaModifier = (entity._enchantMods?.maxMagicka ?? 0) + magery;
  if ((entity.magicka ?? 0) > (entity.maxMagicka ?? 0)) entity.magicka = entity.maxMagicka;
}
