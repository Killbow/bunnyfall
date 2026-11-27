// @ts-check
// This module imports nothing, so spell tables, chargen, and the minion party can read it without import cycles.

// Types 55 to 63 sit past the classic effect types and the game's own 45 to 54.
export const NECRO_TYPES = Object.freeze({
  recall: 55, skeleton: 56, zombie: 57, ghost: 58, mummy: 59, vampire: 60, lich: 61, ancientVampire: 62, ancientLich: 63,
});
export const NECRO_EFFECT_KEYS = Object.freeze(Object.values(NECRO_TYPES).map((t) => `${t},255`));
export const isNecroType = (type) => Number.isInteger(type) && type >= NECRO_TYPES.recall && type <= NECRO_TYPES.ancientLich;

const R = (templateIndex, group) => Object.freeze({ templateIndex, group });
export const REAGENT = Object.freeze({
  redRose: R(19, 'PlantIngredients1'), yellowRose: R(20, 'PlantIngredients1'),
  blackRose: R(21, 'PlantIngredients2'), whiteRose: R(22, 'PlantIngredients2'),
  ectoplasm: R(39, 'CreatureIngredients1'), lichDust: R(45, 'CreatureIngredients1'),
  bandage: R(249, 'UselessItems2'), oil: R(252, 'UselessItems2'),
});
export const CORPSE_TEMPLATE = 6666;
export const CORPSE_GROUP = 'UselessItems2';
export const CORPSE_NAME = 'Humanoid Corpse';
export const CORPSE_WEIGHT_KG = 1;

// Health sums use integer division, as the mod's C# does.
const idiv = (a, b) => Math.floor(a / b);
const lesserHealth = (m, my, int, wil) => idiv(my, 9) + idiv(m, 3) + idiv(int, 7) + idiv(wil, 7);
const zombieHealth = (m, my, int, wil) => idiv(my, 7) + idiv(m, 3) + idiv(int, 6) + idiv(wil, 6);
const greaterHealth = (m, my, int, wil) => idiv(my, 3) + m + idiv(int, 10) + idiv(wil, 10);
// The mod's C# divides these as integers, which always gives 0 and an Iron mace; this uses the real division.
export const lesserFactor = (m, my, int, wil) => m / 400 + my / 400 + wil / 400 + int / 400;
export const greaterFactor = (m, my, int, wil) => my / 300 + wil / 300 + int / 300;

/** @type {Readonly<Record<number, Readonly<{ kind: string, name: string, mobile: number, anyOf: ReadonlyArray<{templateIndex: number, group: string}>, health: (m: number, my: number, int: number, wil: number) => number, mace: boolean }>>>} */
export const MINIONS = Object.freeze({
  [NECRO_TYPES.skeleton]: Object.freeze({ kind: 'skeleton', name: 'Skeleton', mobile: 15, anyOf: Object.freeze([]), health: lesserHealth, mace: true }),
  [NECRO_TYPES.zombie]: Object.freeze({ kind: 'zombie', name: 'Zombie', mobile: 17, anyOf: Object.freeze([]), health: zombieHealth, mace: true }),
  [NECRO_TYPES.ghost]: Object.freeze({ kind: 'ghost', name: 'Ghost', mobile: 18, anyOf: Object.freeze([REAGENT.ectoplasm]), health: lesserHealth, mace: false }),
  [NECRO_TYPES.mummy]: Object.freeze({ kind: 'mummy', name: 'Mummy', mobile: 19, anyOf: Object.freeze([REAGENT.oil, REAGENT.bandage]), health: lesserHealth, mace: false }),
  [NECRO_TYPES.vampire]: Object.freeze({ kind: 'vampire', name: 'Vampire', mobile: 28, anyOf: Object.freeze([REAGENT.redRose, REAGENT.yellowRose]), health: greaterHealth, mace: false }),
  [NECRO_TYPES.lich]: Object.freeze({ kind: 'lich', name: 'Lich', mobile: 32, anyOf: Object.freeze([REAGENT.lichDust]), health: greaterHealth, mace: false }),
  [NECRO_TYPES.ancientVampire]: Object.freeze({ kind: 'ancientVampire', name: 'Ancient Vampire', mobile: 30, anyOf: Object.freeze([REAGENT.blackRose, REAGENT.whiteRose]), health: greaterHealth, mace: false }),
  [NECRO_TYPES.ancientLich]: Object.freeze({ kind: 'ancientLich', name: 'Ancient Lich', mobile: 33, anyOf: Object.freeze([REAGENT.lichDust]), health: greaterHealth, mace: false }),
});
export const minionOfKind = (kind) => Object.values(MINIONS).find((m) => m.kind === kind) ?? null;
const floor1 = (v) => Math.max(1, Math.trunc(Number(v) || 0));
export function minionHealth(type, magnitude, mysticism, intelligence, willpower) {
  const row = MINIONS[type];
  return row ? Math.max(1, row.health(floor1(magnitude), floor1(mysticism), floor1(intelligence), floor1(willpower))) : 1;
}
// The metal ladder follows the mod's spawner, which skips Elven and Mithril.
export function maceMetal(factor) {
  if (factor >= 0.9) return 9;
  if (factor >= 0.8) return 8;
  if (factor >= 0.7) return 7;
  if (factor >= 0.6) return 6;
  if (factor >= 0.5) return 5;
  if (factor >= 0.4) return 2;
  if (factor >= 0.2) return 1;
  return 0;
}
export const METAL_NAMES = Object.freeze(['Iron', 'Steel', 'Silver', 'Elven', 'Mithril', 'Dwarven', 'Adamantium', 'Orcish', 'Ebony', 'Daedric']);
export function minionMace(type, magnitude, mysticism, intelligence, willpower) {
  const row = MINIONS[type];
  if (!row?.mace) return null;
  return maceMetal(lesserFactor(floor1(magnitude), floor1(mysticism), floor1(intelligence), floor1(willpower)));
}

