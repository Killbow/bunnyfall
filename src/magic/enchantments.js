import { ENEMY_BASICS, isClassEnemyId } from '../characters/enemyBasics.js';
import { equipTableOf, lowerCondition, setEnchantmentHooks } from '../characters/equip.js';
// worldTick.js imports this module, so take its re-exports from gameDate.js and effectBroker.js to avoid a cycle.
import { MINUTES_PER_DAY } from '../world/gameDate.js';
import { syntheticTimeIncrease } from './effectBroker.js';
import { classicCastingCost } from './spellcost.js';
import { skillValue } from '../characters/skills.js';
import { unitWeightInKg } from '../items/inventory.js';
import { enchantmentCost, defaultParam } from './enchantmentCatalogue.js';
import { artifactHook } from '../items/artifactEffects.js';
import { applyDressStanding } from '../justice/clothingStanding.js';

import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { SOCIAL_GROUP_COUNT } from '../formats/factionFile.js';
import { regenShare } from '../worldEvents/courtRules.js';
import { ITEM_TEMPLATES, templateByIndex, mendOrder, mintCondition, TRANSPORT_HORSE, TRANSPORT_SMALL_CART } from '../items/itemTemplates.js';
import { WEAPONS } from '../characters/weapons.js';
import { repoolWeapon } from '../items/conditionRepair.js';
import { creditOwnMend } from '../items/foundMark.js';
import { stampedTier } from '../items/rarityTier.js';
export { ENCHANTMENT_TYPES };

export const classicEnchantmentType = (type) =>
  (typeof type === 'string' ? ENCHANTMENT_TYPES[type] ?? ENCHANTMENT_TYPES.None : type);

export const PAYLOAD = Object.freeze({
  None: 0, Enchanted: 1, Used: 2, Equipped: 4, Unequipped: 8, Held: 16,
  Strikes: 32, Breaks: 64, MagicRound: 128, RerollEffect: 256,
});

export const REGEN_PER_ROUNDS = 4;
export const CONDITION_PER_ROUNDS = 4;
export const CONDITION_AMOUNT = 1;
export const DAMAGE_PER_ROUNDS = 4;
export const TIME_LEECH_PER_ROUNDS = 4;
export const LEECH_CAST_AMOUNT = 16;
export const LEECH_WEAPON_AMOUNT = 8;
export const DURABILITY_LOSS_ON_USE = 10;
export const DURABILITY_LOSS_ON_STRIKE = 10;
export const HELD_DEGRADE_RATE = 4;
export const HELD_DEGRADE_RATE_RESTING = 60;
export const EXTRA_SPELL_PTS_MAX_INCREASE = 75;
export const ENHANCE_SKILL_MOD = 15;
export const REP_ADJUSTMENT = 10;
export const POTENT_VS_DAMAGE = 5;
export const LOW_DAMAGE_VS = -5;
export const STRENGTHENS_ARMOR_VALUE = -5;
export const WEAKENS_ARMOR_VALUE = 5;

// Both armor channels are classic min-sets, so repeats never stack and WeakensArmor (+5) never applies.
const setIncreasedArmorValueModifier = (mods, amount) => {
  if (amount < mods.increasedArmorMod) mods.increasedArmorMod = amount;
};
const setDecreasedArmorValueModifier = (mods, amount) => {
  if (amount < mods.decreasedArmorMod) mods.decreasedArmorMod = amount;
};
export const BAD_REACTIONS_RANGE = 8;
export const BAD_REACTIONS_ARMOR = -5;
export const BAD_REACTIONS_HIT = -5;
export const EXTRA_SPELL_PTS_NEARBY_RADIUS = 18;
export const VAMPIRIC_DRAIN_RANGE = 2.25;

export function itemEnchantments(item) {
  const list = item?.enchantments;
  if (!Array.isArray(list) || !list.length) return null;
  const out = list.filter((e) => e && e.type !== ENCHANTMENT_TYPES.None);
  return out.length ? out : null;
}

export const isEnchantedItem = (item) => !!itemEnchantments(item);

// Only types below ItemDeteriorates count toward value: the powers, plus Soul Bound at its positive soul points.
export const VALUE_COUNTS_BELOW = ENCHANTMENT_TYPES.ItemDeteriorates;

