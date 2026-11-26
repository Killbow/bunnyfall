import { SKILL_COUNT, SKILL_NAMES } from '../characters/skills.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { ENEMY_NAMES } from '../characters/enemyBasics.js';
import { localizedStrings } from '../ui/textManager.js';
import { getLocalizedSpellName, getLocalizedEnemyName } from '../ui/textManager.js';

// Single-cost effects store param -1 on the saved item, as classic does, so it must round-trip.
export const PARAM_NONE = -1;

export const SOUL_COUNT = 43;
const SOUL_NAMES = Object.freeze(ENEMY_NAMES.slice(0, SOUL_COUNT));

// `costs` is indexed by param, and `cost` alone takes param -1. `domain` prices every param below it the same, and
// `spells` is keyed by sparse spell ID in the classic order the picker shows.
export const ENCHANTMENT_COSTS = Object.freeze({
  BadReactionsFrom: { costs: [-120, -80, -120], labels: ['Humanoids', 'Animals', 'Daedra'] },
  BadRepWith: { costs: [-1000, -1000, -1000, -1000, -1000, -5000], labels: ['Commoners', 'Merchants', 'Scholars', 'Nobility', 'Underworld', 'All'] },
  ExtraSpellPts: { costs: [500, 500, 500, 500, 200, 200, 200, 700, 800, 900, 1000], labels: ['During Winter', 'During Spring', 'During Summer', 'During Fall', 'During Full Moon', 'During Half Moon', 'During New Moon', 'Near Undead', 'Near Daedra', 'Near Humanoids', 'Near Animals'] },
  GoodRepWith: { costs: [1000, 1000, 1000, 1000, 1000, 5000], labels: ['Commoners', 'Merchants', 'Scholars', 'Nobility', 'Underworld', 'All'] },
  HealthLeech: { costs: [-4000, -500, -200], labels: ['Whenever used', 'Unless used daily', 'Unless used weekly'] },
  ImprovesTalents: { costs: [500, 600, 600], labels: ['Hearing', 'Athleticism', 'Adrenaline Rush'] },
  IncreasedWeightAllowance: { costs: [400, 600], labels: ['25% additional', '50% additional'] },
  ItemDeteriorates: { costs: [-3000, -1500, -500], labels: ['all the time', 'in sunlight', 'in holy places'] },
  LowDamageVs: { costs: [-800, -900, -1000, -1200], labels: ['Undead', 'Daedra', 'Humanoid', 'Animals'] },
  PotentVs: { costs: [800, 900, 1000, 1200], labels: ['Undead', 'Daedra', 'Humanoid', 'Animals'] },
  RegensHealth: { costs: [4000, 3000, 3000], labels: ['all the time', 'in sunlight', 'in darkness'] },
  // Param 34 (the encounter Dragonling) costs -5000 like param 40, a deliberate change from the classic 0.
  SoulBound: { costs: [0, -10, -20, 0, 0, 0, 0, -10, -30, -90, -100, 0, -10, -30, -140, 0, -30, 0, -300, -100, 0, -30, -30, -300, -10, -500, -500, -100, -700, -1500, -1000, -8000, -1000, -2500, -5000, -300, -300, -300, -300, 0, -5000, -100, -100] },
  UserTakesDamage: { costs: [-6000, -1000], labels: ['in sunlight', 'in holy places'] },
  VampiricEffect: { costs: [2000, 1000], labels: ['at range', 'when strikes'] },

  AbsorbsSpells: { cost: 1500 },
  ExtraWeight: { cost: -100 },
  FeatherWeight: { cost: 100 },
  RepairsObjects: { cost: 900 },
  StrengthensArmor: { cost: 700 },
  WeakensArmor: { cost: -700 },

  EnhancesSkill: { cost: 900, domain: SKILL_COUNT },

  CastWhenUsed: {
    spells: [
      [4, 330, 'Levitate'], [5, 250, 'Light'], [6, 540, 'Invisibility'], [7, 480, "Wizard's Fire"],
      [8, 380, 'Shock'], [9, 480, 'Strength Leech'], [10, 1650, 'Free Action'], [18, 900, 'Open'],
      [11, 1560, 'Resist Cold'], [12, 1560, 'Resist Fire'], [13, 1560, 'Resist Shock'], [19, 1740, 'Wizard Lock'],
      [14, 470, 'Fireball'], [15, 1020, 'Cure Poison'], [16, 990, 'Ice Bolt'], [17, 1040, 'Shield'],
      [22, 1980, 'Spell Shield'], [23, 1530, 'Silence'], [24, 920, "Troll's Blood"], [20, 1420, 'Ice Storm'],
      [25, 840, 'Fire Storm'], [26, 1650, 'Resist Poison'], [33, 1020, 'Wildfire'], [27, 1300, 'Spell Drain'],
      [28, 2290, 'Far Silence'], [29, 1020, 'Toxic Cloud'], [34, 1610, 'Wizard Rend'], [30, 1930, "Shalidor's Mirror"],
      [31, 760, 'Lightning'], [35, 2140, "Medusa's Gaze"], [36, 3030, 'Force Bolt'], [32, 1750, "Gods' Fire"],
      [40, 130, 'Stamina'], [64, 360, 'Heal'], [60, 930, "Balyna's Antidote"], [94, 480, 'Recall'],
    ],
  },
  CastWhenHeld: {
    spells: [
      [37, 240, 'Slowfalling'], [39, 1230, 'Spell Resistance'], [41, 170, 'Water Walking'], [10, 1650, 'Free Action'],
      [42, 170, 'Water Breathing'], [11, 1560, 'Resist Cold'], [12, 1560, 'Resist Fire'], [26, 1560, 'Resist Poison'],
      [13, 1560, 'Resist Shock'], [6, 540, 'Invisibility'], [44, 210, 'Chameleon'], [45, 150, 'Shadow Form'],
      [46, 1720, 'Spell Reflection'], [24, 920, "Troll's Blood"], [47, 1720, 'Spell Absorption'], [4, 330, 'Levitate'],
      [49, 1590, 'Tongues'], [82, 1020, 'Orc Strength'], [83, 1200, 'Wisdom'], [84, 1200, 'Iron Will'],
      [85, 1200, 'Nimbleness'], [86, 1200, 'Feet of Notorgo'], [87, 1200, 'Fortitude'], [88, 1200, 'Charisma'],
      [89, 1200, 'Jack of Trades'],
    ],
  },
  CastWhenStrikes: {
    spells: [
      [50, 1620, 'Paralysis'], [53, 780, 'Hand of Sleep'], [52, 1380, 'Vampiric Touch'], [54, 930, 'Magicka Leech'],
      [56, 1830, 'Hand of Decay'], [33, 1020, 'Wildfire'], [20, 840, 'Ice Storm'], [25, 840, 'Fire Storm'],
      [16, 990, 'Ice Bolt'], [7, 480, "Wizard's Fire"], [55, 4230, 'Sphere of Negation'], [67, 1260, 'Energy Leech'],
    ],
  },
});

