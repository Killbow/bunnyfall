// SOUND values are DAGGER.SND record indices, copied from Daggerfall Unity's SoundClips enum.
export const SOUND = {
  None: -1,

  ArenaFireDaemon: 11,
  ArenaFanfareLevelUp: 32,
  MakeItem: 364,
  MakePotion: 365,
  ArrowShoot: 3,
  BodyFall: 15,
  PlayerDoorBash: 7,
  ActivateLockUnlock: 316,
  DrawWeapon: 78,
  EquipShortBlade: 377,
  EquipLongBlade: 378,
  EquipTwoHandedBlade: 379,
  EquipStaff: 380,
  EquipMaceOrHammer: 413,
  EquipFlail: 414,
  EquipAxe: 415,
  EquipBow: 416,
  EquipLeather: 417,
  DungeonDoorClose: 24,
  DungeonDoorOpen: 25,
  NormalDoorClose: 93,
  NormalDoorOpen: 94,
  HorseClop: 97,
  AmbientWindMoan: 65,
  AmbientWindMoanDeep: 66,
  AmbientWindBlow1: 70,
  AmbientWindBlow1a: 71,
  AmbientWindBlow1b: 72,
  AnimalHorse: 99,
  AnimalDog: 100,
  AnimalCat: 101,
  AnimalPig: 102,
  AnimalCow: 103,
  HorseAndCart: 104,
  HorseClop2: 298,
  SwingLowPitch: 105,
  SwingHighPitch: 106,
  EnemyWerewolfMove: 142,
  EnemyWerewolfBark: 143,
  EnemyWerewolfAttack: 144,
  EnemyWereboarMove: 157,
  EnemyWereboarBark: 158,
  EnemyWereboarAttack: 159,
  EnemyFemaleVampireBark: 199,
  EnemyFemaleVampireAttack: 200,
  EnemyVampireBark: 205,
  EnemyVampireAttack: 206,
  FallDamage: 91,
  FallHard: 92,
  Hit1: 108,
  Hit2: 109,
  SplashLarge: 342,
  SwingMediumPitch: 347,
  Burning: 420,
  Parry6: 433,
  WoodElfMalePain1: 405,
  BretonMalePain3: 392,
  RedguardMalePain3: 395,
  NordMalePain3: 398,
  DarkElfMalePain3: 401,
  HighElfMalePain3: 404,
  WoodElfMalePain3: 407,
  KhajiitMalePain3: 410,
  // The classic data puts the Argonian male Pain3 record at 42, outside the 390 to 412 male block.
  ArgonianMalePain3: 42,
  BretonFemalePain3: 45,
  RedguardFemalePain3: 48,
  NordFemalePain3: 51,
  DarkElfFemalePain3: 54,
  HighElfFemalePain3: 57,
  WoodElfFemalePain3: 60,
  KhajiitFemalePain3: 424,
  ArgonianFemalePain3: 427,
  Ignite: 16,
  LevelUp: 96,
  DiceRoll: 300,
  ButtonClick: 360,
  GoldPieces: 361,
  PageTurn: 362,
  ParchmentScratching: 363,
  SelectClassDrums: 374,
  OpenBook: 384,
  SpookyMid: 1,
  ArrowHit: 4,
  CastSpell1: 81,
  CastSpell2: 82,
  CastSpell3: 83,
  CastSpell4: 84,
  CastSpell5: 85,
  SpellImpactMagic: 86,
  SpellImpactPoison: 87,
  SpellImpactFire: 89,
  Hit3: 110,
  Hit4: 111,
  Hit5: 112,
  PainSound: 299,
  Groan: 458,
};

export const TORCH_ARCHIVE = 210;
export const TORCH_RECORDS = new Set([0, 1, 6, 16, 17, 18, 19, 20]);
export const TORCH_MAX_DISTANCE = 5;
export const TORCH_VOLUME = 0.7;

export const ANIMALS_ARCHIVE = 201;
export const ANIMAL_SOUND_BY_RECORD = Object.freeze({
  0: SOUND.AnimalHorse, 1: SOUND.AnimalHorse,
  3: SOUND.AnimalCow, 4: SOUND.AnimalCow,
  5: SOUND.AnimalPig, 6: SOUND.AnimalPig,
  7: SOUND.AnimalCat, 8: SOUND.AnimalCat,
  9: SOUND.AnimalDog, 10: SOUND.AnimalDog,
});
export const ANIMAL_MAX_DISTANCE = 768 * 0.025;
export const AMBIENT_RANDOM_PLAY_MAX = 100;

// Swing sounds key on template index, not name, because magic items are renamed. This module imports nothing
// because characters/weapons.js imports SOUND from it.
const SWING_LOW = new Set([126, 127, 121, 122, 123, 125]);
const SWING_MEDIUM = new Set([118, 120, 119, 117, 128, 115, 124]);
const SWING_HIGH = new Set([113, 114, 116]);
const SWING_BOWS = new Set([129, 130]);
const _customSwing = new Map();
export function registerSwingSound(templateIndex, clip) { if (clip == null) _customSwing.delete(templateIndex); else _customSwing.set(templateIndex, clip); }
export function swingSoundFor(weapon) {
  if (!weapon) return SOUND.SwingHighPitch;
  if (weapon.werecreatureClaws) return SOUND.SwingHighPitch;
  const t = weapon.templateIndex;
  if (_customSwing.has(t)) return _customSwing.get(t);
  if (SWING_LOW.has(t)) return SOUND.SwingLowPitch;
  if (SWING_MEDIUM.has(t)) return SOUND.SwingMediumPitch;
  if (SWING_HIGH.has(t)) return SOUND.SwingHighPitch;
  if (SWING_BOWS.has(t)) return SOUND.ArrowShoot;
  return SOUND.None;
}

export const ENEMY_HIT_VOLUME = 1.1;
export const PLAYER_HIT_VOLUME = 1;

export function hitSoundFor(weapon, rolls = Math.random) {
  return SOUND.Hit1 + (weapon
    ? Math.floor(rolls() * 5)
    : 2 + Math.floor(rolls() * 2));
}
