// The test room: prebuilt characters, their armory, and the seeding for a preset.

import { RACES } from './races.js';
import { resurrectionSpell } from '../magic/resurrect.js';
import { applyHeadlessChargen } from './chargenSession.js';
import { hitPointsPerLevelUp, spellPointMultiplier, spellPoints } from './chargen.js';
import { LEVEL_CAP } from './levelCap.js';
import { SKILL_HARD_CAP } from './skills.js';
import { fillVitalSigns } from './statMods.js';
import { setNames } from './names.js';
import { COMBAT_PREVIEW_PRESET, syncAbilityUnlocks } from '../combat/abilities/progress.js';
import { DAGGER_MILESTONES, TANTO_MILESTONES } from '../combat/abilities/milestones.js';
import { ABILITIES } from '../combat/abilities/registry.js';
import { hotbarEntryForAbility, hotbarEntryForWeaponRank, setHotbarSlot, switchHotbarPreset } from '../items/quickslots.js';
import { BLADE_WEAVE, THOUSAND_CUTS, HUNTING_LINE, PREDATORS_CROSSING, KNOCKOUT_CHAIN, TITANS_HANDS } from '../combat/abilities/combinations.js';
import { addItem } from '../items/inventory.js';
import { equipItem } from './equip.js';
import { mintCondition, templateByIndex, itemBaseValue, setItemFields } from '../items/itemTemplates.js';
import { WEAPONS_ENUM, ARMOR_ENUM, createWeapon, ARROW_TEMPLATE } from '../combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { TRANSPORT_HORSE_TEMPLATE, hasHorse } from '../items/inventorySession.js';
import { BOOK_TEMPLATE, createBook } from '../items/books.js';
import { BOOK_ID_TITLES } from '../items/booksData.js';
import { setPref } from '../ui/uiPrefs.js';
import { setModSetting } from '../mods/modSettings.js';
import { applyRarity, LEGENDARIES, ROLLED_TIERS, exaltLegendary, WARDROBE_LEGENDARIES, ARCANE_LEGENDARIES, cursePiece, SOCKET_EMPTY, GEM_IDS, socketMax, addTechniqueLine } from '../items/lootRarity.js';
import { TECHNIQUE_IDS, TECHNIQUES, GAUNTLETS_TEMPLATE } from '../combat/technique/techniqueRoster.js';
import { AETHERIC_RECORDS, mintAetheric } from '../items/aetheric.js';
import { mintHourlock, mintGilded, GILDED_RECORDS } from '../items/gilded.js';
import { welkyndStone, varlaStone } from '../items/ayleidStones.js';
import { mintGem } from '../items/gems.js';

export const TEST_PRESETS = Object.freeze([
  { id: COMBAT_PREVIEW_PRESET, label: 'Combat Preview', race: 'Nord', gender: 'male', faceIndex: 0, classIndex: 16,
    blurb: 'A max-level character with Daedric gear and the offline combat preview loadout.' },
  { id: 'nord-warrior', label: 'Nord Warrior', race: 'Nord', gender: 'male', faceIndex: 0, classIndex: 16,
    blurb: 'A plain human male in steel, with a longsword.' },
  { id: 'breton-sorceress', label: 'Breton Sorceress', race: 'Breton', gender: 'female', faceIndex: 2, classIndex: 3,
    blurb: 'Robes in the pack, and Fireball and Healing Bolt to cast.' },
  { id: 'redguard-archer', label: 'Redguard Archer', race: 'Redguard', gender: 'female', faceIndex: 4, classIndex: 13,
    blurb: 'Bows and a full quiver, with the arrow drawn on the string.' },
  { id: 'darkelf-nightblade', label: 'Dark Elf Nightblade', race: 'DarkElf', gender: 'male', faceIndex: 1, classIndex: 5,
    blurb: 'An elf with daggers and short blades.' },
  { id: 'khajiit-monk', label: 'Khajiit Monk', race: 'Khajiit', gender: 'male', faceIndex: 3, classIndex: 12,
    blurb: 'A beast race with its own skeleton and a tail.' },
  { id: 'argonian-barbarian', label: 'Argonian Barbarian', race: 'Argonian', gender: 'female', faceIndex: 5, classIndex: 15,
    blurb: 'The other beast race, female, with both kinds of axe.' },
]);

export const testPresetById = (id) => TEST_PRESETS.find((p) => p.id === id) ?? null;

