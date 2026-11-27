// The special advantages and disadvantages rules from DFU's CreateCharSpecialAdvantageWindow
// (MIT, Daggerfall Workshop): the pick lists, limits, incompatible pairs, and difficulty table.
import { localizedStrings } from '../ui/textManager.js';

export const ADVANTAGE_KEYS = Object.freeze([
  'acuteHearing', 'adrenalineRush', 'athleticism', 'bonusToHit',
  'expertiseIn', 'immunity', 'increasedMagery', 'rapidHealing',
  'regenerateHealth', 'resistance', 'spellAbsorption',
]);
export const DISADVANTAGE_KEYS = Object.freeze([
  'criticalWeakness', 'damage', 'darknessPoweredMagery',
  'forbiddenArmorType', 'forbiddenMaterial', 'forbiddenShieldTypes',
  'forbiddenWeaponry', 'inabilityToRegen', 'lightPoweredMagery',
  'lowTolerance', 'phobia',
]);

const ENEMY_TYPES = Object.freeze(['animals', 'daedra', 'humanoid', 'undead']);
const WEAPON_TYPES = Object.freeze(['axe', 'bluntWeapon', 'handToHand', 'longBlade', 'missileWeapon', 'shortBlade']);
const EFFECT_TYPES = Object.freeze(['toDisease', 'toFire', 'toFrost', 'toMagic', 'toParalysis', 'toPoison', 'toShock']);
const INCREASED_MAGERY = Object.freeze(['intInSpellPoints15', 'intInSpellPoints175', 'intInSpellPoints2', 'intInSpellPoints3', 'intInSpellPoints']);
const EFFECT_ENV = Object.freeze(['general', 'inDarkness', 'inLight']);
const REGEN_HEALTH = Object.freeze(['general', 'inDarkness', 'inLight', 'whileImmersed']);
const DAMAGE_ENV = Object.freeze(['fromHolyPlaces', 'fromSunlight']);
const DARKNESS_POWERED = Object.freeze(['lowerMagicAbilityDaylight', 'unableToUseMagicInDaylight']);
const LIGHT_POWERED = Object.freeze(['lowerMagicAbilityDarkness', 'unableToUseMagicInDarkness']);
const ARMOR_TYPES = Object.freeze(['chain', 'leather', 'plate']);
const MATERIALS = Object.freeze(['adamantium', 'daedric', 'dwarven', 'ebony', 'elven', 'iron', 'mithril', 'orcish', 'silver', 'steel']);
const SHIELD_TYPES = Object.freeze(['buckler', 'kiteShield', 'roundShield', 'towerShield']);

export function secondaryListFor(primaryKey) {
  switch (primaryKey) {
    case 'bonusToHit': case 'phobia': return ENEMY_TYPES;
    case 'expertiseIn': case 'forbiddenWeaponry': return WEAPON_TYPES;
    case 'immunity': case 'resistance': case 'criticalWeakness': case 'lowTolerance': return EFFECT_TYPES;
    case 'increasedMagery': return INCREASED_MAGERY;
    case 'rapidHealing': case 'spellAbsorption': return EFFECT_ENV;
    case 'regenerateHealth': return REGEN_HEALTH;
    case 'damage': return DAMAGE_ENV;
    case 'darknessPoweredMagery': return DARKNESS_POWERED;
    case 'lightPoweredMagery': return LIGHT_POWERED;
    case 'forbiddenArmorType': return ARMOR_TYPES;
    case 'forbiddenMaterial': return MATERIALS;
    case 'forbiddenShieldTypes': return SHIELD_TYPES;
    default: return null;
  }
}

export const ONLY_ONE_KEYS = Object.freeze(['increasedMagery', 'darknessPoweredMagery', 'lightPoweredMagery']);

export const MAX_ITEMS = 7;

