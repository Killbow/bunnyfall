// @ts-check
// BUNNYFALL (2026-11-06, the owner: "i want to implement these three mods in the game with proper crediting" - the full
// mod, the minions seen by everyone nearby): CHEB'S NECROMANCY (Chebgonaz, Nexus daggerfallunity mod 714, the Unlicense;
// vendor/chebs-necromancy/ holds its C#) - THE LAW. A LEAF: it imports nothing, so the spell tables, the chargen and the
// minions' party read it without one another's graphs.
//
// What the mod is, here:
//   - NINE EFFECTS under Mysticism (ChebEffect.cs: Skill = Mysticism, the config's default), past every classic type and
//     the port's own (45..54): Recall Minions, and a Summon for each of eight undead. Instantaneous; Chance on all, and
//     Magnitude on the summons (Summon*Effect.cs SetProperties). Their spell-maker prices are the mod's config.
//   - A SUMMON needs its reagents in the caster's pack and spends them only when the minion rises (Summon*Effect.cs
//     ChanceSuccess / ConsumeReagents): a Humanoid Corpse for every one of them, and the second the table names.
//   - A MINION's health is the mod's sum of the caster's Mysticism, Intelligence, Willpower and the spell's magnitude
//     (each *Spawner.cs ScaleMinion), and a skeleton's or a zombie's mace its metal by the mod's factor.
//   - HUMANOIDS DROP CORPSES (ChebsNecromancy.cs OnEnemyDeath): every class foe, and the orcs.
//   - GRAVES CAN BE ROBBED (GravediggingActivation): a roll of (Mysticism + Intelligence + Willpower) / 3, a corpse and
//     perhaps a reagent on a success, a word and perhaps a trifle on a failure.
//   - THE NECROMANCER CLASS (GenerateNecromancerCareer, the config's defaults), who starts with Animate Dead, Novice
//     Recall and a corpse (CustomWizard.cs :560-581).
//   - THE READY-MADE SPELLS the mod puts on the guild's counter (AnimateDead.cs and its eight kin).
//
// Bunnyfall's own, said where it differs:
//   - The minions are COMPANIONS (scenes/crewAshore.js: every door, fast travel, the heel, the catch-up - the mod's
//     UndeadMinion follow brain and its record-and-restore over transitions), so they take the player's companion
//     slots (systems/companionSlots.js) and are drawn for everyone in the room as every companion is.
//   - A minion's health is the mod's number or the creature's own, whichever is more: Bunnyfall's foes are scaled far
//     past Daggerfall's, and the mod's 17-170 would fall to the first blow.
//   - The mod's `factor` is an integer division in its C# (magnitude / 400 + ...), always 0: every mace Iron, every
//     level 0. Here it is the division it means (MACE_METAL), and the minion keeps the level its place stands it at.

/** The effects' types (classic keys `${type},255`). */
export const NECRO_TYPES = Object.freeze({
  recall: 55, skeleton: 56, zombie: 57, ghost: 58, mummy: 59, vampire: 60, lich: 61, ancientVampire: 62, ancientLich: 63,
});
export const NECRO_EFFECT_KEYS = Object.freeze(Object.values(NECRO_TYPES).map((t) => `${t},255`));
/** Is `type` one of the mod's. */
export const isNecroType = (type) => Number.isInteger(type) && type >= NECRO_TYPES.recall && type <= NECRO_TYPES.ancientLich;

// ── the reagents (the classic templates and their groups) ─────────────────────────────────────────────────────────
const R = (templateIndex, group) => Object.freeze({ templateIndex, group });
export const REAGENT = Object.freeze({
  redRose: R(19, 'PlantIngredients1'), yellowRose: R(20, 'PlantIngredients1'),
  blackRose: R(21, 'PlantIngredients2'), whiteRose: R(22, 'PlantIngredients2'),
  ectoplasm: R(39, 'CreatureIngredients1'), lichDust: R(45, 'CreatureIngredients1'),
  bandage: R(249, 'UselessItems2'), oil: R(252, 'UselessItems2'),
});
/** The mod's Humanoid Corpse (CustomCorpseItem: template 6666, "Humanoid Corpse", 1 kg, Daggerfall's dead body's
 *  picture - TEXTURE.380 record 1, MiscItems.Dead_Body's; stackable). Its group is the custom items' own here. */