export const TEST_RIDE = Object.freeze({
  id: 'ride', label: 'Ride out', preset: 'nord-warrior',
  blurb: 'The Nord Warrior on a horse, outside the town. Press T to dismount.',
});

export const TEST_LOOT = Object.freeze({
  id: 'loot', label: 'The loot ladder', preset: 'nord-warrior',
  blurb: 'The Nord Warrior with a Magic and a Rare of ten base items and every Legendary, all identified. Also one unidentified Rare and Legendary (how the top tiers look on the floor), one Exalted Legendary and the full Ruhn\'s Regalia. Turns Loot rarity on.',
});

export const TEST_SEA = Object.freeze({
  id: 'sea', label: 'Sea battle', preset: 'nord-warrior',
  pixel: Object.freeze({ x: 209, y: 216 }), hull: 2, foe: 'pirateBrig', range: 380,
  blurb: 'The Nord Warrior at the helm of an armed Small Ship on the open Bay south of Daggerfall, with a pirate brig closing in. Look to a side, hold Attack to aim a broadside and release to fire. Brace when warned. Turns Come Sail Away and Naval Combat on.',
});

export const TEST_SEA_TEXT = Object.freeze({
  begun: 'A pirate brig closes in. Look to a side and hold Attack to aim a broadside, then release to fire.',
  refused: 'The sea battle needs Come Sail Away\'s boats, and they did not load.',
  noRoom: 'No open water here for a pirate ship.',
});

export const testStartsOutdoors = (id) => id === TEST_RIDE.id || id === TEST_SEA.id;

export function enableTestSea() {
  setModSetting('come-sail-away', 'Enabled', true);
  setPref('naval', true);
}

export function testEntryById(id) {
  if (id === TEST_RIDE.id) return { preset: testPresetById(TEST_RIDE.preset), ride: true };
  if (id === TEST_SEA.id) return { preset: testPresetById(TEST_SEA.preset), ride: false, sea: true };
  if (id === TEST_LOOT.id) return { preset: testPresetById(TEST_LOOT.preset), ride: false, loot: true };
  const preset = testPresetById(id);
  return preset ? { preset, ride: false } : null;
}

export function seedTestMount(entity) {
  if (hasHorse(entity.items)) return false;
  const horse = mintCondition({
    group: 'Transportation', templateIndex: TRANSPORT_HORSE_TEMPLATE,
    name: templateByIndex(TRANSPORT_HORSE_TEMPLATE)?.name ?? 'Horse', flags: 0,
  });
  horse.value = itemBaseValue(horse);
  addItem(entity.items, horse);
  return true;
}

export function testGearRows(gender) {
  const female = gender === 'female';
  const W = WEAPONS_ENUM; const A = ARMOR_ENUM; const M = ARMOR_MATERIAL;
  const rows = [];
  for (const [name, t] of Object.entries(W)) rows.push({ kind: 'weapon', label: `Steel ${name}`, templateIndex: t, material: 1 });
  rows.push({ kind: 'weapon', label: 'Iron Dagger', templateIndex: W.Dagger, material: 0 });
  rows.push({ kind: 'weapon', label: 'Ebony Longsword', templateIndex: W.Longsword, material: 7 });
  rows.push({ kind: 'weapon', label: 'Daedric Dai-Katana', templateIndex: W['Dai-Katana'], material: 9 });
  rows.push({ kind: 'arrows', label: 'Arrows (60)', templateIndex: ARROW_TEMPLATE, stackCount: 60 });
  for (const [name, t] of Object.entries(A)) rows.push({ kind: 'armor', label: `Steel ${name.replace(/_/g, ' ')}`, templateIndex: t, material: M.Steel });
  rows.push({ kind: 'armor', label: 'Leather Cuirass', templateIndex: A.Cuirass, material: M.Leather });
  rows.push({ kind: 'armor', label: 'Leather Gauntlets', templateIndex: A.Gauntlets, material: M.Leather });
  rows.push({ kind: 'armor', label: 'Chain Cuirass', templateIndex: A.Cuirass, material: M.Chain });
  rows.push({ kind: 'armor', label: 'Chain Greaves', templateIndex: A.Greaves, material: M.Chain });
  rows.push({ kind: 'armor', label: 'Ebony Cuirass', templateIndex: A.Cuirass, material: M.Ebony });
  rows.push({ kind: 'armor', label: 'Daedric Helm', templateIndex: A.Helm, material: M.Daedric });
  const clothes = female
    ? [[200, 'Plain Robes'], [184, 'Peasant Blouse'], [190, 'Casual Pants'], [186, 'Shoes'], [191, 'Casual Cloak'], [212, 'Long Skirt']]
    : [[163, 'Plain Robes'], [165, 'Short Shirt'], [151, 'Casual Pants'], [147, 'Shoes'], [154, 'Casual Cloak'], [158, 'Short Tunic']];
  for (const [t, label] of clothes) {
    rows.push({ kind: 'clothing', label, templateIndex: t, group: female ? 'WomensClothing' : 'MensClothing' });
  }
  for (const id of TEST_BOOKS) rows.push({ kind: 'book', label: BOOK_ID_TITLES.get(id), templateIndex: BOOK_TEMPLATE, message: id });
  return rows;
}

