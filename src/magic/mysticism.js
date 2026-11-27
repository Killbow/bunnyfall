// The ten Mysticism effect laws ported from DFU; none supports magnitude, and their picker windows live in the UI.
import { EFFECT_FLAGS } from './spellcast.js';
import { isSilencedEffect, BUFF_START_TEXT, WATER_WALKING_SILENT_KIND, BUFF_KINDS } from './effects.js';
import { hasArtifactSubtype, ARTIFACTS } from '../items/artifactEffects.js';
import { setEnchantmentEffectDoors } from './enchantments.js';
import { localizedStrings, localizedText } from '../ui/textManager.js';
import { DISH_STAMINA_KIND } from '../professions/cookItems.js';

export const MYSTICISM_EFFECTS = Object.freeze({
  DispelMagic: { type: 6, subType: 0, chance: [120, 180], duration: null },
  DispelUndead: { type: 6, subType: 1, chance: [80, 140], duration: null },
  DispelDaedra: { type: 6, subType: 2, chance: [120, 180], duration: null },
  CreateItem: { type: 2, subType: 255, chance: null, duration: [60, 120] },
  SoulTrap: { type: 12, subType: 255, chance: [40, 68], duration: [60, 68] },
  Lock: { type: 16, subType: 255, chance: [28, 120, 120], duration: null },
  Open: { type: 17, subType: 255, chance: [20, 100], duration: null },
  Silence: { type: 19, subType: 255, chance: [20, 100], duration: [20, 100] },
  Teleport: { type: 43, subType: 255, chance: null, duration: null },
  ComprehendLanguages: { type: 44, subType: 255, chance: [40, 68], duration: [60, 68] },
});

export const SUPPORTS_MAGNITUDE = false;

export const MYSTICISM_ELEMENT_FLAG = EFFECT_FLAGS.Magic;

export const isMysticism = (e) => Object.values(MYSTICISM_EFFECTS)
  .some((m) => m.type === e?.type && m.subType === (e?.subType & 0xff));

// As in DFU, only artifact archive 432 (male) passes, so a female character unlocks only to her own level.
export function castBySkeletonKey(item) {
  return !!item && item.artifact === true
    && item.worldTextureArchive === 432 && item.worldTextureRecord === 20;
}

// The holder's level is read at the trigger, not at the cast, as in DFU.
export function triggerOpen(door, holderLevel, { castBySkeletonKey = false } = {}) {
  const out = { unlocked: false, opened: false, alert: null };
  if (door.currentLockValue > 0) {
    if (castBySkeletonKey || door.currentLockValue <= holderLevel) {
      door.currentLockValue = 0;
      out.unlocked = true;
    } else {
      out.alert = 'openFailed';
    }
  }
  if (door.currentLockValue === 0 && door.state === 'start') {
    out.opened = true;
  }
  return out;
}

export function triggerLock(door, holderLevel) {
  if (door.currentLockValue > 0) {
    return { locked: false, closed: false, alert: 'doorAlreadyLocked' };
  }
  door.currentLockValue = holderLevel;
  const closed = door.state === 'end';
  return { locked: true, closed, alert: 'doorLocked' };
}

// Unlike an interior door, a building door gives the Skeleton's Key no exemption, as in DFU.
export function triggerExteriorOpen(buildingLockValue, holderLevel) {
  if (holderLevel < buildingLockValue) return { opened: false, alert: 'openFailed' };
  return { opened: true, alert: null };
}

// A dispelled enemy is removed, not killed, so it drops no loot and gives no quest credit, as in classic.
export function dispelNearby(nearby, rollChance) {
  const gone = [];
  for (const obj of nearby ?? []) {
    if (obj && rollChance()) gone.push(obj);
  }
  return gone;
}

export const DISPELLABLE_BUNDLE_TYPES = Object.freeze(['Spell', 'HeldMagicItem']);
export function dispellableBundles(bundles) {
  return (bundles ?? []).filter((b) =>
    DISPELLABLE_BUNDLE_TYPES.includes(b?.bundleType) && b?.showIcon !== false);
}

