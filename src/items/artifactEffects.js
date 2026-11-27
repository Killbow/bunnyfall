import { savingThrow, ELEMENTS, EFFECT_FLAGS } from '../magic/spellcast.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { equipTableOf } from '../characters/equip.js';
// Import the enum from magicDef.js, not enchantments.js, which imports this module.
import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { liveStat as liveStatOf, increaseDrainMagnitude } from '../characters/statMods.js';
import { markWholeBlow } from '../party/partyScale.js';
import { SOCIAL_GROUP_COUNT } from '../formats/factionFile.js';
import { localizedText } from '../ui/textManager.js';

export const ARTIFACTS = Object.freeze({
  MasqueOfClavicus: 0, MehrunesRazor: 1, MaceOfMolagBal: 2, HircineRing: 3,
  SanguineRose: 4, OghmaInfinium: 5, Wabbajack: 6, RingOfNamira: 7,
  SkullOfCorruption: 8, AzurasStar: 9,
});

export const SOUL_RELEASED_TEXT_ID = 32;
export const NO_SOUL_TO_RELEASE_TEXT_ID = 20;
export const SUMMON_ENEMY_RANGE = 12;
export const SUMMON_DURABILITY_LOSS = 100;
export const OGHMA_BONUS_POOL = 30;
export const MACE_MAX_INCREASE_ROUNDS = 12;
export const NO_MONSTERS_NEARBY_TEXT = 'There are no monsters nearby.';
const noMonstersNearbyText = () => localizedText('noMonstersNearby', NO_MONSTERS_NEARBY_TEXT);

const MT = MOBILE_TYPES;
export const WABBAJACK_CAREER_IDS = Object.freeze([
  MT.Rat, MT.Imp, MT.Spriggan, MT.GiantBat, MT.GrizzlyBear, MT.Spider,
  MT.Nymph, MT.Harpy, MT.SkeletalWarrior, MT.Giant, MT.Zombie,
  MT.GiantScorpion, MT.IronAtronach, MT.FleshAtronach, MT.IceAtronach,
  MT.FireAtronach, MT.Lich,
]);

export function maceState(entity, mint = false) {
  let entry = (entity.activeEffects ?? []).find((a) => a.kind === 'artifact' && a.key === 'maceOfMolagBal' && !a.ended);
  if (!entry && mint) {
    entry = { kind: 'artifact', key: 'maceOfMolagBal', statMods: {}, statMaxMods: {}, maxMagickaIncrease: 0, lastStrikeTime: 0 };
    (entity.activeEffects ??= []).push(entry);
  }
  return entry ?? null;
}

export function hasArtifactSubtype(item, subtype) {
  const magic = item?.enchantments;
  if (!Array.isArray(magic) || magic.length === 0) return false;
  
  // Scan every slot: classic items keep the empty MAGIC.DEF slots that minted items drop, so a fixed index differs.
  return magic.some((e) => e?.type === ENCHANTMENT_TYPES.SpecialArtifactEffect && e.param === subtype);
}

export const hasArtifactEffect = (item) => (Array.isArray(item?.enchantments) ? item.enchantments : [])
  .some((e) => e?.type === ENCHANTMENT_TYPES.SpecialArtifactEffect);

export function isWearingArtifact(entity, subtype) {
  const slots = equipTableOf(entity);
  if (!slots) return false;
  for (const item of Object.values(slots)) {
    if (hasArtifactSubtype(item, subtype)) return true;
  }
  return false;
}
export const isAzurasStarEquipped = (entity) => isWearingArtifact(entity, ARTIFACTS.AzurasStar);