export const CORPSE_TEMPLATE = 6666;
export const CORPSE_GROUP = 'UselessItems2';
export const CORPSE_NAME = 'Humanoid Corpse';
export const CORPSE_WEIGHT_KG = 1;

// ── the eight minions ─────────────────────────────────────────────────────────────────────────────────────────────
/** Integer division, as the mod's C# divides its ints. */
const idiv = (a, b) => Math.floor(a / b);
/** The mod's health sums (each *Spawner.cs ScaleMinion): the lesser undead's and the greater's. */
const lesserHealth = (m, my, int, wil) => idiv(my, 9) + idiv(m, 3) + idiv(int, 7) + idiv(wil, 7);   // +11 +33 +14 +14 at 100
const zombieHealth = (m, my, int, wil) => idiv(my, 7) + idiv(m, 3) + idiv(int, 6) + idiv(wil, 6);   // +14 +33 +16 +16 at 100
const greaterHealth = (m, my, int, wil) => idiv(my, 3) + m + idiv(int, 10) + idiv(wil, 10);         // +30 +100 +10 +10 at 100
/** The factor a lesser minion's mace is chosen by (its four inputs over 400 each), and a greater's (three over 300). */
export const lesserFactor = (m, my, int, wil) => m / 400 + my / 400 + wil / 400 + int / 400;
export const greaterFactor = (m, my, int, wil) => my / 300 + wil / 300 + int / 300;

/**
 * By effect type: the minion's `kind`, its name, Daggerfall's mobile type, the reagents beside the corpse (any ONE of
 * them, `anyOf`), its health and whether it rises with a mace.
 * @type {Readonly<Record<number, Readonly<{ kind: string, name: string, mobile: number, anyOf: ReadonlyArray<{templateIndex: number, group: string}>, health: (m: number, my: number, int: number, wil: number) => number, mace: boolean }>>>}
 */
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
/** A minion's row by its kind. */
export const minionOfKind = (kind) => Object.values(MINIONS).find((m) => m.kind === kind) ?? null;
/** The mod's four inputs, each at least 1 (ScaleMinion's guards). */
const floor1 = (v) => Math.max(1, Math.trunc(Number(v) || 0));
/** The mod's health for a minion of `type` at `magnitude`, the caster's Mysticism, Intelligence and Willpower. */
export function minionHealth(type, magnitude, mysticism, intelligence, willpower) {
  const row = MINIONS[type];
  return row ? Math.max(1, row.health(floor1(magnitude), floor1(mysticism), floor1(intelligence), floor1(willpower))) : 1;
}
/** The mace's metal (WeaponMaterialTypes, 0 Iron .. 9 Daedric) by the factor (SkeletonSpawner.cs's ladder). */
export function maceMetal(factor) {
  if (factor >= 0.9) return 9;   // Daedric
  if (factor >= 0.8) return 8;   // Ebony
  if (factor >= 0.7) return 7;   // Orcish
  if (factor >= 0.6) return 6;   // Adamantium
  if (factor >= 0.5) return 5;   // Dwarven
  if (factor >= 0.4) return 2;   // Silver
  if (factor >= 0.2) return 1;   // Steel
  return 0;                      // Iron
}
export const METAL_NAMES = Object.freeze(['Iron', 'Steel', 'Silver', 'Elven', 'Mithril', 'Dwarven', 'Adamantium', 'Orcish', 'Ebony', 'Daedric']);
/** The mace a lesser minion of `type` rises with, at these inputs: its metal, or null for a kind that carries none. */
export function minionMace(type, magnitude, mysticism, intelligence, willpower) {
  const row = MINIONS[type];
  if (!row?.mace) return null;
  return maceMetal(lesserFactor(floor1(magnitude), floor1(mysticism), floor1(intelligence), floor1(willpower)));
}