export const CORPSE_MONSTERS = Object.freeze([7, 12, 21, 24]);
export const dropsCorpse = (mobile) => (Number.isInteger(mobile) && mobile >= 128 && mobile <= 145) || CORPSE_MONSTERS.includes(mobile);

export function graveRobChance(mysticism, intelligence, willpower) {
  const c = (v) => Math.max(1, Math.min(100, Math.trunc(Number(v) || 0)));
  return idiv(c(mysticism) + c(intelligence) + c(willpower), 3);
}
export const GRAVE_SUCCESS = Object.freeze([
  ['You find a skeleton!', null],
  ['You find a partially decomposed corpse!', null],
  ["This one's fresh!", null],
  ['Someone has left flowers on this grave! How thoughtful!', 'whiteRose'],
  ['Someone has left flowers on this grave! How thoughtful!', 'blackRose'],
  ['The skeleton is pristine, and the flesh has crumbled away into a useful dust.', 'lichDust'],
  ['Necrotic juices glow upon this corpse.', 'ectoplasm'],
  ['This corpse is well preserved.', 'oil'],
  ['The wrappings on this stiff may as well be brand new.', 'bandage'],
  ['The grave is recently visited! They left behind fresh roses!', 'yellowRose'],
  ['The grave is recently visited! They left behind fresh roses!', 'redRose'],
]);
export const GRAVE_FAILURE = Object.freeze([
  ['Fribble, just fribble...', null],
  ['The epitaph reads: Gal bursten it.', null],
  ['Someone has left flowers on this grave! How thoughtful!', 'yellowRose'],
  ['Someone has left flowers on this grave! How thoughtful!', 'redRose'],
  ['Nothing but dust... ', null],
  ["This one's too brittle...", null],
  ['Oil in a grave? Why?', 'oil'],
  ['Someone tried to bandage this corpse, but failed their skillcheck.', 'bandage'],
  ['Picked clean already...', null],
]);
export function robGrave(mysticism, intelligence, willpower, rolls = Math.random) {
  // The roll is 1 to 99, as the mod's Random.Next(1, 100) draws.
  const roll = 1 + Math.floor(rolls() * 99);
  const ok = roll <= graveRobChance(mysticism, intelligence, willpower);
  const table = ok ? GRAVE_SUCCESS : GRAVE_FAILURE;
  const [text, reagent] = table[Math.floor(rolls() * table.length)];
  return { corpse: ok, text, reagent };
}

export const NECRO_SPELLS = Object.freeze([
  ['Animate Dead', NECRO_TYPES.skeleton],
  ['Reanimate Corpse', NECRO_TYPES.zombie],
  ['Roil Spirit', NECRO_TYPES.ghost],
  ['Raise Mummy', NECRO_TYPES.mummy],
  ['Vampiric Pact', NECRO_TYPES.vampire],
  ['Greater Vampiric Pact', NECRO_TYPES.ancientVampire],
  ['Call Ascended Minion', NECRO_TYPES.lich],
  ['Call Greater Ascended Minion', NECRO_TYPES.ancientLich],
  ['Novice Recall', NECRO_TYPES.recall],
]);
// Spellbook indices for these spells use their own band, apart from the other ready-made spells at -47001.
export const NECRO_SPELL_INDEX_BASE = -71401;
export const NECRO_SPELL_SETTINGS = Object.freeze({ chanceBase: 25, chancePerLevel: 5, chanceMod: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 });
export const NECRO_SPELL_ICON = 12;

export const NECROMANCER_NAME = 'Necromancer';
export const NECROMANCER = Object.freeze({
  hp: 8, advancementMultiplier: 1.0,
  stats: Object.freeze({ strength: 40, intelligence: 65, willpower: 70, agility: 40, endurance: 50, personality: 40, speed: 40, luck: 50 }),
  skills: Object.freeze([27, 25, 24, 26, 22, 23, 1, 14, 20, 28, 8, 32]),
  specials: Object.freeze([
    { primary: 'bonusToHit', secondary: 'undead' },
    { primary: 'darknessPoweredMagery', secondary: 'lowerMagicAbilityDaylight' },
    { primary: 'forbiddenMaterial', secondary: 'silver' },
    { primary: 'forbiddenShieldTypes', secondary: 'buckler' }, { primary: 'forbiddenShieldTypes', secondary: 'roundShield' },
    { primary: 'forbiddenShieldTypes', secondary: 'kiteShield' }, { primary: 'forbiddenShieldTypes', secondary: 'towerShield' },
    { primary: 'forbiddenArmorType', secondary: 'chain' },
    { primary: 'forbiddenWeaponry', secondary: 'handToHand' },
    { primary: 'expertiseIn', secondary: 'shortBlade' },
    { primary: 'increasedMagery', secondary: 'intInSpellPoints3' },
    { primary: 'spellAbsorption', secondary: 'inDarkness' },
    { primary: 'regenerateHealth', secondary: 'inDarkness' },
    { primary: 'damage', secondary: 'fromHolyPlaces' },
  ]),
  description: Object.freeze([
    'Necromancers are mystics that specialize in raising the dead to do their',
    'bidding. Fueled by darkness, a necromancer is most powerful at night.',
    'Unfortunately, the sun makes them uncomfortable and they cannot tolerate',
    'holy places.',
    '',
    'The skills most important to a Necromancer are: Thaumaturgy,',
    'Destruction, and Restoration.',
    '',
    'Do you wish to be a Necromancer?',
  ]),
});