// These price at their first minted param, since EnhancesSkill stores a real skill ID but has one flat cost.
const NO_PARAM_VALUE_TYPES = new Set([
  ENCHANTMENT_TYPES.RepairsObjects, ENCHANTMENT_TYPES.AbsorbsSpells,
  ENCHANTMENT_TYPES.EnhancesSkill, ENCHANTMENT_TYPES.FeatherWeight,
  ENCHANTMENT_TYPES.StrengthensArmor,
]);
const CAST_WHEN_TYPES = new Set([
  ENCHANTMENT_TYPES.CastWhenUsed, ENCHANTMENT_TYPES.CastWhenHeld,
  ENCHANTMENT_TYPES.CastWhenStrikes,
]);
const TYPE_NAME = Object.freeze(Object.entries(ENCHANTMENT_TYPES)
  .reduce((a, [k, v]) => { a[v] = k; return a; }, {}));

export const spellEnchantPtCost = (spell) => (spell ? 10 * classicCastingCost(spell) : 0);

export function legacyEnchantmentValue(enchantments, { spellOfIndex = null, soulPointsOf = null } = {}) {
  let value = 0;
  for (const e of enchantments ?? []) {
    if (!e || e.type === ENCHANTMENT_TYPES.None) continue;
    if (!(e.type < VALUE_COUNTS_BELOW)) continue;
    if (CAST_WHEN_TYPES.has(e.type)) {
      value += spellEnchantPtCost(spellOfIndex ? spellOfIndex(e.param) : null);
    } else if (e.type === ENCHANTMENT_TYPES.SoulBound) {
      value += soulPointsOf ? (soulPointsOf(e.param) ?? 0) : (ENEMY_BASICS[e.param]?.soulPts ?? 0);
    } else {
      const name = TYPE_NAME[e.type];
      const param = NO_PARAM_VALUE_TYPES.has(e.type) ? defaultParam(name) : e.param;
      value += enchantmentCost(name, param) ?? 0;
    }
  }
  return value;
}

let _defaultCtx = null;
export function setDefaultEnchantCtx(ctx) { _defaultCtx = ctx; }
export const spellToFoeOwner = (foe, record, level) => { try { return !!_defaultCtx?.spellToOwner?.(foe, record, level); } catch { return false; } };
/**
 * @param {any} record
 * @param {any} entity
 */
export function castFreeForPlayer(record, entity) {
  const c = _defaultCtx;
  if (!c || !record) return false;
  if (c.castBarred?.()) return false;
  if (record.rangeType === 0) { c.applySpellToSelf?.(record, entity, null); return true; }
  return c.setReadySpell?.(record, null) !== false;
}
const mergeCtx = (ctx) => (ctx && _defaultCtx ? { ..._defaultCtx, ...ctx } : ctx ?? _defaultCtx);
// effects.js and mysticism.js import this module, so they register these doors instead of being imported here.
const _fx = { applySpell: null, removeItemPinnedEffects: null, removeFilledTrap: null };
export function setEnchantmentEffectDoors(doors) { Object.assign(_fx, doors); }

export const REROLL_MINIMUM_HOURS = 6;
const MINUTES_PER_HOUR = 60;

export function assignHeldSpell(record, entity, item, { ctx = null, nowMinutes = 0, recast = false } = {}) {
  ctx = mergeCtx(ctx);
  // Nothing is removed here, so a second Cast When Held power sits beside the first.
  _fx.applySpell?.(record, entity.level ?? 1, entity, ctx?.sinks ?? {}, ctx?.rolls ?? Math.random, { entity }, { bypassSavingThrows: true, heldItem: item });
  if (!recast && !ctx?.heldEquipFree) {
    const skillOf = ctx?.castingSkillOf ?? ((sk) => skillValue(entity, sk));
    const bill = heldEquipBill(item, classicCastingCost(record, skillOf));
    if (bill > 0) enchantLowerCondition(item, bill, entity, ctx);
  }
  item.timeEffectsLastRerolled = nowMinutes;
}