export const LABELS = localizedStrings({
  acuteHearing: 'Acute Hearing', adrenalineRush: 'Adrenaline Rush', athleticism: 'Athleticism',
  bonusToHit: 'Bonus to hit', expertiseIn: 'Expertise in', immunity: 'Immunity',
  increasedMagery: 'Increased Magery', rapidHealing: 'Rapid Healing',
  regenerateHealth: 'Regenerate Health', resistance: 'Resistance', spellAbsorption: 'Spell Absorption',
  criticalWeakness: 'Critical Weakness', damage: 'Damage',
  darknessPoweredMagery: 'Darkness-Powered Magery', forbiddenArmorType: 'Forbidden Armor Type',
  forbiddenMaterial: 'Forbidden Material', forbiddenShieldTypes: 'Forbidden Shield Types',
  forbiddenWeaponry: 'Forbidden Weaponry', inabilityToRegen: 'Inability To Regen Spell Points',
  lightPoweredMagery: 'Light-Powered Magery', lowTolerance: 'Low Tolerance', phobia: 'Phobia',
  animals: 'Animals', daedra: 'Daedra', humanoid: 'Humanoid', undead: 'Undead',
  axe: 'Axe', bluntWeapon: 'Blunt Weapon', handToHand: 'Hand-to-Hand',
  longBlade: 'Long Blade', missileWeapon: 'Missile Weapon', shortBlade: 'Short Blade',
  toDisease: 'To Disease', toFire: 'To Fire', toFrost: 'To Frost', toMagic: 'To Magic',
  toParalysis: 'To Paralysis', toPoison: 'To Poison', toShock: 'To Shock',
  intInSpellPoints15: '1.5X INT In Spell Points', intInSpellPoints175: '1.75X INT In Spell Points',
  intInSpellPoints2: '2X INT In Spell Points', intInSpellPoints3: '3X INT In Spell Points',
  intInSpellPoints: 'INT In Spell Points',
  general: 'General', inDarkness: 'In Darkness', inLight: 'In Light',
  whileImmersed: 'While Immersed In Water',
  fromHolyPlaces: 'From Holy Places', fromSunlight: 'From Sunlight',
  lowerMagicAbilityDaylight: 'Lower Magic Ability In Daylight',
  unableToUseMagicInDaylight: 'Unable To Use Magic In Daylight',
  lowerMagicAbilityDarkness: 'Lower Magic Ability In Darkness',
  unableToUseMagicInDarkness: 'Unable To Use Magic In Darkness',
  chain: 'Chain', leather: 'Leather', plate: 'Plate',
  adamantium: 'Adamantium', daedric: 'Daedric', dwarven: 'Dwarven', ebony: 'Ebony',
  elven: 'Elven', iron: 'Iron', mithril: 'Mithril', orcish: 'Orcish',
  silver: 'Silver', steel: 'Steel',
  buckler: 'Buckler', kiteShield: 'Kite Shield', roundShield: 'Round Shield', towerShield: 'Tower Shield',
});
export const labelFor = (key) => LABELS[key] ?? '';

export const DIFFICULTY = Object.freeze({
  acuteHearing: 1, adrenalineRush: 4, athleticism: 4,
  bonusToHitanimals: 6, bonusToHitdaedra: 3, bonusToHithumanoid: 6, bonusToHitundead: 6,
  expertiseIn: 2, immunity: 10,
  increasedMageryintInSpellPoints: 2, increasedMageryintInSpellPoints15: 4,
  increasedMageryintInSpellPoints175: 6, increasedMageryintInSpellPoints2: 8,
  increasedMageryintInSpellPoints3: 10,
  rapidHealinggeneral: 4, rapidHealinginDarkness: 3, rapidHealinginLight: 2,
  regenerateHealthgeneral: 14, regenerateHealthinDarkness: 10,
  regenerateHealthinLight: 6, regenerateHealthwhileImmersed: 2,
  resistance: 5,
  spellAbsorptiongeneral: 14, spellAbsorptioninDarkness: 12, spellAbsorptioninLight: 8,
  criticalWeakness: -14,
  damagefromHolyPlaces: -6, damagefromSunlight: -10,
  darknessPoweredMagerylowerMagicAbilityDaylight: -7,
  darknessPoweredMageryunableToUseMagicInDaylight: -10,
  forbiddenArmorTypechain: -2, forbiddenArmorTypeleather: -1, forbiddenArmorTypeplate: -5,
  forbiddenMaterialadamantium: -5, forbiddenMaterialdaedric: -2, forbiddenMaterialdwarven: -7,
  forbiddenMaterialebony: -5, forbiddenMaterialelven: -9, forbiddenMaterialiron: -1,
  forbiddenMaterialmithril: -6, forbiddenMaterialorcish: -3, forbiddenMaterialsilver: -6,
  forbiddenMaterialsteel: -10,
  forbiddenShieldTypes: -1, forbiddenWeaponry: -2, inabilityToRegen: -14,
  lightPoweredMagerylowerMagicAbilityDarkness: -10,
  lightPoweredMageryunableToUseMagicInDarkness: -14,
  lowTolerance: -5, phobia: -4,
});