function allCosts(row) {
  if (!row) return [];
  if (row.costs) return row.costs;
  if (row.spells) return row.spells.map(([, c]) => c);
  return [row.cost];
}

// An unknown effect or param returns null, never 0, so a missing cost cannot read as a free enchantment.
export function enchantmentCost(type, param) {
  const row = ENCHANTMENT_COSTS[type];
  if (!row) return null;
  const p = param === undefined ? defaultParam(type) : param;
  if (row.costs) {
    const cost = row.costs[p];
    return (Number.isInteger(p) && p >= 0 && cost !== undefined) ? cost : null;
  }
  if (row.spells) {
    const hit = row.spells.find(([id]) => id === p);
    return hit ? hit[1] : null;
  }
  if (row.domain !== undefined) {
    return (Number.isInteger(p) && p >= 0 && p < row.domain) ? row.cost : null;
  }
  return p === PARAM_NONE ? row.cost : null;
}

export function enchantmentParamValues(type) {
  const row = ENCHANTMENT_COSTS[type];
  if (!row) return [];
  if (row.costs) return row.costs.map((_, i) => i);
  if (row.spells) return row.spells.map(([id]) => id);
  if (row.domain !== undefined) return Array.from({ length: row.domain }, (_, i) => i);
  return [PARAM_NONE];
}

export const defaultParam = (type) => enchantmentParamValues(type)[0];