export const TEST_BOOKS = Object.freeze([28, 5, 1, 25]);

export function testItemOf(row) {
  if (row.kind === 'weapon') return createWeapon(row.templateIndex, row.material);
  if (row.kind === 'book') return createBook(row.message);
  if (row.kind === 'arrows') return { ...createWeapon(ARROW_TEMPLATE, 0), stackCount: row.stackCount };
  if (row.kind === 'armor') {
    return mintCondition(setItemFields({
      group: 'Armor', templateIndex: row.templateIndex, material: row.material,
      name: row.label, flags: 0,
    }));
  }
  return mintCondition({
    group: row.group, templateIndex: row.templateIndex, dye: 0, variant: 0,
    name: templateByIndex(row.templateIndex)?.name ?? row.label, flags: 0,
  });
}

const COMBAT_PREVIEW_SLOTS = [
  'weapon.long-bow.skyfall', 'weapon.crossbow.final-verdict',
  'weapon.ballista.siege-of-heaven', 'weapon.hand-to-hand.hundred-fist-ascension',
  'utility.wayfarers-anchor-mark', 'utility.wayfarers-anchor-recall',
];
const COMBINATION_PREVIEW_SLOTS = [
  BLADE_WEAVE, THOUSAND_CUTS, HUNTING_LINE, PREDATORS_CROSSING, KNOCKOUT_CHAIN, TITANS_HANDS,
  'combination.archery.short-blade.hidden-relay', 'combination.archery.axe.felling-volley',
  'combination.axe.long-blade.rallying-ruin', 'combination.axe.blunt.earthsplitter',
];
const EXTRA_UTILITY_PREVIEW_SLOTS = [
  'utility.trailblazer', 'utility.featherstep', 'utility.hunters-awareness', 'utility.deepwater-training',
  'utility.riverstride', 'utility.breakaway', 'utility.skyward-ascent', 'utility.field-antidote', 'utility.lockbreaker',
];

export function seedCombatPreview(entity) {
  setNames(entity, 'Combat', 'Preview');
  entity.level = LEVEL_CAP;
  entity.skills.fill(SKILL_HARD_CAP);
  entity.masterSkills = true;
  entity.masterSkillsAsked = true;
  entity.masteredSkills = Array.from(entity.skills, (_, id) => id);
  for (const key of Object.keys(entity.stats)) entity.stats[key] = 100;
  entity.maxHealth += (LEVEL_CAP - 1) * hitPointsPerLevelUp(entity.career, entity.stats.endurance, () => 0.5);
  entity.maxMagicka = spellPoints(entity.stats.intelligence,
    spellPointMultiplier(entity.career.abilityFlagsAndSpellPointsBitfield ?? 0x1000));
  fillVitalSigns(entity);

  const templates = ABILITIES.filter(ability => ability.category === 'weapon' && ability.rank === 25
    && typeof ability.templates[0] === 'number').map(ability => ability.templates[0]);
  const rows = [...new Set([WEAPONS_ENUM.Longsword, ...templates])]
    .map(templateIndex => ({ kind: 'weapon', templateIndex, material: 9 }));
  for (const [name, templateIndex] of Object.entries(ARMOR_ENUM)) {
    if (!/shield|buckler/i.test(name)) rows.push({
      kind: 'armor', templateIndex, material: ARMOR_MATERIAL.Daedric, label: 'Daedric ' + name.replace(/_/g, ' '),
    });
  }
  rows.push({ kind: 'arrows', stackCount: 240 });
  for (const [i, row] of rows.entries()) {
    const item = testItemOf(row);
    addItem(entity.items, item);
    if (i === 0 || row.kind === 'armor') equipItem(entity, item);
  }
  syncAbilityUnlocks(entity);
  [25, 50, 75, 100].forEach((rank, i) => setHotbarSlot(i, hotbarEntryForWeaponRank(rank)));
  COMBAT_PREVIEW_SLOTS.forEach((id, i) => setHotbarSlot(i + 4, hotbarEntryForAbility(id)));
  switchHotbarPreset(1);
  COMBINATION_PREVIEW_SLOTS.forEach((id, i) => setHotbarSlot(i, hotbarEntryForAbility(id)));
  switchHotbarPreset(2);
  setHotbarSlot(0, hotbarEntryForAbility('racial.nord.frostborn-charge'));
  EXTRA_UTILITY_PREVIEW_SLOTS.forEach((id, i) => setHotbarSlot(i + 1, hotbarEntryForAbility(id)));
  switchHotbarPreset(3);
  [...DAGGER_MILESTONES, ...TANTO_MILESTONES].forEach((id, i) => setHotbarSlot(i, hotbarEntryForAbility(id)));
  switchHotbarPreset(0);
  setPref('quickbarStyle', 'hotbar');
  return rows.length;
}