const SECONDARY_BLIND = Object.freeze(new Set([
  'expertiseIn', 'immunity', 'resistance', 'criticalWeakness',
  'forbiddenShieldTypes', 'forbiddenWeaponry', 'lowTolerance', 'phobia',
]));
export function advDisAdjustment(primary, secondary = '') {
  return DIFFICULTY[SECONDARY_BLIND.has(primary) ? primary : primary + secondary] ?? 0;
}

export const totalAdjust = (list) => list.reduce((a, s) => a + (s.difficulty ?? 0), 0);

function isMatchingAdvPair(str1, str2, candidate, incumbent) {
  return ((candidate.primary === str1 && incumbent.primary === str2)
       || (candidate.primary === str2 && incumbent.primary === str1))
      && candidate.secondary === incumbent.secondary;
}
const EXCLUSIVE_PAIRS = Object.freeze([
  ['bonusToHit', 'phobia'],
  ['expertiseIn', 'forbiddenWeaponry'],
  ['immunity', 'resistance'], ['immunity', 'criticalWeakness'], ['immunity', 'lowTolerance'],
  ['resistance', 'lowTolerance'], ['resistance', 'criticalWeakness'],
  ['lowTolerance', 'criticalWeakness'],
]);

export function cannotAdd(candidate, advDisList, otherList = []) {
  for (const incumbent of [...advDisList, ...otherList]) {
    if (candidate.primary === incumbent.primary && candidate.secondary === incumbent.secondary) return true;
    for (const [a, b] of EXCLUSIVE_PAIRS) if (isMatchingAdvPair(a, b, candidate, incumbent)) return true;
  }
  return false;
}

export const EFFECT_BITS = Object.freeze({
  toParalysis: 1, toMagic: 2, toPoison: 4, toFire: 8, toFrost: 16, toShock: 32, toDisease: 64,
});
export const PROFICIENCY_BITS = Object.freeze({
  shortBlade: 1, longBlade: 2, handToHand: 4, axe: 8, bluntWeapon: 16, missileWeapon: 32,
});
export const ARMOR_BITS = Object.freeze({ leather: 1, chain: 2, plate: 4 });
export const ARMOR_BITS_SHIFT = 6;
export const SHIELD_BITS = Object.freeze({ buckler: 1, roundShield: 2, kiteShield: 4, towerShield: 8 });
export const MATERIAL_BITS = Object.freeze({
  iron: 1, steel: 2, silver: 4, elven: 8, dwarven: 16,
  mithril: 32, adamantium: 64, ebony: 128, orcish: 256, daedric: 512,
});
export const SPECIAL_ABILITY_BITS = Object.freeze({
  acuteHearing: 1, athleticism: 2, adrenalineRush: 4,
  noRegenSpellPoints: 8, sunDamage: 16, holyDamage: 32,
});
export const ABSORPTION_FLAGS = Object.freeze({ general: 4, inDarkness: 2, inLight: 1 });
export const REGENERATION_FLAGS = Object.freeze({ general: 8, inDarkness: 2, inLight: 1, whileImmersed: 4 });
export const RAPID_HEALING_FLAGS = Object.freeze({ general: 4, inDarkness: 2, inLight: 1 });
const ATTACK_BITS = Object.freeze({ undead: [0x01, 0x10], daedra: [0x02, 0x20], humanoid: [0x04, 0x40], animals: [0x08, 0x80] });
const MAGERY_MULT_BITS = Object.freeze({
  intInSpellPoints: 16, intInSpellPoints15: 12, intInSpellPoints175: 8,
  intInSpellPoints2: 4, intInSpellPoints3: 0,
});
export const DEFAULT_MAGERY_BITS = 20;