const ENCHANTMENT_TEXT = localizedStrings({
  FeatherWeight: 'Feather Weight', IncreasedWeightAllowance: 'Increased Weight Allowance',
  commoners: 'Commoners', merchants: 'Merchants', scholars: 'Scholars', nobility: 'Nobility', underworld: 'Underworld', all: 'All',
  add25Percent: '25% additional', add50Percent: '50% additional',
  allTheTime: 'all the time', inSunlight: 'in sunlight', inHolyPlaces: 'in holy places', inDarknessLower: 'in darkness',
  undead: 'Undead', daedra: 'Daedra', humanoid: 'Humanoid', animalsUpper: 'Animals',
  atRange: 'at range', whenStrikes: 'when strikes',
});
const REP_KEYS = ['commoners', 'merchants', 'scholars', 'nobility', 'underworld', 'all'];
const VS_KEYS = ['undead', 'daedra', 'humanoid', 'animalsUpper'];
const LABEL_KEYS = Object.freeze({
  BadRepWith: REP_KEYS, GoodRepWith: REP_KEYS,
  IncreasedWeightAllowance: ['add25Percent', 'add50Percent'],
  ItemDeteriorates: ['allTheTime', 'inSunlight', 'inHolyPlaces'],
  LowDamageVs: VS_KEYS, PotentVs: VS_KEYS,
  RegensHealth: ['allTheTime', 'inSunlight', 'inDarknessLower'],
  UserTakesDamage: ['inSunlight', 'inHolyPlaces'],
  VampiricEffect: ['atRange', 'whenStrikes'],
});

export const enchantmentParams = (type) => {
  const row = ENCHANTMENT_COSTS[type];
  if (!row) return [];
  if (type === 'EnhancesSkill') return SKILL_NAMES;
  if (type === 'SoulBound') return SOUL_NAMES.map((name, id) => getLocalizedEnemyName(id, name));
  if (row.labels) return LABEL_KEYS[type]?.map((key) => ENCHANTMENT_TEXT[key]) ?? row.labels;
  if (row.spells) return row.spells.map(([id, , name]) => getLocalizedSpellName(id, name));
  return [];
};
export const enchantmentTypes = () => Object.keys(ENCHANTMENT_COSTS);

export function enchantmentParamName(type, param) {
  const at = enchantmentParamValues(type).indexOf(param);
  return at >= 0 ? (enchantmentParams(type)[at] ?? '') : '';
}

export function isSideEffect(type) {
  const costs = allCosts(ENCHANTMENT_COSTS[type]);
  return costs.length > 0 && costs.every((c) => c <= 0) && costs.some((c) => c < 0);
}
export function isPower(type) {
  const costs = allCosts(ENCHANTMENT_COSTS[type]);
  return costs.length > 0 && costs.every((c) => c >= 0) && costs.some((c) => c > 0);
}
export const powerTypes = () => enchantmentTypes().filter(isPower);
export const sideEffectTypes = () => enchantmentTypes().filter(isSideEffect);

// Forced rows name their parent by this key, which stands in for the classic settings hash and survives a save.
export const enchantmentKey = (type, param) => `${type}:${param}`;

export function enchantmentSettings(type, param, { parent = 0 } = {}) {
  const cost = enchantmentCost(type, param);
  if (cost === null) return null;
  const p = param === undefined ? defaultParam(type) : param;
  return { type, param: p, enchantCost: cost, parentEnchantment: parent, key: enchantmentKey(type, p) };
}

