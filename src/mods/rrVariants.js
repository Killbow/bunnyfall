// Roleplay & Realism NPC sprite variants: shop and tavern keepers by building quality,
// and residents redrawn as the climate race's townsfolk walkers.

import { PERSON_TEXTURES, PERSON_FACE_RECORDS, PERSON_IDLE_RECORD, NUM_PERSON_FACE_VARIANTS, walkerRace, raceOfPeople } from '../characters/mobilePerson.js';
import { getWorldClimateSettings } from '../formats/mapsFile.js';
import { BUILDING_TYPES, isResidence } from '../world/buildingNames.js';
import { isShop } from '../trade/shopStock.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { registerBillboardXml } from '../world/billboardXml.js';
import { registerButtonArt } from '../ui/messageBox.js';
import { setFlatFaceOverride } from '../characters/staticNpc.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { rrModule, rrRefinedTrainingOn } from './rrRealism.js';

export const RR_ART_DIR = 'art/roleplay-realism';
export const rrArtUrl = (name, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`${RR_ART_DIR}/${encodeURIComponent(name)}.png`, root).href;

export const RR_NPC_XML_SCALE = Object.freeze({
  0: [1.205, 0.987], 1: [1.516, 0.950], 2: [1.205, 0.938], 3: [1.237, 1.333],
  4: [1, 0.98], 5: [1.2, 1.03], 6: [3, 0.8],
});
export const RR_NPC_ARCHIVE = 197;
export const RR_NPC_RECORDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const RR_BUTTON_RECORDS = Object.freeze([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);

export function rrRecord182_0(quality) {
  if (quality >= 6 && quality <= 9) return 0;
  if (quality >= 10 && quality <= 13) return 1;
  if (quality >= 14 && quality <= 17) return 2;
  if (quality >= 18 && quality <= 20) return 3;
  return -1;
}
export function rrShopTavernRecord(archive, record, buildingType, quality) {
  if (archive !== 182) return -1;
  if (!(buildingType === BUILDING_TYPES.Tavern || isShop(buildingType))) return -1;
  if (record === 0) return rrRecord182_0(quality);
  if (record === 1) return quality < 12 ? 4 : quality > 14 ? 5 : -1;
  if (record === 2) return quality > 12 ? 6 : -1;
  return -1;
}

const GENDER_182 = Object.freeze({ female: new Set([10, 12, 28, 41, 45]), male: new Set([15, 17, 19, 20, 35, 39, 46]) });
const GENDER_184 = Object.freeze({ female: new Set([1, 7, 9, 10, 19, 22, 23, 26, 28, 29, 30, 33]), male: new Set([0, 4, 16, 17, 20, 21, 24, 25]) });
export function rrResidentGender(archive, record) {
  const t = archive === 182 ? GENDER_182 : archive === 184 ? GENDER_184 : null;
  if (!t) return -1;
  return t.female.has(record) ? 1 : t.male.has(record) ? 0 : -1;
}
export const rrClimateRace = (worldClimate) => raceOfPeople(getWorldClimateSettings(worldClimate)?.people);
export function rrResidentVariant({ archive, record, factionID = 0, nameSeed = 0 }, race = 'Breton') {
  const gender = rrResidentGender(archive, record);
  if (gender === -1 || factionID !== 0) return null;
  const faceVariant = nameSeed % 29;
  if (faceVariant >= NUM_PERSON_FACE_VARIANTS) return null;
  const outfitVariant = nameSeed % 4;
  const sex = gender === 0 ? 'male' : 'female';
  const textures = PERSON_TEXTURES[race] ?? PERSON_TEXTURES.Breton;
  const faces = PERSON_FACE_RECORDS[race] ?? PERSON_FACE_RECORDS.Breton;
  return { textureArchive: textures[sex][outfitVariant], textureRecord: PERSON_IDLE_RECORD, faceIndex: faces[sex][outfitVariant] + faceVariant, gender };
}

export function rrVariantPerson(pn, { buildingType = -1, quality = 0, nameSeed = 0, worldClimate = null, region = null } = {}) {
  if (!pn) return null;
  if (rrModule('variantNpcs')) {
    const record = rrShopTavernRecord(pn.textureArchive, pn.textureRecord, buildingType, quality);
    if (record > -1) return { textureArchive: RR_NPC_ARCHIVE, textureRecord: record };
  }
  if (rrModule('variantResidents') && isResidence(buildingType)) {
    const v = rrResidentVariant({ archive: pn.textureArchive, record: pn.textureRecord, factionID: pn.factionID ?? 0, nameSeed }, walkerRace(getWorldClimateSettings(worldClimate)?.people, region));
    if (v) {
      setFlatFaceOverride(pn.textureArchive, pn.textureRecord, v.faceIndex);
      return { textureArchive: v.textureArchive, textureRecord: v.textureRecord };
    }
  }
  return null;
}

let _installed = false;
export function installRoleplayRealismArt({ fetchBytes = null } = {}) {
  if (_installed) return 0;
  _installed = true;
  const load = fetchBytes ?? (async (name) => { const r = await fetch(rrArtUrl(name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); });
  const gate = () => rrModule('variantNpcs');
  registerBillboardXml('roleplay-realism', { [RR_NPC_ARCHIVE]: Object.fromEntries(Object.entries(RR_NPC_XML_SCALE)) }, gate);
  for (const record of RR_BUTTON_RECORDS) registerButtonArt(record, () => load(`BUTTONS.RCI_${record}-0`), () => rrRefinedTrainingOn());
  return addVendorTextures(RR_NPC_RECORDS.map((record) => ({
    archive: RR_NPC_ARCHIVE, record, frame: 0, dye: null, map: 'Albedo', fileName: `${RR_NPC_ARCHIVE}_${record}-0`,
    lazy: true, load, gate,
  })));
}
export function _resetRoleplayRealismArt() { _installed = false; }