// A piece re-worn within REROLL_MINIMUM_HOURS of its last casting pays no equip bill, unlike classic.
export function heldEquipIsFree(item, nowMinutes) {
  const at = item?.timeEffectsLastRerolled;
  if (!Number.isFinite(at) || !Number.isFinite(nowMinutes)) return false;
  const since = nowMinutes - at;
  return since >= 0 && since < REROLL_MINIMUM_HOURS * MINUTES_PER_HOUR;
}
// The equip bill stops at 1 condition and a Legendary pays none, deliberate changes from classic.
export function heldEquipBill(item, cost) {
  if (item && Object.isExtensible(item)) { mintCondition(item); repoolWeapon(item); }
  if (item?.rarity === 'legendary') return 0;
  const left = Number.isFinite(item?.currentCondition) ? item.currentCondition : Infinity;
  return Math.max(0, Math.min(cost, left - 1));
}

function instantiateHeldSpell({ param, entity, item, ctx, nowMinutes }, recast) {
  const record = ctx?.spellsByIndex?.()?.get?.(param);
  if (!record) return;
  (ctx?.assignHeldSpell ?? assignHeldSpell)(record, entity, item, { ctx, nowMinutes, recast });
}

// Enchantment wear removes a broken item unless AllowMagicRepairs is on, as in classic; a rarity-tier piece stays.
function enchantLowerCondition(item, amount, entity, ctx, collection = null) {
  const broke = lowerCondition(item, amount, entity, ctx?.say);
  if (broke && !stampedTier(item) && !(ctx?.allowMagicRepairs ?? false)) {
    const col = collection ?? entity?.items;
    const i = col ? col.indexOf(item) : -1;
    if (i >= 0) col.splice(i, 1);
  }
  return broke;
}

const AFFINITY_PARAM = Object.freeze({ Undead: 0, Daedra: 1, Humanoid: 2, Animals: 3 });
export function mobileAffinityMatches(mobileType, paramType) {
  const affinity = isClassEnemyId(mobileType) ? 'Human' : (ENEMY_BASICS[mobileType]?.affinity ?? 'None');
  return (paramType === AFFINITY_PARAM.Undead && affinity === 'Undead')
    || (paramType === AFFINITY_PARAM.Daedra && affinity === 'Daedra')
    || (paramType === AFFINITY_PARAM.Humanoid && affinity === 'Human')
    || (paramType === AFFINITY_PARAM.Animals && affinity === 'Animal');
}

export const MEND_SHARE_OF = ITEM_TEMPLATES[WEAPONS.Dagger].hitPoints;
// Magic items and artifacts count condition in uses, so they mend one point a tick.
export const repairsObjectsMend = (it) => (it.magic || it.artifact ? CONDITION_AMOUNT : Math.max(CONDITION_AMOUNT, Math.round(it.maxCondition / MEND_SHARE_OF)));

export function repairsObjectsTarget(items, { allowMagicRepairs = false } = {}) {
  let best = null, bestTier = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !Number.isFinite(it.currentCondition) || !Number.isFinite(it.maxCondition) || !(it.currentCondition < it.maxCondition)) continue;
    if (templateByIndex(it.templateIndex)?.isNotRepairable) continue;
    if (isEnchantedItem(it) && !allowMagicRepairs) continue;
    // A wagon's condition is its upkeep, so Repairs Objects never mends it.
    if (it.templateIndex === TRANSPORT_SMALL_CART || it.templateIndex === TRANSPORT_HORSE) continue;
    const tier = mendTier(it);
    if (!best || tier < bestTier || (tier === bestTier && mendOrder(it, best) < 0)) { best = it; bestTier = tier; }
  }
  return best;
}
const mendTier = (it) => (wearsItself(it) ? 1 : it.equipSlot != null ? 0 : 2);
const wearsItself = (it) => it.equipSlot != null
  && !!itemEnchantments(it)?.some((e) => e.type === ENCHANTMENT_TYPES.CastWhenHeld || e.type === ENCHANTMENT_TYPES.ItemDeteriorates);

const T = ENCHANTMENT_TYPES;