export const SOUL_FORCED_ENCHANTMENTS = Object.freeze({
  [MOBILE_TYPES.DaedraLord]: Object.freeze([
    { type: 'PotentVs', param: 1 },
    { type: 'UserTakesDamage', param: 1 },
    { type: 'ExtraWeight', param: PARAM_NONE },
  ]),
  [MOBILE_TYPES.DaedraSeducer]: Object.freeze([
    { type: 'GoodRepWith', param: 5 },
    { type: 'ItemDeteriorates', param: 1 },
    { type: 'UserTakesDamage', param: 1 },
    { type: 'HealthLeech', param: 2 },
    { type: 'BadReactionsFrom', param: 1 },
  ]),
  [MOBILE_TYPES.Daedroth]: Object.freeze([
    { type: 'LowDamageVs', param: 1 },
    { type: 'BadReactionsFrom', param: 2 },
    { type: 'ItemDeteriorates', param: 2 },
  ]),
  [MOBILE_TYPES.FireAtronach]: Object.freeze([
    { type: 'CastWhenUsed', param: 12 },
  ]),
  [MOBILE_TYPES.FireDaedra]: Object.freeze([
    { type: 'EnhancesSkill', param: 9 },
    { type: 'CastWhenUsed', param: 12 },
    { type: 'BadReactionsFrom', param: 1 },
  ]),
  [MOBILE_TYPES.FrostDaedra]: Object.freeze([
    { type: 'EnhancesSkill', param: 9 },
    { type: 'CastWhenUsed', param: 11 },
    { type: 'ItemDeteriorates', param: 2 },
  ]),
  [MOBILE_TYPES.Ghost]: Object.freeze([
    { type: 'FeatherWeight', param: PARAM_NONE },
    { type: 'ItemDeteriorates', param: 2 },
    { type: 'LowDamageVs', param: 0 },
  ]),
  [MOBILE_TYPES.Lich]: Object.freeze([
    { type: 'EnhancesSkill', param: 22 },
    { type: 'ItemDeteriorates', param: 1 },
    { type: 'LowDamageVs', param: 0 },
  ]),
  [MOBILE_TYPES.Wraith]: Object.freeze([
    { type: 'RegensHealth', param: 2 },
    { type: 'ItemDeteriorates', param: 2 },
    { type: 'LowDamageVs', param: 0 },
  ]),
});

export function forcedEnchantments(type, param) {
  if (type !== 'SoulBound') return null;
  const set = SOUL_FORCED_ENCHANTMENTS[param];
  if (!set) return null;
  const parent = enchantmentKey(type, param);
  const powers = [];
  const sideEffects = [];
  for (const child of set) {
    const settings = enchantmentSettings(child.type, child.param, { parent });
    if (!settings) continue;
    // A child splits on its own cost with a strict `> 0`, so a zero-cost child is a side effect, as in classic.
    (settings.enchantCost > 0 ? powers : sideEffects).push(settings);
  }
  return { powers, sideEffects };
}

export const NO_ROOM_IN_ITEM = 'There is no room in the item for these enchantments.';

export function pickEnchantment(type, param, { powers = [], sideEffects = [] } = {}) {
  const settings = enchantmentSettings(type, param);
  if (!settings) return null;
  const forced = forcedEnchantments(type, param);
  // Classic checks room only for an enchantment with forced children, so plain enchantments can pass ten here.
  if (forced) {
    const after = powers.length + sideEffects.length
      + forced.powers.length + forced.sideEffects.length + 1;
    if (after > 10) return { kind: 'noRoom', text: NO_ROOM_IN_ITEM };
  }
  return {
    kind: 'add',
    settings,
    powers: forced ? forced.powers : [],
    sideEffects: forced ? forced.sideEffects : [],
  };
}

// Match the row, not its key, since a forced soul row can share its key with a chosen row.
export function removeEnchantment(list, entry) {
  return list.filter((e) => e !== entry && e.parentEnchantment !== entry.key);
}

export const ITEM_MAKER_FLAGS = Object.freeze({
  None: 0,
  AllowMultiplePrimaryInstances: 1,
  AllowMultipleSecondaryInstances: 2,
  AlphaSortSecondaryList: 4,
  WeaponOnly: 8,
});

// UserTakesDamage and ItemDeteriorates drop the classic AllowMultipleSecondaryInstances flag, so each setting is
// picked once.
export const ITEM_MAKER_EFFECT_FLAGS = Object.freeze({
  AbsorbsSpells: 1,
  BadReactionsFrom: 1,
  BadRepWith: 1,
  CastWhenHeld: 1 | 4,
  CastWhenStrikes: 1 | 4 | 8,
  CastWhenUsed: 1 | 4,
  EnhancesSkill: 1 | 4,
  ExtraSpellPts: 1,
  ExtraWeight: 0,
  FeatherWeight: 0,
  GoodRepWith: 1,
  HealthLeech: 1,
  ImprovesTalents: 1,
  IncreasedWeightAllowance: 0,
  ItemDeteriorates: 1,
  LowDamageVs: 1 | 8,
  PotentVs: 1 | 8,
  RegensHealth: 1,
  RepairsObjects: 1,
  SoulBound: 4,
  StrengthensArmor: 0,
  UserTakesDamage: 1,
  VampiricEffect: 1,
  WeakensArmor: 0,
});
export const hasItemMakerFlag = (type, flag) => ((ITEM_MAKER_EFFECT_FLAGS[type] ?? 0) & flag) !== 0;