export function seedTestGear(entity) {
  const rows = testGearRows(entity.gender);
  const added = [];
  for (const row of rows) {
    const item = testItemOf(row);
    addItem(entity.items, item);
    added.push(item);
  }
  return added;
}

export const TECHNIQUE_TEST_BASES = Object.freeze({
  archery: Object.freeze({ kind: 'weapon', templateIndex: WEAPONS_ENUM['Long Bow'] ?? 130, material: 1 }),
  longBlade: Object.freeze({ kind: 'weapon', templateIndex: WEAPONS_ENUM.Longsword, material: 1 }),
  shortBlade: Object.freeze({ kind: 'weapon', templateIndex: WEAPONS_ENUM.Dagger, material: 1 }),
  axe: Object.freeze({ kind: 'weapon', templateIndex: WEAPONS_ENUM['Battle Axe'] ?? 127, material: 1 }),
  blunt: Object.freeze({ kind: 'weapon', templateIndex: WEAPONS_ENUM.Mace ?? 124, material: 1 }),
  handToHand: Object.freeze({ kind: 'armor', label: 'Steel Gauntlets', templateIndex: GAUNTLETS_TEMPLATE, material: ARMOR_MATERIAL.Steel }),
});

export const TEST_GEMS = Object.freeze(['chipped-emerald', 'flawed-amber', 'flawless-ruby', 'perfect-diamond']);
export const TEST_LOOT_BASES = Object.freeze([
  { kind: 'weapon', label: 'Steel Longsword', templateIndex: WEAPONS_ENUM.Longsword, material: 1 },
  { kind: 'weapon', label: 'Steel Dagger', templateIndex: WEAPONS_ENUM.Dagger, material: 1 },
  { kind: 'weapon', label: 'Steel Battle Axe', templateIndex: WEAPONS_ENUM['Battle Axe'] ?? 127, material: 1 },
  { kind: 'weapon', label: 'Steel Long Bow', templateIndex: WEAPONS_ENUM['Long Bow'] ?? 130, material: 1 },
  { kind: 'armor', label: 'Steel Cuirass', templateIndex: ARMOR_ENUM.Cuirass, material: ARMOR_MATERIAL.Steel },
  { kind: 'armor', label: 'Steel Helm', templateIndex: ARMOR_ENUM.Helm, material: ARMOR_MATERIAL.Steel },
  { kind: 'armor', label: 'Steel Boots', templateIndex: ARMOR_ENUM.Boots, material: ARMOR_MATERIAL.Steel },
  { kind: 'armor', label: 'Steel Kite Shield', templateIndex: ARMOR_ENUM.Kite_Shield ?? 111, material: ARMOR_MATERIAL.Steel },
  { kind: 'jewellery', label: 'Ring', templateIndex: 135, group: 'Jewellery' },
  { kind: 'jewellery', label: 'Amulet', templateIndex: 133, group: 'Jewellery' },
]);