const REGISTRY = new Map([
  [T.CastWhenUsed, {
    flags: PAYLOAD.Used,
    used({ param, entity, item, ctx }) {
      if (item && (item.currentCondition ?? 1) <= 0) return { durabilityLoss: DURABILITY_LOSS_ON_USE };
      if (ctx?.castBarred?.()) return null;
      const record = ctx?.spellsByIndex?.()?.get?.(param);
      if (record) {
        if (record.rangeType === 0) ctx?.applySpellToSelf?.(record, entity, item);
        else ctx?.setReadySpell?.(record, item);
      }
      return { durabilityLoss: DURABILITY_LOSS_ON_USE };
    },
  }],
  [T.CastWhenHeld, {
    flags: PAYLOAD.Equipped | PAYLOAD.MagicRound | PAYLOAD.RerollEffect,
    equipped(env) { instantiateHeldSpell(env, false); },
    reroll(env) { instantiateHeldSpell(env, true); },
    magicRound({ round, entity, item, ctx }) {
      // Classic wears held items only for the player, so an enemy's item is looted at its current condition.
      if (!entity?.isPlayer) return;
      if (syntheticTimeIncrease()) return;
      if (ctx?.travelUIShowing?.()) return;
      const rate = ctx?.isResting?.() ? HELD_DEGRADE_RATE_RESTING : HELD_DEGRADE_RATE;
      if (round % rate === 0) enchantLowerCondition(item, 1, entity, ctx);
    },
  }],
  [T.CastWhenStrikes, {
    flags: PAYLOAD.Strikes,
    strikes({ param, entity, target, damage, ctx }) {
      if (!target || damage === 0 || target.warded) return null;
      const record = ctx?.spellsByIndex?.()?.get?.(param);
      if (record) ctx?.applySpellToTarget?.(record, entity, target);
      return { durabilityLoss: DURABILITY_LOSS_ON_STRIKE };
    },
  }],
  [T.ExtraSpellPts, {
    flags: PAYLOAD.Held,
    constant({ param, ctx, mods }) {
      let apply = false;
      // Params 0 to 3 use the Winter-first season order that ctx.season returns.
      if (param < 4) apply = ctx?.season?.() === param;
      else if (param <= 6) apply = ctx?.moonPhase?.(param) ?? false;
      else apply = anyNearbyOfAffinity(ctx, param - 7, EXTRA_SPELL_PTS_NEARBY_RADIUS);
      if (apply) mods.maxMagicka += EXTRA_SPELL_PTS_MAX_INCREASE;
    },
  }],
  [T.PotentVs, {
    flags: PAYLOAD.Strikes,
    strikes({ param, target }) {
      if (target?.mobileType == null) return null;
      return mobileAffinityMatches(target.mobileType, param) ? { strikesModulateDamage: POTENT_VS_DAMAGE } : null;
    },
  }],
  [T.RegensHealth, {
    flags: PAYLOAD.Held,
    magicRound({ param, round, entity, ctx }) {
      if (round % REGEN_PER_ROUNDS !== 0) return;
      const regen = param === 0
        || (param === 2 && (ctx?.inDarkness?.() ?? false))
        || (param === 1 && (ctx?.inSunlight?.() ?? false));
      if (regen && entity.health < entity.maxHealth) entity.health = Math.min(entity.maxHealth, entity.health + regenShare(1, 'item', entity));
    },
  }],
  [T.VampiricEffect, {
    flags: PAYLOAD.Held | PAYLOAD.Strikes,
    magicRound({ param, round, entity, ctx }) {
      if (param !== 0 || round % REGEN_PER_ROUNDS !== 0) return;
      const nearby = ctx?.nearbyFoes?.(VAMPIRIC_DRAIN_RANGE) ?? [];
      for (const foe of nearby.filter((n) => !n.spared)) {
        // Classic sets health without an attack, so the drain is not the player's attack and wakes no one.
        foe.hurt?.(1, { fromPlayer: false });
        entity.health = Math.min(entity.maxHealth, entity.health + 1);
      }
    },
    strikes({ param, entity, damage, target }) {
      if (param !== 1 || target?.warded) return null;
      entity.health = Math.min(entity.maxHealth, entity.health + damage);
      return null;
    },
  }],
  [T.IncreasedWeightAllowance, {
    flags: PAYLOAD.Held,
    constant({ param, mods }) { mods.weightAllowanceMult = Math.max(mods.weightAllowanceMult, param === 1 ? 0.5 : 0.25); },
  }],
  [T.RepairsObjects, {
    flags: PAYLOAD.Held,
    magicRound({ round, entity, ctx }) {
      if (!entity.isPlayer || round % CONDITION_PER_ROUNDS !== 0) return;
      const it = repairsObjectsTarget(entity.items, { allowMagicRepairs: ctx?.allowMagicRepairs ?? false });
      if (!it) return;
      repoolWeapon(it);
      const was = it.currentCondition;
      it.currentCondition = Math.min(it.maxCondition, it.currentCondition + repairsObjectsMend(it));
      creditOwnMend(it, was);
    },
  }],
  [T.AbsorbsSpells, {
    flags: PAYLOAD.Held,
    constant({ mods }) { mods.absorbsSpells = true; },
  }],
  [T.EnhancesSkill, {
    flags: PAYLOAD.Held,
    constant({ param, mods }) { mods.skillMods[param] = (mods.skillMods[param] ?? 0) + ENHANCE_SKILL_MOD; },
  }],
  [T.FeatherWeight, { flags: PAYLOAD.Enchanted, enchanted({ item }) { item.weightInKg = 0.25; } }],
  [T.ExtraWeight, { flags: PAYLOAD.Enchanted, enchanted({ item }) { item.weightInKg = (Number.isFinite(item.weightInKg) ? item.weightInKg : unitWeightInKg(item)) * 4; } }],
  [T.StrengthensArmor, { flags: PAYLOAD.Held, constant({ mods }) { setIncreasedArmorValueModifier(mods, STRENGTHENS_ARMOR_VALUE); } }],
  [T.WeakensArmor, { flags: PAYLOAD.Held, constant({ mods }) { setDecreasedArmorValueModifier(mods, WEAKENS_ARMOR_VALUE); } }],
  [T.ImprovesTalents, {
    flags: PAYLOAD.Held,
    constant({ param, entity, mods }) {
      if (!entity.isPlayer) return;
      if (param === 0) mods.improvedAcuteHearing = true;
      else if (param === 1) mods.improvedAthleticism = true;
      else if (param === 2) mods.improvedAdrenalineRush = true;
    },
  }],
  [T.GoodRepWith, {
    flags: PAYLOAD.Held,
    magicRound({ param, entity }) { applyRepMod(entity, param, REP_ADJUSTMENT); },
  }],
  [T.BadRepWith, {
    flags: PAYLOAD.Held,
    magicRound({ param, entity }) { applyRepMod(entity, param, -REP_ADJUSTMENT); },
  }],
  [T.SoulBound, {
    flags: PAYLOAD.Enchanted | PAYLOAD.Breaks,
    enchanted({ param, entity, collection, item }) {
      // Only a newly consumed soul may rearm an existing binding; repairing the item cannot.
      if (_fx.removeFilledTrap?.(collection ?? entity?.items, param)) delete item.soulBoundReleased;
    },
    breaks({ param, item, ctx }) {
      if (!(param >= 0) || item.soulBoundReleased) return;
      // Mark the release before calling the host, so reentrant calls and repairs never spawn the soul twice.
      item.soulBoundReleased = true;
      ctx?.spawnFoe?.(param);
    },
  }],
  [T.ItemDeteriorates, {
    flags: PAYLOAD.Held,
    magicRound({ param, round, entity, item, ctx }) {
      if (syntheticTimeIncrease()) return;
      if (round % CONDITION_PER_ROUNDS !== 0) return;
      if (param === 1 && !(ctx?.inSunlight?.() ?? false)) return;
      if (param === 2 && !(ctx?.inHolyPlace?.() ?? false)) return;
      enchantLowerCondition(item, 1, entity, ctx);
    },
  }],
  [T.UserTakesDamage, {
    flags: PAYLOAD.Held,
    magicRound({ param, round, ctx }) {
      if (round % DAMAGE_PER_ROUNDS !== 0) return;
      if (param === 0 && !(ctx?.inSunlight?.() ?? false)) return;
      if (param === 1 && !(ctx?.inHolyPlace?.() ?? false)) return;
      ctx?.hurtSelf?.(1);
    },
  }],
  [T.LowDamageVs, {
    flags: PAYLOAD.Strikes,
    strikes({ param, target }) {
      if (target?.mobileType == null) return null;
      return mobileAffinityMatches(target.mobileType, param) ? { strikesModulateDamage: LOW_DAMAGE_VS } : null;
    },
  }],
  [T.HealthLeech, {
    flags: PAYLOAD.Held | PAYLOAD.Used | PAYLOAD.Strikes | PAYLOAD.Enchanted,
    enchanted({ item, nowMinutes }) { if (item) item.timeHealthLeechLastUsed = nowMinutes ?? 0; },
    used({ param, item, ctx, nowMinutes }) {
      if (item) item.timeHealthLeechLastUsed = nowMinutes ?? 0;
      if (param === 0) ctx?.hurtSelf?.(LEECH_CAST_AMOUNT);
      return null;
    },
    strikes({ param, item, ctx, nowMinutes }) {
      if (item) item.timeHealthLeechLastUsed = nowMinutes ?? 0;
      if (param === 0) ctx?.hurtSelf?.(LEECH_WEAPON_AMOUNT);
      return null;
    },
    magicRound({ param, round, item, ctx, nowMinutes }) {
      if (syntheticTimeIncrease()) return;
      if (param !== 1 && param !== 2) return;
      const since = (nowMinutes ?? 0) - (item?.timeHealthLeechLastUsed ?? 0);
      const active = param === 1 ? since > MINUTES_PER_DAY : since > MINUTES_PER_DAY * 7;
      if (active && round % TIME_LEECH_PER_ROUNDS === 0) ctx?.hurtSelf?.(1);
    },
  }],
  [T.BadReactionsFrom, {
    flags: PAYLOAD.Held,
    constant({ param, ctx, mods }) {
      const affinity = param === 0 ? AFFINITY_PARAM.Humanoid : param === 1 ? AFFINITY_PARAM.Animals : AFFINITY_PARAM.Daedra;
      if (anyNearbyOfAffinity(ctx, affinity, BAD_REACTIONS_RANGE)) {
        setDecreasedArmorValueModifier(mods, BAD_REACTIONS_ARMOR);
        mods.chanceToHitMod += BAD_REACTIONS_HIT;
      }
    },
  }],
  [T.SpecialArtifactEffect, {
    flags: PAYLOAD.Used | PAYLOAD.Held | PAYLOAD.Strikes | PAYLOAD.MagicRound,
    used: artifactHook('used'),
    strikes: artifactHook('strikes'),
    constant: artifactHook('constant'),
    magicRound: artifactHook('magicRound'),
    unequipped: artifactHook('unequipped'),
  }],
]);