const HANDLERS = new Map([

  [ARTIFACTS.MasqueOfClavicus, {
    magicRound({ entity }) {
      const stats = entity?.stats;
      if (!stats) return;
      const amount = Math.trunc(liveStatOf(entity, 'personality') / 5);
      const mods = (entity.reactionMods ??= new Array(SOCIAL_GROUP_COUNT).fill(0));
      // The enchantment fold clears reactionMods each round, so the Masque adds its bonus again every round.
      for (let g = 0; g < mods.length; g++) mods[g] += amount;
    },
  }],

  [ARTIFACTS.MehrunesRazor, {
    strikes({ target, item, rolls = Math.random }) {
      if (!target || !item || target.spareGear) return null;
      if (savingThrow(ELEMENTS.Magic, EFFECT_FLAGS.Magic, target, 0, rolls) !== 0) {
        const healthRemoved = target.health ?? 0;
        markWholeBlow(target);
        return { strikesModulateDamage: healthRemoved, durabilityLoss: healthRemoved };
      }
      return null;
    },
  }],

  [ARTIFACTS.MaceOfMolagBal, {
    constant({ entity, mods }) {
      const st = maceState(entity);
      if (st?.maxMagickaIncrease) mods.maxMagicka += st.maxMagickaIncrease;
    },
    magicRound({ entity, nowMinutes }) {
      const st = maceState(entity);
      if (st && nowMinutes > (st.lastStrikeTime ?? 0) + MACE_MAX_INCREASE_ROUNDS) {
        st.maxMagickaIncrease = 0;
        st.statMaxMods = {};
        st.statMods = {};
      }
    },
    unequipped({ entity }) {
      const st = maceState(entity);
      // The decay never runs once the Mace is off, so unequipping ends the effect here, as classic Daggerfall does.
      if (st) entity.activeEffects.splice(entity.activeEffects.indexOf(st), 1);
    },
    strikes({ entity, target, damage, nowMinutes, rolls = Math.random }) {
      if (!entity || !target || damage === 0 || target.warded) return null;
      if (savingThrow(ELEMENTS.Magic, EFFECT_FLAGS.Magic, target, 0, rolls) === 0) return null;
      const st = maceState(entity, true);
      if ((target.magicka ?? 0) > 0) {
        const drained = Math.min(target.magicka, damage);
        target.magicka -= drained;
        const overflow = (entity.magicka ?? 0) + drained - (entity.maxMagicka ?? 0);
        if (overflow > 0) {
          // Raise the max at once so a second strike in the same round measures overflow against the new max.
          entity.maxMagickaModifier = (entity.maxMagickaModifier ?? 0) + overflow;
          st.maxMagickaIncrease += overflow;
        }
        entity.magicka = (entity.magicka ?? 0) + drained;
      } else {
        const strengthDrained = 1 + Math.min(5, Math.floor(rolls() * 6));
        drainStrength(target, strengthDrained);
        (st.statMaxMods ??= {}).strength = (st.statMaxMods.strength ?? 0) + strengthDrained;
        st.statMods.strength = (st.statMods.strength ?? 0) + strengthDrained;
      }
      st.lastStrikeTime = nowMinutes;
      return { durabilityLoss: damage };
    },
  }],

  [ARTIFACTS.SanguineRose, {
    used({ ctx }) {
      const nearby = (ctx?.nearbyFoes?.(SUMMON_ENEMY_RANGE) ?? []).filter((n) => n.team !== 'PlayerAlly');
      if (!nearby.length) { ctx?.say?.(noMonstersNearbyText()); return null; }
      ctx?.spawnAlliedFoe?.(MT.Daedroth);
      return { durabilityLoss: SUMMON_DURABILITY_LOSS };
    },
  }],

  [ARTIFACTS.OghmaInfinium, {
    used({ entity, ctx }) {
      if (!entity?.isPlayer) return null;
      entity.readyToLevelUp = true;
      entity.oghmaLevelUp = true;
      ctx?.openCharacterSheet?.();
      return { removeItem: true };
    },
  }],

  [ARTIFACTS.Wabbajack, {
    strikes({ target, ctx, rolls = Math.random }) {
      if (!target || target.isPlayer) return null;
      if (target.wabbajackActive) return null;
      let newType;
      do {
        newType = WABBAJACK_CAREER_IDS[Math.min(WABBAJACK_CAREER_IDS.length - 1, Math.floor(rolls() * WABBAJACK_CAREER_IDS.length))];
      } while (newType === target.mobileType);
      ctx?.replaceFoe?.(target, newType);
      return null;
    },
  }],

  [ARTIFACTS.SkullOfCorruption, {
    used({ ctx }) {
      const nearby = (ctx?.nearbyFoes?.(SUMMON_ENEMY_RANGE) ?? []).filter((n) => n.team !== 'PlayerAlly');
      if (!nearby.length) { ctx?.say?.(noMonstersNearbyText()); return null; }
      let nearest = nearby[0];
      for (const n of nearby.slice(1)) {
        if ((n.distance ?? Infinity) < (nearest.distance ?? Infinity)) nearest = n;
      }
      // Unreachable after the filter above; classic Daggerfall checks twice and both checks are kept.
      if (nearest.team === 'PlayerAlly') { ctx?.say?.(noMonstersNearbyText()); return null; }
      if (nearest.mobileType == null) { ctx?.say?.(noMonstersNearbyText()); return null; }
      ctx?.spawnAlliedFoe?.(nearest.mobileType);
      return { durabilityLoss: SUMMON_DURABILITY_LOSS };
    },
  }],

  [ARTIFACTS.AzurasStar, {
    used({ item, ctx }) {
      if (!item) return null;
      if ((item.trappedSoulType ?? null) !== null) {
        item.trappedSoulType = null;
        ctx?.messageBox?.(SOUL_RELEASED_TEXT_ID);
      } else {
        ctx?.messageBox?.(NO_SOUL_TO_RELEASE_TEXT_ID);
      }
      return null;
    },
  }],
]);

function drainStrength(target, amount) {
  let entry = (target.activeEffects ?? []).find((a) => a.kind === 'drainAttribute' && a.stat === 'strength' && !a.ended);
  if (!entry) {
    entry = { kind: 'drainAttribute', stat: 'strength', magnitude: 0, permanent: true };
    (target.activeEffects ??= []).push(entry);
  }
  // A real drain entry: the stat stops at 1 instead of killing, and Heal Strength repairs it.
  increaseDrainMagnitude(target, entry, amount);
}

export const SPECIAL_ARTIFACT_HANDLERS = HANDLERS;
export function artifactHook(hookName) {
  return (env) => HANDLERS.get(env.param)?.[hookName]?.(env) ?? null;
}

const _foeDoors = new WeakMap();
export function registerFoeDoor(entity, door) { if (entity && typeof entity === 'object' && typeof door === 'function') _foeDoors.set(entity, door); }

export function onPlayerStruckByEnemy(attacker, target, damage) {
  if (!target?.isPlayer || !attacker || damage <= 0) return;
  if (!isWearingArtifact(target, ARTIFACTS.RingOfNamira)) return;
  const team = ENEMY_BASICS[attacker.mobileType]?.team ?? null;
  let reflected;
  switch (team) {
    case 'Vermin': case 'Spriggans': case 'Bears': case 'Tigers':
    case 'Spiders': case 'Scorpions':
      return;
    case 'Daedra': reflected = Math.trunc(damage / 2); break;
    case 'Undead': reflected = damage * 2; break;
    default: reflected = damage; break;
  }
  // The ring takes no condition wear: classic Daggerfall drops the durability loss at this call site.
  const door = _foeDoors.get(attacker);
  if (door) door(reflected);
  else attacker.health = (attacker.health ?? 0) - reflected;
}