const NO_ICON_KINDS = new Set(['openArmed', 'lockArmed', WATER_WALKING_SILENT_KIND]);
export function liveBundles(entity) {
  const byId = new Map();
  for (const a of entity?.activeEffects ?? []) {
    if (a.ended || a.bundleId == null) continue;
    let b = byId.get(a.bundleId);
    if (!b) {
      b = { bundleId: a.bundleId, name: a.bundleName ?? '', spellIndex: a.bundleSpellIndex ?? null, bundleType: a.bundleType ?? 'Spell',
        icon: a.bundleIcon ?? 0, selfCast: !!a.bundleSelfCast,
        ally: !!a.bundleAlly,
        entries: [], showIcon: false };
      byId.set(a.bundleId, b);
    }
    b.entries.push(a);
    if (!NO_ICON_KINDS.has(a.kind) || b.bundleType === 'HeldMagicItem') b.showIcon = true;
  }
  return [...byId.values()];
}

// As in DFU, a bundle the player cast on themselves is always dispelled; only one cast at them rolls.
export function dispelBundle(entity, bundleId, { selfCast = false, roll01 = 0, chance = 0 } = {}) {
  const list = entity?.activeEffects ?? [];
  const doomed = list.filter((a) => a.bundleId === bundleId);
  if (!doomed.length) return { removed: 0, alert: null };
  if (!selfCast && Math.floor(roll01 * 100) >= chance) {
    return { removed: 0, alert: 'dispelMagicFailed' };
  }
  entity.activeEffects = list.filter((a) => a.bundleId !== bundleId);
  return { removed: doomed.length, alert: 'dispelMagicSuccess' };
}

// Every entry's kind is checked because an enemy effect can merge into a bundle the player cast.
export const ENDABLE_KINDS = Object.freeze(new Set([
  'shield', 'fortifyAttribute', 'regenerate', 'elementalResistance',
  'spellAbsorption', 'spellReflection', 'spellResistance', 'comprehendLanguages',
  'healHealth', 'healFatigue', 'healSpellPoints', 'healAttribute',
  DISH_STAMINA_KIND,
  ...Object.values(BUFF_KINDS).filter((k) => k !== 'silenced'),
]));
export function canEndBundle(bundle) {
  if (!bundle || bundle.bundleType === 'HeldMagicItem') return false;
  const entries = bundle.entries ?? [];
  return entries.length > 0 && entries.every((a) => !a.bundleDuel && !a.permanent && ENDABLE_KINDS.has(a.kind));
}
export function endBundle(entity, bundleId) {
  const bundle = liveBundles(entity).find((b) => b.bundleId === bundleId);
  if (!canEndBundle(bundle)) return null;
  dispelBundle(entity, bundleId, { selfCast: true });
  return String(bundle.name ?? '').replace(/^!+/, '') || 'The spell';
}
export const endedSpellText = (name) => `${name} ends.`;

export const DISPEL_MAGIC_TEXT = localizedStrings({
  dispelMagicSuccess: 'Dispel magic was a success...',
  dispelMagicFailed: 'Dispel magic failed...',
});

export const SOUL_TRAP_TEMPLATE = 274;

// Azura's Star fills before any ordinary gem, as DFU chooses; classic took whichever came first in the pack.
export function fillEmptyTrap(items, soulType, {
  azurasStarOnly = false,
  isAzurasStar = (it) => hasArtifactSubtype(it, ARTIFACTS.AzurasStar),
  isSoulTrap = (it) => it?.group === 'MiscItems' && it?.templateIndex === SOUL_TRAP_TEMPLATE,
} = {}) {
  const empty = (it) => (it?.trappedSoulType ?? null) === null;
  let trap = (items ?? []).find((it) => isAzurasStar(it) && empty(it)) ?? null;
  if (!trap && azurasStarOnly) return null;
  if (!trap) trap = (items ?? []).find((it) => isSoulTrap(it) && empty(it)) ?? null;
  if (!trap) return null;
  trap.trappedSoulType = soulType;
  return trap;
}

export const SOUL_BOUND_MONSTER_ID_COUNT = 43;