export const worksUnworn = (e) => ((REGISTRY.get(e?.type)?.flags ?? 0) & PAYLOAD.Used) !== 0;

function applyRepMod(entity, param, amount) {
  if (!entity.isPlayer) return;
  const mods = (entity.reactionMods ??= new Array(SOCIAL_GROUP_COUNT).fill(0));
  if (param === 5) { for (let g = 0; g < 5; g++) mods[g] += amount; }
  else if (param >= 0 && param < 5) mods[param] += amount;
}

function anyNearbyOfAffinity(ctx, affinityParam, range) {
  const nearby = ctx?.nearbyFoes?.(range);
  if (!nearby) return false;
  return nearby.some((f) => mobileAffinityMatches(f.mobileType, affinityParam));
}

export function doItemEnchantmentPayloads(flags, item, { entity = null, target = null, damage = 0, round = 0, nowMinutes = null, ctx = null, collection = null } = {}) {
  let damageOut = damage;
  ctx = mergeCtx(ctx);
  // Leech stamps are read back against the absolute minute, so a caller with no clock takes the host clock, not 0.
  nowMinutes ??= ctx?.now?.() ?? 0;
  const enchantments = itemEnchantments(item);
  if (!enchantments) return damageOut;
  if (flags & PAYLOAD.Unequipped) _fx.removeItemPinnedEffects?.(entity, item);
  for (const e of enchantments) {
    const row = REGISTRY.get(e.type);
    if (!row) {
      // Classic stops the whole walk at an unknown effect, so a later real enchantment on the item never runs.
      return Math.max(0, damageOut);
    }
    const env = { param: e.param, entity, target, item, damage, round, nowMinutes, ctx, collection };
    if ((flags & PAYLOAD.Equipped) && (row.flags & PAYLOAD.Equipped)) row.equipped?.(env);
    if (flags & PAYLOAD.Unequipped) row.unequipped?.(env);
    if ((flags & PAYLOAD.Used) && (row.flags & PAYLOAD.Used)) applyResults(row.used?.(env), env);
    if ((flags & PAYLOAD.Strikes) && (row.flags & PAYLOAD.Strikes)) {
      const r = row.strikes?.(env);
      if (r?.strikesModulateDamage) damageOut += r.strikesModulateDamage;
      applyResults(target?.spareGear && r?.durabilityLoss ? { ...r, durabilityLoss: 0 } : r, env);
    }
    if ((flags & PAYLOAD.Breaks) && (row.flags & PAYLOAD.Breaks)) row.breaks?.(env);
    if ((item.currentCondition ?? 1) > 0) {
      if ((flags & PAYLOAD.MagicRound) && (row.flags & (PAYLOAD.MagicRound | PAYLOAD.Held))) row.magicRound?.(env);
      if ((flags & PAYLOAD.RerollEffect) && (row.flags & PAYLOAD.RerollEffect)) row.reroll?.(env);
      if ((flags & PAYLOAD.Enchanted) && (row.flags & PAYLOAD.Enchanted)) row.enchanted?.(env);
    }
  }
  return Math.max(0, damageOut);
}

