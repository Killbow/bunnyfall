// @ts-check

import { WEAPON_MATERIALS, WEAPONS } from '../characters/weapons.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { itemBaseValue } from './itemTemplates.js';
import { affixesWorth, validAffix, registerGildedRecords } from './lootRarity.js';
import { SKILLS } from '../characters/skills.js';

export const GILDED = 'gilded';
export const GILDED_WORTH = 12500;
export const GILDED_CHANCE = 1 / 100;
export const GATE_GILDED_CHANCE = 1 / 250;
export const SERPENT_GILDED_CHANCE = 1 / 250;

export const HOUR_TOLLS = Object.freeze({
  name: 'The Hour Tolls', kind: 'toll', every: 3, pct: 100, refund: true,
  brief: 'Every 3rd hit x2; kills refund',
  text: 'Every third shot that lands tolls the Hour and deals double damage. A kill returns the shot',
});

export const DRAGONFIRE = Object.freeze({
  name: 'Dragonfire', kind: 'dragonfire', group: 'daedra', share: 33, metres: 3,
  brief: 'Daedra burn +33%, and all in 3m',
  text: 'Each hit on a Daedra burns it with Dragonfire for a third of the damage, and burns every other Daedra within 3 m for the same. No Daedra resists it',
});
export const UNDERTOW = Object.freeze({
  name: 'Undertow', kind: 'undertow', pct: 10, max: 5, seconds: 6, heal: 10,
  brief: '+10%/hit on a foe; kills heal',
  text: 'Each hit drags the foe deeper: +10% damage to your next hits on it for 6 s, up to +50%. A kill heals you for 10% of your health',
});

const line = (id, value, param) => Object.freeze(param === undefined ? { id, value } : { id, param, value });

export const HOURLOCK = Object.freeze({
  id: 'the-hourlock',
  name: 'The Hourlock',
  group: 'Weapons',
  templateIndex: WEAPONS.Long_Bow,
  material: WEAPON_MATERIALS.Dwarven,
  affixes: Object.freeze([
    line('damage', 40),
    line('stat', 15, 'agility'),
    line('skill', 30, SKILLS.Archery),
    line('elemental', 10, 'shock'),
  ]),
  power: HOUR_TOLLS,
  lore: 'Struck in the Hour that never ended, from the brass of a god that walked. Its gilding has never dulled.',
});

export const DRAGONFIRE_OATH = Object.freeze({
  id: 'the-dragonfire-oath',
  name: 'The Dragonfire Oath',
  group: 'Weapons',
  templateIndex: WEAPONS.Dai_Katana,
  material: WEAPON_MATERIALS.Daedric,
  affixes: Object.freeze([
    line('damage', 40),
    line('stat', 15, 'strength'),
    line('skill', 30, SKILLS.LongBlade),
    line('stat', 15, 'endurance'),
  ]),
  power: DRAGONFIRE,
  lore: 'A Dragonguard carried it through the first gate and never carried it back. The Deadlands blackened its steel; the Dragonfire in its gilding never went out.',
  hint: 'Said to fall from the Warden of the Burning Gate, once in a long while',
});
export const SUNKEN_SOVEREIGN = Object.freeze({
  id: 'the-sunken-sovereign',
  name: 'The Sunken Sovereign',
  group: 'Weapons',
  templateIndex: WEAPONS.Saber,
  material: WEAPON_MATERIALS.Ebony,
  affixes: Object.freeze([
    line('damage', 40),
    line('stat', 15, 'agility'),
    line('skill', 30, SKILLS.LongBlade),
    line('leech', 10),
  ]),
  power: UNDERTOW,
  lore: 'A Sentinel admiral\'s saber, swallowed with her flagship off Stros M\'kai. The Old Coil gave back only the blade, and the sea never touched its gilding.',
  hint: 'Said to lie in the Old Coil\'s belly, once in a long while',
});

// Spoils, the codex, and saves read these record ids, so an id never changes when its record does.
/** @type {readonly GildedRecord[]} */
export const GILDED_RECORDS = Object.freeze([HOURLOCK, DRAGONFIRE_OATH, SUNKEN_SOVEREIGN]);
export const gildedById = (id) => GILDED_RECORDS.find((r) => r.id === id) ?? null;
export function gildedRecordOf(item) {
  return gildedById(item?.gilded);
}
export const isGilded = (item) => item?.rarity === GILDED;
// The ladder imports nothing from this file, so it reads Gilded power and lore through this registration.
registerGildedRecords({ powerOf: (id) => gildedById(id)?.power ?? null, loreOf: (item) => gildedRecordOf(item)?.lore ?? null });

/** @typedef {{ id: string, name: string, group: string, templateIndex: number, material: number, affixes: readonly any[], power: any, lore: string, hint?: string }} GildedRecord */
/** @param {GildedRecord} r */
export function mintGilded(r) {
  const item = createWeapon(r.templateIndex, r.material);
  const affixes = r.affixes.filter(validAffix).map((a) => ({ ...a }));
  item.name = r.name;
  item.rarity = GILDED;
  item.gilded = r.id;
  item.affixes = affixes;
  item.isIdentified = true;
  item.value = itemBaseValue(item) + affixesWorth(affixes) + GILDED_WORTH;
  return item;
}
export const mintHourlock = () => mintGilded(HOURLOCK);

// Each roll is one draw and the last of its spoils, so every earlier spoil keeps its seed.
export function rollHourlock(rolls = Math.random) {
  return rolls() < GILDED_CHANCE ? mintHourlock() : null;
}
export function rollDragonfireOath(rolls = Math.random) {
  return rolls() < GATE_GILDED_CHANCE ? mintGilded(DRAGONFIRE_OATH) : null;
}
export function rollSunkenSovereign(rolls = Math.random) {
  return rolls() < SERPENT_GILDED_CHANCE ? mintGilded(SUNKEN_SOVEREIGN) : null;
}

const NEVER_ON_GILDED = Object.freeze(['sigil', 'legendary', 'aetheric', 'imprint', 'cursed', 'socket', 'sockets', 'reforged', 'reforges', 'honed', 'exalted']);

// A static roll has no band: the wire check holds every line to its record exactly, so one number off fails.
/** @param {any} item */
export function validGildedMarks(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.rarity !== GILDED && item.gilded == null) return item;
  const r = gildedRecordOf(item);
  if (!r || item.rarity !== GILDED || r.group !== item.group || r.templateIndex !== item.templateIndex || item.material !== r.material) return null;
  const want = r.affixes, have = Array.isArray(item.affixes) ? item.affixes : [];
  if (have.length !== want.length) return null;
  for (let i = 0; i < want.length; i++) {
    const a = have[i], w = want[i];
    if (a?.id !== w.id || (a.param ?? null) !== (w.param ?? null) || a.value !== w.value) return null;
  }
  for (const k of NEVER_ON_GILDED) if (item[k] != null) return null;
  if (item.enchantments?.length || item.customEnchantments?.length) return null;
  return item;
}