const setAbility = (career, bit) => { career.abilityFlagsAndSpellPointsBitfield |= bit; };

export function parseCareerData(career, list) {
  for (const { primary, secondary } of list) {
    switch (primary) {
      case 'bonusToHit': career.attackModifierFlags |= ATTACK_BITS[secondary]?.[0] ?? 0; break;
      case 'phobia': career.attackModifierFlags |= ATTACK_BITS[secondary]?.[1] ?? 0; break;
      case 'expertiseIn':
        career.weaponArmorShieldsBitfield |= (PROFICIENCY_BITS[secondary] ?? 0) << 16; break;
      case 'forbiddenWeaponry':
        career.weaponArmorShieldsBitfield |= PROFICIENCY_BITS[secondary] ?? 0; break;
      case 'immunity': career.immunityFlags |= EFFECT_BITS[secondary] ?? 0; break;
      case 'resistance': career.resistanceFlags |= EFFECT_BITS[secondary] ?? 0; break;
      case 'criticalWeakness': career.criticalWeaknessFlags |= EFFECT_BITS[secondary] ?? 0; break;
      case 'lowTolerance': career.lowToleranceFlags |= EFFECT_BITS[secondary] ?? 0; break;
      case 'increasedMagery': {
        const bits = MAGERY_MULT_BITS[secondary];
        if (bits != null) {
          career.abilityFlagsAndSpellPointsBitfield =
            (career.abilityFlagsAndSpellPointsBitfield & ~0x1C00) | (bits << 8);
        }
        break;
      }
      case 'rapidHealing': career.rapidHealing = RAPID_HEALING_FLAGS[secondary] ?? 0; break;
      case 'spellAbsorption': career.spellAbsorptionFlags = ABSORPTION_FLAGS[secondary] ?? 0; break;
      case 'regenerateHealth': career.regeneration = REGENERATION_FLAGS[secondary] ?? 0; break;
      case 'damage':
        setAbility(career, secondary === 'fromSunlight' ? SPECIAL_ABILITY_BITS.sunDamage : SPECIAL_ABILITY_BITS.holyDamage);
        break;
      case 'darknessPoweredMagery': {
        const v = secondary === 'unableToUseMagicInDaylight' ? 1 : 2;
        career.abilityFlagsAndSpellPointsBitfield =
          (career.abilityFlagsAndSpellPointsBitfield & ~0x300) | (v << 8);
        break;
      }
      case 'lightPoweredMagery': {
        const v = secondary === 'unableToUseMagicInDarkness' ? 1 : 2;
        career.abilityFlagsAndSpellPointsBitfield =
          (career.abilityFlagsAndSpellPointsBitfield & ~0x00C0) | (v << 6);
        break;
      }
      case 'forbiddenArmorType':
        career.weaponArmorShieldsBitfield |= (ARMOR_BITS[secondary] ?? 0) << ARMOR_BITS_SHIFT; break;
      case 'forbiddenShieldTypes':
        career.weaponArmorShieldsBitfield |= (SHIELD_BITS[secondary] ?? 0) << 9; break;
      case 'forbiddenMaterial':
        career.forbiddenMaterialsFlags |= MATERIAL_BITS[secondary] ?? 0; break;
      case 'inabilityToRegen': setAbility(career, SPECIAL_ABILITY_BITS.noRegenSpellPoints); break;
      case 'acuteHearing': setAbility(career, SPECIAL_ABILITY_BITS.acuteHearing); break;
      case 'athleticism': setAbility(career, SPECIAL_ABILITY_BITS.athleticism); break;
      case 'adrenalineRush': setAbility(career, SPECIAL_ABILITY_BITS.adrenalineRush); break;
      default: break;
    }
  }
  career.weaponArmorShieldsBitfield >>>= 0;
  career.abilityFlagsAndSpellPointsBitfield >>>= 0;
  return career;
}