// Unlike the payload walk, this skips an unknown row instead of stopping, and it resolves rows by key.
export function doEnchantedPayloads(item, enchantments, { entity = null, ctx = null, nowMinutes = null, collection = null } = {}) {
  ctx = mergeCtx(ctx);
  nowMinutes ??= ctx?.now?.() ?? 0;
  for (const e of enchantments ?? []) {
    const row = REGISTRY.get(classicEnchantmentType(e.type));
    if (!row || !(row.flags & PAYLOAD.Enchanted)) continue;
    row.enchanted?.({ param: e.param, entity, target: null, item, damage: 0, round: 0, nowMinutes, ctx, collection });
  }
}

function applyResults(r, env) {
  if (!r) return;
  if (r.removeItem) {
    const col = env.collection ?? env.entity?.items;
    const i = col ? col.indexOf(env.item) : -1;
    if (i >= 0) col.splice(i, 1);
  } else if (r.durabilityLoss) {
    enchantLowerCondition(env.item, r.durabilityLoss, env.entity, env.ctx, env.collection);
  }
}

export function computeEnchantmentMods(entity, ctx = null, { clampMagicka = true } = {}) {
  ctx = mergeCtx(ctx);
  const mods = {
    maxMagicka: 0, increasedArmorMod: 0, decreasedArmorMod: 0, chanceToHitMod: 0, absorbsSpells: false,
    weightAllowanceMult: 0, skillMods: {},
    improvedAcuteHearing: false, improvedAthleticism: false, improvedAdrenalineRush: false,
  };
  for (const item of equippedEnchantedItems(entity)) {
    for (const e of itemEnchantments(item)) {
      const row = REGISTRY.get(e.type);
      if (!row) break;
      if (row.flags & PAYLOAD.Held) row.constant?.({ param: e.param, entity, item, ctx, mods });
    }
  }
  entity._enchantMods = mods;
  entity.maxMagickaModifier = mods.maxMagicka;
  if (clampMagicka && (entity.magicka ?? 0) > (entity.maxMagicka ?? 0) && typeof entity.maxMagicka === 'number') entity.magicka = entity.maxMagicka;
  return mods;
}