export function seedTestLoot(entity, rolls = Math.random) {
  setPref('lootRarity', true);
  const added = [];
  const base = (row) => (row.kind === 'jewellery'
    ? mintCondition({ group: 'Jewellery', templateIndex: row.templateIndex, name: templateByIndex(row.templateIndex)?.name ?? row.label, flags: 0 })
    : testItemOf(row));
  const put = (it, { identified = true } = {}) => {
    if (identified) it.isIdentified = true;
    addItem(entity.items, it);
    added.push(it);
    return it;
  };
  const legendaryItem = (rec) => {
    const row = TEST_LOOT_BASES.find((r) => (r.group ?? (r.kind === 'weapon' ? 'Weapons' : 'Armor')) === rec.group && (!rec.templates || rec.templates.includes(r.templateIndex)))
      ?? TEST_LOOT_BASES.find((r) => (r.group ?? (r.kind === 'weapon' ? 'Weapons' : 'Armor')) === rec.group);
    const it = base(rec.templates && !rec.templates.includes(row.templateIndex) ? { ...row, templateIndex: rec.templates[0], label: templateByIndex(rec.templates[0])?.name ?? row.label } : row);
    return applyRarity(it, 'legendary', () => 0, [rec]);
  };
  for (const tier of ROLLED_TIERS.filter((t) => t !== 'legendary')) {
    for (const row of TEST_LOOT_BASES) put(applyRarity(base(row), tier, rolls));
  }
  for (const rec of LEGENDARIES) put(legendaryItem(rec));
  for (const rec of AETHERIC_RECORDS) put(mintAetheric(rec));
  put(applyRarity(base(TEST_LOOT_BASES[0]), 'rare', rolls), { identified: false });
  if (LEGENDARIES.length) put(legendaryItem(LEGENDARIES[0]), { identified: false });
  if (LEGENDARIES.length) { const ex = legendaryItem(LEGENDARIES[0]); exaltLegendary(ex, rolls); put(ex); }
  for (const t of TEST_WARDROBE_BASES) for (const tier of ['magic', 'rare']) put(applyRarity(testGarment(t), tier, rolls));
  for (const rec of WARDROBE_LEGENDARIES) put(applyRarity(testGarment(rec.templates[0]), 'legendary', () => 0, [rec]));
  { const r = applyRarity(base(TEST_LOOT_BASES[0]), 'rare', rolls); cursePiece(r, rolls); put(r); }
  if (LEGENDARIES.length) { const l = legendaryItem(LEGENDARIES[0]); cursePiece(l, rolls); put(l); }
  { const s = applyRarity(base(TEST_LOOT_BASES[0]), 'rare', rolls); s.sockets = [SOCKET_EMPTY]; put(s); }
  put(mintCondition(setItemFields({ group: 'Gems', templateIndex: GEM_IDS.indexOf('ruby') })));
  put(welkyndStone());
  put(varlaStone());
  put(mintHourlock());
  put({ ...createWeapon(ARROW_TEMPLATE, 0), stackCount: 30 });
  for (const r of GILDED_RECORDS) if (r.id !== 'the-hourlock') put(mintGilded(r));
  { const b = applyRarity(base(TEST_LOOT_BASES[3]), 'rare', rolls); b.sockets = Array(socketMax(b)).fill(SOCKET_EMPTY); put(b); }
  for (const id of TEST_GEMS) put(/** @type {any} */ (mintGem(id)));
  { const d = LEGENDARIES.find((rec) => rec.group === 'Weapons'); if (d) { const it = legendaryItem(d); cursePiece(it, rolls, { damned: true }); put(it); } }
  for (const id of TECHNIQUE_IDS) {
    const fam = TECHNIQUES[id].families[0];
    const piece = TECHNIQUE_TEST_BASES[fam];
    if (!piece) continue;
    const it = applyRarity(testItemOf(piece), 'rare', rolls);
    if (addTechniqueLine(it, () => 0.5, { id })) put(it);
  }
  for (const rec of ARCANE_LEGENDARIES) put(legendaryItem(rec));
  return added;
}
export const TEST_WARDROBE_BASES = Object.freeze([155, 195]);
const testGarment = (templateIndex) => mintCondition({ group: templateIndex >= 182 ? 'WomensClothing' : 'MensClothing', templateIndex,
  name: templateByIndex(templateIndex)?.name ?? 'Garment', flags: 0, variant: 0 });