const TOLERANCE_READ = Object.freeze([
  ['resistanceFlags', 'resistance'], ['immunityFlags', 'immunity'],
  ['lowToleranceFlags', 'lowTolerance'], ['criticalWeaknessFlags', 'criticalWeakness'],
]);
const EFFECT_ORDER = Object.freeze(['toParalysis', 'toMagic', 'toPoison', 'toFire', 'toFrost', 'toShock', 'toDisease']);
const PROFICIENCY_ORDER = Object.freeze(['shortBlade', 'longBlade', 'handToHand', 'axe', 'bluntWeapon', 'missileWeapon']);
const ATTACK_ORDER = Object.freeze(['undead', 'daedra', 'humanoid', 'animals']);

const ADVANTAGE_SET = new Set(ADVANTAGE_KEYS);
const bitsOf = (table, value) => Object.keys(table).filter((k) => (value & table[k]) === table[k] && table[k] !== 0);
const keyForValue = (table, value) => Object.keys(table).find((k) => table[k] === value) ?? null;

/**
 * @param career
 * @param race
 * @returns {{primary:string, secondary:string, label:string, kind:'advantage'|'disadvantage', source:'career'|'race'}[]}
 */
export function classSpecials(career, race = null) {
  const c = career ?? {};
  const out = [];
  const seen = new Set();
  const add = (primary, secondary = '', source = 'career') => {
    const k = `${primary}|${secondary}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      primary,
      secondary,
      label: secondary ? `${labelFor(primary)} ${labelFor(secondary)}` : labelFor(primary),
      kind: ADVANTAGE_SET.has(primary) ? 'advantage' : 'disadvantage',
      source,
    });
  };

  for (const effect of EFFECT_ORDER) {
    const bit = EFFECT_BITS[effect];
    const hit = TOLERANCE_READ.find(([field]) => ((c[field] ?? 0) & bit) === bit);
    if (hit) add(hit[1], effect);
  }
  const wasb = c.weaponArmorShieldsBitfield ?? 0;
  for (const weapon of PROFICIENCY_ORDER) {
    const bit = PROFICIENCY_BITS[weapon];
    if ((wasb & bit) === bit) add('forbiddenWeaponry', weapon);
    else if (((wasb >>> 16) & bit) === bit) add('expertiseIn', weapon);
  }
  const atk = c.attackModifierFlags ?? 0;
  for (const group of ATTACK_ORDER) {
    const [bonus, phobia] = ATTACK_BITS[group];
    if ((atk & bonus) === bonus) add('bonusToHit', group);
    else if ((atk & phobia) === phobia) add('phobia', group);
  }
  const ability = c.abilityFlagsAndSpellPointsBitfield ?? 0;
  const dark = (ability >>> 8) & 0x3;
  if (dark & 2) add('darknessPoweredMagery', 'lowerMagicAbilityDaylight');
  if (dark & 1) add('darknessPoweredMagery', 'unableToUseMagicInDaylight');
  const light = (ability >>> 6) & 0x3;
  if (light & 2) add('lightPoweredMagery', 'lowerMagicAbilityDarkness');
  if (light & 1) add('lightPoweredMagery', 'unableToUseMagicInDarkness');
  for (const material of bitsOf(MATERIAL_BITS, c.forbiddenMaterialsFlags ?? 0)) add('forbiddenMaterial', material);
  for (const shield of bitsOf(SHIELD_BITS, (wasb >>> 9) & 0xf)) add('forbiddenShieldTypes', shield);
  for (const armor of bitsOf(ARMOR_BITS, (wasb >>> ARMOR_BITS_SHIFT) & 0x7)) add('forbiddenArmorType', armor);
  if (c.abilityFlagsAndSpellPointsBitfield != null) {
    const magery = (ability & 0x1C00) >> 8;
    if (magery !== DEFAULT_MAGERY_BITS) {
      const key = keyForValue(MAGERY_MULT_BITS, magery);
      if (key) add('increasedMagery', key);
    }
  }
  const absorb = keyForValue(ABSORPTION_FLAGS, c.spellAbsorptionFlags ?? 0);
  if (absorb) add('spellAbsorption', absorb);
  if ((ability & SPECIAL_ABILITY_BITS.noRegenSpellPoints) === SPECIAL_ABILITY_BITS.noRegenSpellPoints) add('inabilityToRegen');
  if ((ability & SPECIAL_ABILITY_BITS.acuteHearing) === SPECIAL_ABILITY_BITS.acuteHearing) add('acuteHearing');
  if ((ability & SPECIAL_ABILITY_BITS.athleticism) === SPECIAL_ABILITY_BITS.athleticism) add('athleticism');
  if ((ability & SPECIAL_ABILITY_BITS.adrenalineRush) === SPECIAL_ABILITY_BITS.adrenalineRush) add('adrenalineRush');
  const regen = keyForValue(REGENERATION_FLAGS, c.regeneration ?? 0);
  if (regen) add('regenerateHealth', regen);
  const rapid = keyForValue(RAPID_HEALING_FLAGS, c.rapidHealing ?? 0);
  if (rapid) add('rapidHealing', rapid);
  if ((ability & SPECIAL_ABILITY_BITS.sunDamage) === SPECIAL_ABILITY_BITS.sunDamage) add('damage', 'fromSunlight');
  if ((ability & SPECIAL_ABILITY_BITS.holyDamage) === SPECIAL_ABILITY_BITS.holyDamage) add('damage', 'fromHolyPlaces');

  if (race) {
    for (const effect of EFFECT_ORDER) {
      const bit = EFFECT_BITS[effect];
      if (((race.resistanceFlags ?? 0) & bit) === bit) add('resistance', effect, 'race');
      if (((race.immunityFlags ?? 0) & bit) === bit) add('immunity', effect, 'race');
      if (((race.lowToleranceFlags ?? 0) & bit) === bit) add('lowTolerance', effect, 'race');
      if (((race.criticalWeaknessFlags ?? 0) & bit) === bit) add('criticalWeakness', effect, 'race');
    }
    const abilities = race.specialAbilities ?? 0;
    if ((abilities & SPECIAL_ABILITY_BITS.acuteHearing) === SPECIAL_ABILITY_BITS.acuteHearing) add('acuteHearing', '', 'race');
    if ((abilities & SPECIAL_ABILITY_BITS.athleticism) === SPECIAL_ABILITY_BITS.athleticism) add('athleticism', '', 'race');
    if ((abilities & SPECIAL_ABILITY_BITS.adrenalineRush) === SPECIAL_ABILITY_BITS.adrenalineRush) add('adrenalineRush', '', 'race');
    if ((abilities & SPECIAL_ABILITY_BITS.noRegenSpellPoints) === SPECIAL_ABILITY_BITS.noRegenSpellPoints) add('inabilityToRegen', '', 'race');
    if ((abilities & SPECIAL_ABILITY_BITS.sunDamage) === SPECIAL_ABILITY_BITS.sunDamage) add('damage', 'fromSunlight', 'race');
    if ((abilities & SPECIAL_ABILITY_BITS.holyDamage) === SPECIAL_ABILITY_BITS.holyDamage) add('damage', 'fromHolyPlaces', 'race');
  }
  return out;
}

export const LABEL_ORIGIN = Object.freeze([8, 35]);
export const LABEL_SPACING = 8;
export const TANDEM_SPACING = 6;
export const LABEL_HIT_HEIGHT = 5;
export const MAX_LABELS = MAX_ITEMS * 2;

export function labelRows(list) {
  const rows = [];
  let y = LABEL_ORIGIN[1];
  for (let i = 0; i < list.length && rows.length < MAX_LABELS; i++) {
    const { primary, secondary } = list[i];
    rows.push({ text: labelFor(primary), y, index: i });
    if (secondary) {
      y += TANDEM_SPACING;
      rows.push({ text: labelFor(secondary), y, index: i });
    }
    y += LABEL_SPACING;
  }
  return rows;
}