export function enchantmentMagicRound(entity, round, { nowMinutes = 0, ctx = null } = {}) {
  ctx = mergeCtx(ctx);
  if (entity.isPlayer) (entity.reactionMods ??= new Array(SOCIAL_GROUP_COUNT).fill(0)).fill(0);
  // Clothing refills the cleared reaction mods before the early return, so it counts with nothing enchanted worn.
  applyDressStanding(entity);
  const items = equippedEnchantedItems(entity);
  if (!items.length) { entity._enchantMods = null; return; }
  computeEnchantmentMods(entity, ctx);
  for (const item of items) {
    doItemEnchantmentPayloads(PAYLOAD.MagicRound, item, { entity, round, nowMinutes, ctx });
  }
  if (entity.isPlayer && entity.activeEffects?.length) {
    for (const item of items) {
      // A pinned effect that a blow ended still counts, since classic keeps the bundle while the item is worn.
      if (!entity.activeEffects.some((a) => a.heldItem === item)) continue;
      const hours = Math.floor((nowMinutes - (item.timeEffectsLastRerolled ?? nowMinutes)) / MINUTES_PER_HOUR);
      if (hours < REROLL_MINIMUM_HOURS || item.equipSlot == null) continue;
      _fx.removeItemPinnedEffects?.(entity, item);
      doItemEnchantmentPayloads(PAYLOAD.RerollEffect, item, { entity, round, nowMinutes, ctx });
      item.timeEffectsLastRerolled = nowMinutes;
    }
  }
}

