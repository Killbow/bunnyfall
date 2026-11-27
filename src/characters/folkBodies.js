// @ts-check
import { GENDERS } from './nameHelper.js';
import { PERSON_TEXTURES, GUARD_TEXTURE } from './mobilePerson.js';
import { EQUIP_SLOTS } from './equip.js';
import { ARMOR_ENUM } from '../combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { dressPerson, npcHint, WARDROBE_BEAST_RACES } from './wardrobe.js';
import { townsfolkOutfitOf } from './ownClothingModels.js';

export const FOLK_DRESS = Object.freeze({
  male: Object.freeze([
    Object.freeze({ role: 'commoner', cut: 'pants' }),
    Object.freeze({ role: 'tradesman', cut: 'pants' }),
    Object.freeze({ role: 'traveller', cut: 'pants' }),
    Object.freeze({ role: 'scholar', cut: 'robe' }),
  ]),
  female: Object.freeze([
    Object.freeze({ role: 'commoner', cut: 'skirt' }),
    Object.freeze({ role: 'tradesman', cut: 'pants' }),
    Object.freeze({ role: 'scholar', cut: 'robe' }),
    Object.freeze({ role: 'commoner', cut: 'skirt' }),
  ]),
});

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const strHash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };

export function folkVariant(archive, race) {
  const t = PERSON_TEXTURES[race] ?? PERSON_TEXTURES.Breton;
  const i = t.male.indexOf(archive);
  if (i >= 0) return i;
  const j = t.female.indexOf(archive);
  return j >= 0 ? j : 0;
}

let _shells = 0;
/**
 * @param {any} person
 * @param {string} race
 */
function spawnOf(person, race) {
  const key = `${person.archive}|${person.personFaceRecordId ?? 0}|${person.nameNPC ?? ''}|${person.gender ?? 0}`;
  if (person._mwFolk && person._mwFolk.key === key) return person._mwFolk;
  const shell = person._mwShell ??= ++_shells;
  const n = (person._mwFolk?.n ?? 0) + 1;
  const seed = mix(strHash(key) ^ mix(shell));
  return (person._mwFolk = { key, n, id: `${shell}.${n}`, seed, look: folkLookOf(person, race, seed) });
}

export function folkLookOf(person, race, seed) {
  const female = person.gender === GENDERS.Female;
  const gender = female ? 'female' : 'male';
  const items = [];
  if (person.guard || person.archive === GUARD_TEXTURE) {
    for (const [slot, piece] of [['ChestArmor', ARMOR_ENUM.Cuirass], ['LegsArmor', ARMOR_ENUM.Greaves], ['Head', ARMOR_ENUM.Helm], ['Feet', ARMOR_ENUM.Boots],
      ['LeftArm', ARMOR_ENUM.Left_Pauldron], ['RightArm', ARMOR_ENUM.Right_Pauldron], ['Gloves', ARMOR_ENUM.Gauntlets]]) {
      items.push({ templateIndex: piece, group: 'Armor', equipSlot: EQUIP_SLOTS[slot], material: ARMOR_MATERIAL.Steel });
    }
    items.push({ templateIndex: 165, group: 'MensClothing', equipSlot: EQUIP_SLOTS.ChestClothes, dye: 1 });
    items.push({ templateIndex: 151, group: 'MensClothing', equipSlot: EQUIP_SLOTS.LegsClothes, dye: 1 });
    return { race, gender: 'male', faceIndex: mix(seed ^ 0xfa) % 10, items, npc: npcHint(seed, 0) };
  }
  const faceIndex = ((person.personFaceRecordId ?? 0) + mix(seed ^ 0xfa)) % 10;
  const own = townsfolkOutfitOf(person.archive);
  if (own && spriteSex(person.archive) === gender && !WARDROBE_BEAST_RACES.includes(race)) return { race, gender, faceIndex, items: [], npc: npcHint(seed, 0), outfit: own.id };
  const { role, cut } = FOLK_DRESS[gender][folkVariant(person.archive, race)];
  const d = dressPerson({ role, gender, seed, cut });
  return { race, gender, faceIndex, items: d.items, npc: d.npc };
}

export function spriteSex(archive) {
  for (const t of Object.values(PERSON_TEXTURES)) {
    if (t.male.includes(archive)) return 'male';
    if (t.female.includes(archive)) return 'female';
  }
  return null;
}

/**
 * @param {any} person
 * @param {string} race
 */
export const folkLook = (person, race) => spawnOf(person, race).look;

/**
 * @param {any} person
 * @param {number[]} feet
 * @param {string} race
 */
export function folkActor(person, feet, race) {
  const s = spawnOf(person, race);
  const a = person._mwActor ??= { id: '', look: null, feet: null, yaw: 0, moving: false, running: false, drawn: false, swings: 0, strike: 0, casts: 0, castRange: 0, hits: 0, dead: 0 };
  a.id = s.id; a.look = s.look; a.feet = feet;
  a.yaw = Number.isFinite(person.yaw) ? person.yaw : (person.facingYaw ?? 0);
  a.moving = person.state === 'move';
  return a;
}
