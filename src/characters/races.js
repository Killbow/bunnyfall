// The race table: DFU RaceTemplate data (MIT, Daggerfall Workshop) for the eight classic races, plus three extra races.

import { BODY_MORPHOLOGY } from '../items/armorMaterials.js';

export const RACES = Object.freeze({
  Breton: 1, Redguard: 2, Nord: 3, DarkElf: 4,
  HighElf: 5, WoodElf: 6, Khajiit: 7, Argonian: 8,
});

const MORPHOLOGY_OF = Object.freeze({
  Breton: 'Human', Redguard: 'Human', Nord: 'Human',
  DarkElf: 'Elf', HighElf: 'Elf', WoodElf: 'Elf',
  Khajiit: 'Khajiit', Argonian: 'Argonian',
});

export const FACES_PER_RACE = 10;

const DESCRIPTION_ID = Object.freeze({
  Breton: 2003, Redguard: 2002, Nord: 2000, DarkElf: 2007,
  HighElf: 2006, WoodElf: 2005, Khajiit: 2001, Argonian: 2004,
});
const CLIP_ID = Object.freeze({
  Breton: 209, Redguard: 210, Nord: 211, DarkElf: 212,
  HighElf: 213, WoodElf: 214, Khajiit: 215, Argonian: 216,
});

const RACE_EFFECT_FLAGS = Object.freeze({
  Breton: { resistanceFlags: 2 },
  Nord: { resistanceFlags: 16 },
  HighElf: { immunityFlags: 1 },
});

const two = (n) => String(n).padStart(2, '0');
const build = (key, artIndex) => Object.freeze({
  key,
  name: key.replace(/([a-z])([A-Z])/g, '$1 $2'),
  id: RACES[key],
  artIndex,
  descriptionId: DESCRIPTION_ID[key],
  clipId: CLIP_ID[key],
  description: null,
  artRace: null,
  morphology: MORPHOLOGY_OF[key],
  morphologyIndex: BODY_MORPHOLOGY[MORPHOLOGY_OF[key]],
  background: `SCBG${two(artIndex)}I0.IMG`,
  bodyMale: Object.freeze([`BODY${two(artIndex)}I0.IMG`, `BODY${two(artIndex)}I1.IMG`]),
  bodyFemale: Object.freeze([`BODY1${artIndex}I0.IMG`, `BODY1${artIndex}I1.IMG`]),
  headsMale: `FACE${two(artIndex)}I0.CIF`,
  headsFemale: `FACE1${artIndex}I0.CIF`,
  resistanceFlags: 0,
  immunityFlags: 0,
  lowToleranceFlags: 0,
  criticalWeaknessFlags: 0,
  specialAbilities: 0,
  ...RACE_EFFECT_FLAGS[key],
});

export const RACE_TEMPLATES = Object.freeze(
  Object.keys(RACES).map((key, i) => build(key, i)));

// Bunnyfall IDs live outside the classic race and transformation range.
const extraRace = (key, id, artRace, description) => Object.freeze({
  ...RACE_TEMPLATES.find(race => race.key === artRace), key, name: key, id, artRace,
  description, descriptionId: null, clipId: null, resistanceFlags: 0, immunityFlags: 0,
});

export const EXTRA_RACE_TEMPLATES = Object.freeze([
  extraRace('Imperial', 100, 'Breton', 'Imperials favor the broadsword and mace.'),
  extraRace('Lilmothit', 101, 'Khajiit', 'Lilmothit are foxfolk who favor the wakizashi and short bow.'),
  extraRace('Lungaris', 102, 'Khajiit', 'Lungaris are harefolk who favor the shortsword and crossbow.'),
]);
export const PLAYABLE_RACE_TEMPLATES = Object.freeze([...RACE_TEMPLATES, ...EXTRA_RACE_TEMPLATES]);
export const RACE_KEYS = Object.freeze(PLAYABLE_RACE_TEMPLATES.map((r) => r.key));
export const raceByKey = (key) => PLAYABLE_RACE_TEMPLATES.find((r) => r.key === key) ?? null;
export const raceById = (id) => PLAYABLE_RACE_TEMPLATES.find((r) => r.id === id) ?? null;

export const LOOK_RACES = Object.freeze(['Nord']);
export const artRaceOf = (/** @type {any} */ e) => (e?.lookRace && LOOK_RACES.includes(e.lookRace)
  ? e.lookRace : raceByKey(e?.race)?.artRace ?? e?.race ?? 'Breton');
export const NORD_LOOK_FACE = 8;

export function raceArt(raceKey, gender = 'male') {
  const r = raceByKey(raceKey) ?? RACE_TEMPLATES[0];
  const male = gender !== 'female';
  return {
    race: r,
    background: r.background,
    body: male ? r.bodyMale : r.bodyFemale,
    heads: male ? r.headsMale : r.headsFemale,
  };
}