export function restartHeldEnchantments(entity, ctx = null) {
  ctx = mergeCtx(ctx);
  const nowMinutes = ctx?.now?.() ?? 0;
  const items = equippedEnchantedItems(entity);
  for (const item of items) {
    _fx.removeItemPinnedEffects?.(entity, item);
    // Keep the saved reroll stamp, since the load has not set the world clock yet.
    const at = item.timeEffectsLastRerolled ?? nowMinutes;
    for (const e of itemEnchantments(item)) {
      const row = REGISTRY.get(e.type);
      if (!row) break;
      if (e.type === T.CastWhenHeld) instantiateHeldSpell({ param: e.param, entity, item, ctx, nowMinutes: at }, true);
    }
  }
  // No magicka clamp on load: conditions read before the world clock returns must not cut the saved magicka.
  if (entity?._enchantMods || items.length) computeEnchantmentMods(entity, ctx, { clampMagicka: false });
}

function equippedEnchantedItems(entity) {
  const out = [];
  const slots = entity?.equip ? equipTableOf(entity) : null;
  if (slots) {
    for (const it of slots) if (it && isEnchantedItem(it)) out.push(it);
  } else {
    for (const it of entity?.items ?? []) if (it?.equipSlot != null && isEnchantedItem(it)) out.push(it);
  }
  return out;
}

export const enchantChanceToHitMod = (entity) => entity?._enchantMods?.chanceToHitMod ?? 0;
export const enchantArmorMod = (entity) =>
  (entity?._enchantMods?.increasedArmorMod ?? 0) + (entity?._enchantMods?.decreasedArmorMod ?? 0);
export const enchantArmorDisplayMod = (entity) =>
  (entity?._enchantMods?.decreasedArmorMod ?? 0) - (entity?._enchantMods?.increasedArmorMod ?? 0);
export const enchantSkillMod = (entity, skill) => entity?._enchantMods?.skillMods?.[skill] ?? 0;
export const entityImprovedAthleticism = (entity) => entity?._enchantMods?.improvedAthleticism ?? false;
export const entityImprovedAcuteHearing = (entity) => entity?._enchantMods?.improvedAcuteHearing ?? false;
export const entityImprovedAdrenalineRush = (entity) => entity?._enchantMods?.improvedAdrenalineRush ?? false;
export const entityAbsorbsSpells = (entity) => entity?._enchantMods?.absorbsSpells ?? false;
export const enchantWeightAllowanceMult = (entity) => entity?._enchantMods?.weightAllowanceMult ?? 0;
export const liveMaxMagicka = (entity) => {
  const desc = entity ? Object.getOwnPropertyDescriptor(entity, 'maxMagicka') : null;
  if (desc?.get) return entity.maxMagicka;
  return (entity?.maxMagicka ?? 0) + (entity?._enchantMods?.maxMagicka ?? 0);
};

setEnchantmentHooks({
  onEquipChange: (entity) => { if (entity?._enchantMods || equippedEnchantedItems(entity).length) computeEnchantmentMods(entity); },
  onItemBroken: (item, owner, say) => doItemEnchantmentPayloads(PAYLOAD.Breaks, item, { entity: owner, ctx: { say } }),
  onItemEquipped: (entity, item) => {
    if (!isEnchantedItem(item)) return;
    const nowMinutes = mergeCtx(null)?.now?.() ?? 0;
    // Decide the free re-wear once per piece, before its first held power restamps the clock.
    const ctx = heldEquipIsFree(item, nowMinutes) ? { heldEquipFree: true } : null;
    doItemEnchantmentPayloads(PAYLOAD.Equipped | PAYLOAD.Held, item, { entity, nowMinutes, ctx });
  },
  onItemUnequipped: (entity, item) => {
    if (!isEnchantedItem(item)) return;
    doItemEnchantmentPayloads(PAYLOAD.Unequipped, item, { entity });
  },
});
