import { MOBILE_TYPES } from './mobileTypes.js';

export const SOLITARY_TYPES = new Set([
  MOBILE_TYPES.Imp,
  MOBILE_TYPES.Spriggan,
  MOBILE_TYPES.Nymph,
  MOBILE_TYPES.Giant,
  MOBILE_TYPES.Mummy,
  MOBILE_TYPES.FrostDaedra,
  MOBILE_TYPES.FireDaedra,
  MOBILE_TYPES.Daedroth,
  MOBILE_TYPES.DaedraSeducer,
  MOBILE_TYPES.VampireAncient,
  MOBILE_TYPES.DaedraLord,
  MOBILE_TYPES.Lich,
  MOBILE_TYPES.AncientLich,
  MOBILE_TYPES.Dragonling,
  MOBILE_TYPES.FireAtronach,
  MOBILE_TYPES.IronAtronach,
  MOBILE_TYPES.FleshAtronach,
  MOBILE_TYPES.IceAtronach,
  MOBILE_TYPES.Dragonling_Alternate,
  MOBILE_TYPES.Dreugh,
  MOBILE_TYPES.Lamia,
]);

export const FACTIONS = Object.freeze({
  BANDIT: [
    MOBILE_TYPES.Mage, MOBILE_TYPES.Spellsword, MOBILE_TYPES.Battlemage,
    MOBILE_TYPES.Sorcerer, MOBILE_TYPES.Healer, MOBILE_TYPES.Nightblade,
    MOBILE_TYPES.Bard, MOBILE_TYPES.Burglar, MOBILE_TYPES.Rogue,
    MOBILE_TYPES.Acrobat, MOBILE_TYPES.Thief, MOBILE_TYPES.Assassin,
    MOBILE_TYPES.Monk, MOBILE_TYPES.Archer, MOBILE_TYPES.Ranger,
    MOBILE_TYPES.Barbarian, MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight,
  ],
  ORC: [MOBILE_TYPES.Orc, MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.OrcShaman, MOBILE_TYPES.OrcWarlord],
  VERMIN: [MOBILE_TYPES.Spider, MOBILE_TYPES.GiantScorpion, MOBILE_TYPES.GiantBat],
  BEASTPACK: [MOBILE_TYPES.Rat, MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.SabertoothTiger],
  WEREBEAST: [MOBILE_TYPES.Werewolf, MOBILE_TYPES.Wereboar],
  UNDEAD: [MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.Ghost, MOBILE_TYPES.Wraith, MOBILE_TYPES.Vampire],
  FAE: [MOBILE_TYPES.Centaur, MOBILE_TYPES.Harpy, MOBILE_TYPES.Gargoyle],
  AQUATIC: [MOBILE_TYPES.Slaughterfish],
});

export const NIGHT_ONLY_FACTIONS = new Set(['UNDEAD', 'WEREBEAST']);

const FACTION_OF = new Map();
for (const [name, ids] of Object.entries(FACTIONS)) {
  for (const id of ids) FACTION_OF.set(id, name);
}

export function factionOf(id) {
  if (SOLITARY_TYPES.has(id)) return null;
  return FACTION_OF.get(id) ?? null;
}
