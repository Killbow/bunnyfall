// Reads the record data that follows the 71-byte SaveTree record root. Offsets match DFU ReadCharacterData, and the
// gaps between them are unknown bytes.

import { ClassFile } from './classFile.js';
import { readCStringFixed } from './saveTreeFile.js';

export const EQUIPPED_ITEM_COUNT = 27;

const SKILL_COUNT = 35;

/** @param {Uint8Array} recordData */
/**
 * @typedef {object} CharacterRecordData
 * @property {string} characterName
 * @property {number[]} currentStats
 * @property {number[]} baseStats
 * @property {number[]} armorValues
 * @property {number[]} skills
 * @property {number[]} skillUses
 * @property {number[]} equippedItems
 * @property {import('./classFile.js').ClassCareer} career
 * @property {number} gender
 * @property {number} transportationFlags
 * @property {number} minMetalToHit
 * @property {number} race
 * @property {number} skillsRaisedThisLevel1
 * @property {number} skillsRaisedThisLevel2
 * @property {number} startingLevelUpSkillSum
 * @property {number} baseHealth
 * @property {number} lastTimeUrgeToHuntInnocentSatisfied
 * @property {number} timeAfterWhichShieldEffectWillEnd
 * @property {number} unknownLycanthropy
 * @property {number} incubatingLycanthropy
 * @property {number} playerHouse
 * @property {number} playerShip
 * @property {number} currentHealth
 * @property {number} maxHealth
 * @property {number} faceIndex
 * @property {number} level
 * @property {number} reflexes
 * @property {number} physicalGold
 * @property {number} magicEffects1
 * @property {number} magicEffects2
 * @property {number} magicEffects3
 * @property {number} magicEffects4
 * @property {number} currentSpellPoints
 * @property {number} maxSpellPoints
 * @property {number} reputationCommoners
 * @property {number} reputationMerchants
 * @property {number} reputationScholars
 * @property {number} reputationNobility
 * @property {number} reputationUnderworld
 * @property {number} currentFatigue
 * @property {number} race2
 * @property {number} timeToBecomeVampireOrWerebeast
 * @property {number} hasStartedInitialVampireQuest
 * @property {number} lastTimeVampireNeedToKillSatiated
 * @property {number} lastTimePlayerAteOrDrankAtTavern
 * @property {number} lastTimePlayerBoughtTraining
 * @property {number} timeForThievesGuildLetter
 * @property {number} timeForDarkBrotherhoodLetter
 * @property {number} shieldEffectAmount
 * @property {number} vampireClan
 * @property {number} darkBrotherhoodRequirementTally
 * @property {number} thievesGuildRequirementTally
 * @property {number} biographyReactionMod
 * @property {number} resistanceToFire
 * @property {number} resistanceToFrost
 * @property {number} resistanceToDiseaseAndPoison
 * @property {number} resistanceToShock
 * @property {number} resistanceToMagicka
 */
/** @returns {CharacterRecordData} */
export function parseCharacterRecordData(recordData) {
  const v = new DataView(recordData.buffer, recordData.byteOffset, recordData.byteLength);
  const d = {};

  d.characterName = readCStringFixed(recordData, 0, 32);

  const readStats = (o) => {
    const stats = new Array(8);
    for (let i = 0; i < 8; i++) stats[i] = v.getInt16(o + i * 2, true);
    return stats;
  };
  d.currentStats = readStats(0x20);
  d.baseStats = readStats(0x30);

  // Classic saves use many gender values, and only the low bit matters: 0 is male and 1 is female.
  d.gender = (recordData[0x40] & 1) === 1 ? 1 : 0;
  d.transportationFlags = recordData[0x41];
  d.minMetalToHit = recordData[0x42];
  // The saved race is 0-based; the live race enum is this value plus 1.
  d.race = recordData[0x43];

  const armorValues = new Array(7);
  for (let i = 0; i < 7; i++) armorValues[i] = v.getInt8(0x44 + i);
  d.armorValues = armorValues;

  d.skillsRaisedThisLevel1 = v.getUint32(0x50, true);
  d.skillsRaisedThisLevel2 = v.getUint32(0x54, true);
  d.startingLevelUpSkillSum = v.getInt32(0x58, true);
  d.baseHealth = v.getInt16(0x5c, true);

  d.lastTimeUrgeToHuntInnocentSatisfied = v.getUint32(0x60, true);
  d.timeAfterWhichShieldEffectWillEnd = v.getUint32(0x64, true);
  d.unknownLycanthropy = v.getInt16(0x68, true);
  d.incubatingLycanthropy = v.getInt16(0x6c, true);

  d.playerHouse = v.getUint32(0x74, true);
  d.playerShip = v.getUint32(0x78, true);
  d.currentHealth = v.getInt16(0x7c, true);
  d.maxHealth = v.getInt16(0x7e, true);
  d.faceIndex = recordData[0x80];
  d.level = recordData[0x81];
  d.reflexes = recordData[0x83];

  d.physicalGold = v.getUint32(0x85, true);
  d.magicEffects1 = recordData[0x89];
  d.magicEffects2 = recordData[0x8a];
  d.magicEffects3 = recordData[0x8b];
  d.magicEffects4 = recordData[0x8c];
  d.currentSpellPoints = v.getInt16(0x8d, true);
  d.maxSpellPoints = v.getInt16(0x8f, true);

  d.reputationCommoners = v.getInt16(0x91, true);
  d.reputationMerchants = v.getInt16(0x93, true);
  d.reputationScholars = v.getInt16(0x95, true);
  d.reputationNobility = v.getInt16(0x97, true);
  d.reputationUnderworld = v.getInt16(0x99, true);

  d.currentFatigue = v.getUint16(0x9b, true);

  d.skills = new Array(SKILL_COUNT);
  d.skillUses = new Array(SKILL_COUNT);
  for (let i = 0; i < SKILL_COUNT; i++) {
    const o = 0x9d + i * 6;
    d.skills[i] = v.getInt16(o, true);
    d.skillUses[i] = v.getInt16(o + 2, true);
  }

  d.equippedItems = new Array(EQUIPPED_ITEM_COUNT);
  for (let i = 0; i < EQUIPPED_ITEM_COUNT; i++) {
    d.equippedItems[i] = v.getUint32(0x16f + i * 4, true);
  }

  d.race2 = recordData[0x1f2];
  d.timeToBecomeVampireOrWerebeast = v.getUint32(0x1f3, true);
  d.hasStartedInitialVampireQuest = recordData[0x1f8];
  d.lastTimeVampireNeedToKillSatiated = v.getUint32(0x1fd, true);
  d.lastTimePlayerAteOrDrankAtTavern = v.getUint32(0x205, true);
  d.lastTimePlayerBoughtTraining = v.getUint32(0x209, true);
  d.timeForThievesGuildLetter = v.getUint32(0x211, true);
  d.timeForDarkBrotherhoodLetter = v.getUint32(0x215, true);
  d.shieldEffectAmount = v.getUint32(0x219, true);
  d.vampireClan = recordData[0x21d];
  d.darkBrotherhoodRequirementTally = recordData[0x21f];
  d.thievesGuildRequirementTally = recordData[0x222];

  d.biographyReactionMod = v.getInt8(0x224);
  d.resistanceToFire = recordData[0x225];
  d.resistanceToFrost = recordData[0x226];
  d.resistanceToDiseaseAndPoison = recordData[0x227];
  d.resistanceToShock = recordData[0x228];
  d.resistanceToMagicka = recordData[0x229];

  const classFile = new ClassFile();
  classFile.load(recordData.subarray(0x230));
  d.career = classFile.career;

  return d;
}