// Fixed indices below the Healer's touch (-1000) stop a re-apply from adding the spells twice.
const TEST_MISSILE_EFFECT = (type, subType, lo, hi) => ({
  type, subType,
  durationBase: 0, durationMod: 0, durationPerLevel: 1,
  chanceBase: 0, chanceMod: 0, chancePerLevel: 1,
  magnitudeBaseLow: lo, magnitudeBaseHigh: hi, magnitudeLevelBase: 1, magnitudeLevelHigh: 2, magnitudePerLevel: 1,
});
export const TEST_FIREBALL_INDEX = -1001;
export const TEST_HEAL_BOLT_INDEX = -1002;
export function testMissileSpells(spellsByIndex = null) {
  let fireball = null;
  for (const sp of spellsByIndex?.values?.() ?? []) {
    if (String(sp?.name ?? '').trim().toLowerCase() === 'fireball' && sp.rangeType >= 2) { fireball = sp; break; }
  }
  fireball ??= {
    name: 'Fireball', element: 0, rangeType: 4, icon: 0, cost: 0, index: TEST_FIREBALL_INDEX, custom: true,
    effects: [TEST_MISSILE_EFFECT(4, 0, 10, 20)],
  };
  const healBolt = {
    name: 'Healing Bolt', element: 4, rangeType: 2, icon: 0, cost: 0, index: TEST_HEAL_BOLT_INDEX, custom: true,
    effects: [TEST_MISSILE_EFFECT(10, 8, 5, 10)],
  };
  return [fireball, healBolt];
}
export function addTestMissileSpells(entity, spellsByIndex = null) {
  entity.spells ??= [];
  for (const sp of [...testMissileSpells(spellsByIndex), resurrectionSpell()]) {
    if (!entity.spells.some((k) => k === sp || (k?.index === sp.index && k?.name === sp.name))) entity.spells.push(sp);
  }
  return entity.spells;
}

export function addRandomTestSpells(entity, spellsByIndex = null, count = 8, random = Math.random) {
  entity.spells ??= [];
  const pool = [...(spellsByIndex?.values?.() ?? [])].filter(sp => sp?.name
    && !entity.spells.some(known => known?.index === sp.index && known?.name === sp.name));
  for (let i = 0; i < count && pool.length; i++) entity.spells.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return entity.spells;
}

export async function applyTestCharacter(playerEntity, preset, { fetchBytes, spellsByIndex = null } = {}) {
  playerEntity.race = preset.race;
  playerEntity.raceId = RACES[preset.race] ?? 1;
  playerEntity.gender = preset.gender;
  playerEntity.faceIndex = preset.faceIndex | 0;
  playerEntity.name = preset.label;
  await applyHeadlessChargen(playerEntity, preset.classIndex, { fetchBytes, spellsByIndex });
  playerEntity.testRoom = true;
  if (preset.id === 'breton-sorceress') addTestMissileSpells(playerEntity, spellsByIndex);
  if (preset.id === COMBAT_PREVIEW_PRESET) {
    addTestMissileSpells(playerEntity, spellsByIndex);
    addRandomTestSpells(playerEntity, spellsByIndex, 8);
    return { added: seedCombatPreview(playerEntity) };
  }
  const added = seedTestGear(playerEntity);
  const cuirass = added.find((it) => it.group === 'Armor' && it.templateIndex === ARMOR_ENUM.Cuirass && it.material === ARMOR_MATERIAL.Steel);
  const sword = added.find((it) => it.group === 'Weapons' && it.templateIndex === WEAPONS_ENUM.Longsword && it.material === 1);
  if (cuirass) equipItem(playerEntity, cuirass);
  if (sword) equipItem(playerEntity, sword);
  return { added: added.length };
}

/**
 * @param {URLSearchParams} params
 * @param {{ snap?: () => any, loadSlot?: (key: number) => any, mostRecent?: () => ({ snap: any } | null) }} saves
 */
export function testRoomOnlineRefused(params, { snap: pick = null, loadSlot, mostRecent } = {}) {
  if (!params?.has?.('online')) return false;
  if (params.has('test') && testEntryById(params.get('test'))) return true;
  if (!params.has('load')) return false;
  let snap = null;
  try { snap = pick ? pick() : params.has('loadkey') ? loadSlot(Number(params.get('loadkey'))) : (mostRecent()?.snap ?? null); } catch { snap = null; }
  return snap?.testRoom === true;
}
export const TEST_ROOM_OFFLINE_TEXT = 'A Test Room character plays offline only. Its gear stays in the room.';