export const ENCHANTMENT_EXCLUSIONS = Object.freeze({
  FeatherWeight: { pairs: ['ExtraWeight'] },
  ExtraWeight: { pairs: ['FeatherWeight'] },
  StrengthensArmor: { pairs: ['WeakensArmor'] },
  WeakensArmor: { pairs: ['StrengthensArmor'] },
  PotentVs: { sameParam: ['LowDamageVs'] },
  LowDamageVs: { sameParam: ['PotentVs'] },
  GoodRepWith: { sameParam: ['BadRepWith'], allParam: 5 },
  BadRepWith: { sameParam: ['GoodRepWith'], allParam: 5 },
});

// No param means the primary picker stage, where only the pair and All clauses can fire.
export function isExclusiveTo(type, list = [], param) {
  const rule = ENCHANTMENT_EXCLUSIONS[type];
  if (!rule) return false;
  for (const e of list) {
    if (rule.allParam !== undefined && e.type === type) {
      if (e.param === rule.allParam) return true;
      if (param !== undefined && e.param !== rule.allParam && param === rule.allParam) return true;
    }
    if (rule.pairs?.includes(e.type)) return true;
    if (param !== undefined && rule.sameParam?.includes(e.type) && e.param === param) return true;
  }
  return false;
}

export function primaryPickerList(selectingPowers, { item = null, powers = [], sideEffects = [], souls = null } = {}) {
  const own = selectingPowers ? powers : sideEffects;
  const soulSet = souls === null ? null : new Set(souls);
  return (selectingPowers ? powerTypes() : sideEffectTypes()).filter((type) => {
    if (type === 'SoulBound' && soulSet && soulSet.size === 0) return false;
    if (!hasItemMakerFlag(type, ITEM_MAKER_FLAGS.AllowMultiplePrimaryInstances)
      && own.some((e) => e.type === type)) return false;
    if (hasItemMakerFlag(type, ITEM_MAKER_FLAGS.WeaponOnly) && item?.group !== 'Weapons') return false;
    if (isExclusiveTo(type, powers) || isExclusiveTo(type, sideEffects)) return false;
    // An effect with no setting left to offer is left out, where classic opens an empty chooser.
    const pick = primaryPick(type, { powers, sideEffects, selectingPowers, souls });
    return !(pick?.kind === 'choose' && pick.options.length === 0);
  });
}

export function primaryPick(type, { powers = [], sideEffects = [], selectingPowers = true, souls = null } = {}) {
  const labels = enchantmentParams(type);
  // Labels are positional over the full param list, so they pair up before the soul filter runs.
  let params = enchantmentParamValues(type).map((param, i) => ({ param, label: labels[i] ?? String(param) }));
  if (type === 'SoulBound' && souls !== null) {
    const soulSet = new Set(souls);
    params = params.filter((p) => soulSet.has(p.param));
  }
  if (params.length === 0) return null;
  // Soul Bound always opens the chooser, even with one soul, so its forced side effects attach.
  if (params.length === 1 && type !== 'SoulBound') {
    return { kind: 'add', settings: enchantmentSettings(type, params[0].param) };
  }
  const own = selectingPowers ? powers : sideEffects;
  let options = params.map(({ param, label }) => ({
    param, label, settings: enchantmentSettings(type, param),
  }));
  if (hasItemMakerFlag(type, ITEM_MAKER_FLAGS.AlphaSortSecondaryList)) {
    options = options.slice().sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  }
  options = options.filter((o) => {
    if (!hasItemMakerFlag(type, ITEM_MAKER_FLAGS.AllowMultipleSecondaryInstances)
      && own.some((e) => e.type === type && e.param === o.param)) return false;
    return !(isExclusiveTo(type, powers, o.param) || isExclusiveTo(type, sideEffects, o.param));
  });
  return { kind: 'choose', options };
}

export const enchantmentName = (type) =>
  (Object.hasOwn(ENCHANTMENT_TEXT, type) ? ENCHANTMENT_TEXT[type] : type.replace(/([a-z])([A-Z])/g, '$1 $2'));