// ── corpses from the fallen (OnEnemyDeath) ────────────────────────────────────────────────────────────────────────
/** The orcs, the humanoid monsters that drop one too (MonsterCareers.Orc, OrcSergeant, OrcShaman, OrcWarlord). */
export const CORPSE_MONSTERS = Object.freeze([7, 12, 21, 24]);
/** Does a foe of mobile type `mobile` drop a corpse: every class foe (128..145), and the orcs. */
export const dropsCorpse = (mobile) => (Number.isInteger(mobile) && mobile >= 128 && mobile <= 145) || CORPSE_MONSTERS.includes(mobile);

// ── grave robbing (GravediggingActivation) ────────────────────────────────────────────────────────────────────────
/** The chance (1..100) a grave gives up a corpse: (Mysticism + Intelligence + Willpower) / 3, each 1..100. */
export function graveRobChance(mysticism, intelligence, willpower) {
  const c = (v) => Math.max(1, Math.min(100, Math.trunc(Number(v) || 0)));
  return idiv(c(mysticism) + c(intelligence) + c(willpower), 3);
}
/** The words and the extra find: the mod's two tables, each `[text, reagent key or null]`. */
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
/** One grave's robbing: `{ corpse, text, reagent }` - the roll d100 (1..99, Random.Next(1, 100)) under the chance. */
export function robGrave(mysticism, intelligence, willpower, rolls = Math.random) {
  const roll = 1 + Math.floor(rolls() * 99);
  const ok = roll <= graveRobChance(mysticism, intelligence, willpower);
  const table = ok ? GRAVE_SUCCESS : GRAVE_FAILURE;
  const [text, reagent] = table[Math.floor(rolls() * table.length)];
  return { corpse: ok, text, reagent };
}

// ── the ready-made spells (AnimateDead.cs and kin: one effect each, Chance 25 + 1 per 5 levels, Magnitude 1+1/level) ──
/** `[name, effect type]`, the mod's order. The CustomSpellBundleOffer puts each on the guild's counter. */
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
/** Their spellbook indices, a band of their own below the ready-made ceiling (the bunny spells' are -47001..). */
export const NECRO_SPELL_INDEX_BASE = -71401;
/** The mod's settings for every ready-made one (EffectSettings: ChanceBase 25, ChancePerLevel 5, ChancePlus 1,
 *  MagnitudeBaseMin/Max 1, MagnitudePerLevel 1, MagnitudePlusMin/Max 1). The spell's icon, IconIndex 12. */
export const NECRO_SPELL_SETTINGS = Object.freeze({ chanceBase: 25, chancePerLevel: 5, chanceMod: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 });
export const NECRO_SPELL_ICON = 12;

// ── the Necromancer (GenerateNecromancerCareer: the mod's config defaults) ─────────────────────────────────────────
export const NECROMANCER_NAME = 'Necromancer';
/** Skills by Daggerfall's numbers (DFCareer.Skills): Mysticism 27, Alteration 25, Illusion 24 | Thaumaturgy 26,
 *  Destruction 22, Restoration 23 | Etiquette 1, Mercantile 14, Dodging 20, Short Blade 28, Nymph 8, Blunt Weapon 32. */
export const NECROMANCER = Object.freeze({
  hp: 8, advancementMultiplier: 1.0,
  stats: Object.freeze({ strength: 40, intelligence: 65, willpower: 70, agility: 40, endurance: 50, personality: 40, speed: 40, luck: 50 }),
  skills: Object.freeze([27, 25, 24, 26, 22, 23, 1, 14, 20, 28, 8, 32]),
  /** Its specials, as the custom class builder's picks (systems/specialAdvantages.js parseCareerData). */
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
  /** The class's page (GetCustomClasses). */
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