export function enumerateFilledTraps(items, {
  isAzurasStar = (it) => hasArtifactSubtype(it, ARTIFACTS.AzurasStar),
  isSoulTrap = (it) => it?.group === 'MiscItems' && it?.templateIndex === SOUL_TRAP_TEMPLATE,
} = {}) {
  const found = new Set();
  for (const it of items ?? []) {
    const soul = it?.trappedSoulType ?? null;
    if (soul === null) continue;
    if (isSoulTrap(it) && soul < SOUL_BOUND_MONSTER_ID_COUNT) found.add(soul);
    else if (isAzurasStar(it)) found.add(soul);
  }
  return found;
}

// As in DFU, the first ordinary trap with the soul is removed; only if none matches is every matching Star emptied.
/** @returns {object|null} */
export function removeFilledTrap(items, monsterID, {
  isAzurasStar = (it) => hasArtifactSubtype(it, ARTIFACTS.AzurasStar),
  isSoulTrap = (it) => it?.group === 'MiscItems' && it?.templateIndex === SOUL_TRAP_TEMPLATE,
} = {}) {
  if (!Array.isArray(items)) return null;
  if (!(monsterID >= 0) || monsterID >= SOUL_BOUND_MONSTER_ID_COUNT) return null;
  for (const it of items) {
    if (isSoulTrap(it) && it?.trappedSoulType === monsterID) {
      items.splice(items.indexOf(it), 1);
      return it;
    }
  }
  let emptied = null;
  for (const it of items) {
    if (isAzurasStar(it) && it?.trappedSoulType === monsterID) { it.trappedSoulType = null; emptied ??= it; }
  }
  return emptied;
}

export const SOUL_TRAP_TEXT = localizedStrings({
  trapActive: 'Trap active.',
  trapHumanoid: 'Trap will not work on humanoids.',
  trapSuccess: 'Trapped soul.',
  trapFail: 'Trap failed.',
  trapNoneEmpty: 'You have no empty soul traps!',
});

// With no empty gem the target stays at 1 health and does not die; the chance is rolled here, at the kill.
export function attemptSoulTrap(target, soulType, items, roll01, { azurasStarOnly = false } = {}) {
  const trap = (target?.activeEffects ?? []).find((a) => a.kind === 'soulTrap' && !a.ended);
  if (!trap) return { allowDeath: true, alert: null, filled: null };
  if (Math.floor(roll01 * 100) >= (trap.chance ?? 0)) {
    return { allowDeath: true, alert: 'trapFail', filled: null };
  }
  const filled = fillEmptyTrap(items, soulType, { azurasStarOnly });
  if (filled) return { allowDeath: true, alert: 'trapSuccess', filled };
  return { allowDeath: false, alert: 'trapNoneEmpty', filled: null };
}

export function peerSoulTrapOf(target) {
  const trap = (target?.activeEffects ?? []).find((a) => a.kind === 'soulTrap' && !a.ended);
  return trap && typeof trap.by === 'string' ? trap : null;
}

export function soulTrapNameSuffix(item, enemyName) {
  if (item?.group !== 'MiscItems' || item?.templateIndex !== SOUL_TRAP_TEMPLATE) return '';
  const soul = item?.trappedSoulType;
  if (soul === null || soul === undefined) return '';
  const name = enemyName?.(soul);
  return name ? ` (${name})` : '';
}

// As in DFU, Silence blocks only casts that cost spell points, so item casts still fire.
export const isSilenced = (entity) => !!entity?.isSilenced || isSilencedEffect(entity);

export function silenceBlocksCast(entity, { costsSpellPoints = true } = {}) {
  return costsSpellPoints && isSilenced(entity);
}
export const DOOR_SPELL_TEXT = localizedStrings({
  readyToOpen: 'Ready to open.',
  openFailed: 'Lock is too powerful.',
  readyToLock: 'Ready to lock.',
  doorLocked: 'Door is now locked.',
  doorAlreadyLocked: 'Door already locked.',
  spellEffectFailed: 'Spell effect failed.',
});

export const SILENCED_TEXT = BUFF_START_TEXT.silenced;
export const silencedText = () => BUFF_START_TEXT.silenced;
export const PRESS_BUTTON_TO_FIRE_SPELL = 'Press button to fire spell.';
export const pressButtonToFireSpellText = () => localizedText('pressButtonToFireSpell', PRESS_BUTTON_TO_FIRE_SPELL);

setEnchantmentEffectDoors({ removeFilledTrap });
