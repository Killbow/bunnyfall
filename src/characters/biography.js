import { addItem, addGoldPieces, goldPiecesOf } from '../items/inventory.js';
import { itemBaseValue, templateByIndex, templateFor, mintCondition } from '../items/itemTemplates.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { SKILL_COUNT } from './skills.js';
import { ensureReactionState } from '../talk/talk.js';
import { createRandomBook } from '../items/books.js';
import { expandTalkMacros, MACRO_SYMBOLS } from '../talk/talkMacros.js';
import { getMacroValue } from '../systems/quest/questMacros.js';
import { setSeed, rand } from '../formats/dfRandom.js';
import { GENDERS, getNameBank, fullName } from './nameHelper.js';
import { localizedTable } from '../ui/textManager.js';

export const ITEM_GROUP_BY_ID = Object.freeze({
  0: 'Drugs', 1: 'UselessItems1', 2: 'Armor', 3: 'Weapons', 4: 'MagicItems',
  5: 'Artifacts', 6: 'MensClothing', 7: 'Books', 8: 'Furniture', 9: 'UselessItems2',
  10: 'ReligiousItems', 11: 'Maps', 12: 'WomensClothing', 13: 'Paintings', 14: 'Gems',
  15: 'PlantIngredients1', 16: 'PlantIngredients2', 17: 'CreatureIngredients1',
  18: 'CreatureIngredients2', 19: 'CreatureIngredients3', 20: 'MiscellaneousIngredients1',
  21: 'MetalIngredients', 22: 'MiscellaneousIngredients2', 23: 'Transportation',
  24: 'Deeds', 25: 'Jewellery', 26: 'QuestItems', 27: 'MiscItems', 28: 'Currency',
});

export function weaponToArmorMaterial(weaponMaterial) {
  const m = Number(weaponMaterial);
  if (!Number.isInteger(m) || m < 0 || m > 9) return ARMOR_MATERIAL.None;
  return ARMOR_MATERIAL.Iron + m;
}

export const isTextEffect = (effect) => effect[0] === '#' || effect[0] === '!' || effect[0] === '?';

const ARROW_TEMPLATE = 131;

const mintItem = (group, groupIndex, material, rolls) => {
  const t = templateFor(group, groupIndex);
  if (!t) return null;
  if (group === 'Books') return createRandomBook(rolls);
  if (group === 'Weapons') return createWeapon(t.index, t.index === ARROW_TEMPLATE ? 0 : material, rolls);
  const item = { group, templateIndex: t.index };
  if (group === 'Armor') item.material = weaponToArmorMaterial(material);
  item.name = templateByIndex(t.index)?.name;
  item.value = itemBaseValue(item);
  return mintCondition(item);
};

export function applyBiographyEffect(entity, effect, { rolls = Math.random } = {}) {
  if (!effect) return null;
  ensureReactionState(entity);
  const tokens = effect.split(/\s+/).filter((s) => s.length);
  const n = Number.parseInt(tokens[0], 10);

  if (Number.isInteger(n) && /^-?\d+$/.test(tokens[0])) {
    const mod = Number.parseInt(tokens[1], 10);
    if (!Number.isInteger(mod)) { console.warn(`[biog] invalid skill adjustment: ${effect}`); return null; }
    if (n < 0 || n >= SKILL_COUNT) { console.warn(`[biog] skill id out of range: ${effect}`); return null; }
    if (Array.isArray(entity.skills)) entity.skills[n] = (entity.skills[n] ?? 0) + mod;
    return 'skill';
  }
  if (effect.startsWith('GP')) {
    const arg = tokens.length > 2 ? tokens[1] + tokens[2] : tokens[1];
    const v = Number.parseInt(arg, 10);
    if (!Number.isFinite(v)) { console.warn(`[biog] GP - invalid argument: ${effect}`); return null; }
    if (arg[0] === '+') addGoldPieces(entity, Math.abs(v));
    else if (arg[0] === '-') entity.goldPieces = Math.max(0, goldPiecesOf(entity) - Math.abs(v));
    return 'gold';
  }
  if (effect.startsWith('IT')) {
    const [g, gi, mat] = [tokens[1], tokens[2], tokens[3]].map((t) => Number.parseInt(t, 10));
    if (![g, gi, mat].every(Number.isFinite)) { console.warn(`[biog] IT - invalid argument(s): ${effect}`); return null; }
    const group = ITEM_GROUP_BY_ID[g];
    const item = group ? mintItem(group, gi, mat, rolls) : null;
    if (!item) { console.warn(`[biog] IT - no template for ${effect}`); return null; }
    entity.items = entity.items ?? [];
    addItem(entity.items, item);
    return 'item';
  }
  if (effect.startsWith('r')) {
    const amount = Number.parseInt(tokens[1], 10);
    if (!Number.isFinite(amount)) { console.warn(`[biog] r - invalid argument: ${effect}`); return null; }
    if (effect[1] === 'f') {
      const id = Number.parseInt(tokens[0].split('f')[1], 10);
      if (!Number.isFinite(id)) { console.warn(`[biog] rf - invalid argument: ${effect}`); return null; }
      entity.pendingFactionRep = entity.pendingFactionRep ?? [];
      entity.pendingFactionRep.push({ id, amount });
      return 'factionRep';
    }
    const id = Number.parseInt(tokens[0].split('r')[1], 10);
    if (!Number.isFinite(id) || id < 0 || id >= entity.sGroupReputations.length) {
      console.warn(`[biog] r - invalid argument: ${effect}`); return null;
    }
    entity.sGroupReputations[id] += amount;
    return 'socialRep';
  }
  const MODS = { RP: 'biographyResistPoisonMod', FT: 'biographyFatigueMod', RR: 'biographyReactionMod', RD: 'biographyResistDiseaseMod', MR: 'biographyResistMagicMod', TH: 'biographyAvoidHitMod' };
  for (const [cmd, field] of Object.entries(MODS)) {
    if (!effect.startsWith(cmd)) continue;
    const v = Number.parseInt(tokens[1], 10);
    if (!Number.isFinite(v)) { console.warn(`[biog] ${cmd} - invalid argument: ${effect}`); return null; }
    entity[field] = v;
    return cmd;
  }
  if (isTextEffect(effect)) return 'text';
  if (effect.startsWith('AE') || effect.startsWith('AF') || effect.startsWith('AO')) {
    console.log(`[biog] ${effect.slice(0, 2)} - command unimplemented`);
    return 'unimplemented';
  }
  console.warn(`[biog] Invalid command - ${effect}`);
  return null;
}

export function digestRepChanges(effects, groups = 5) {
  const changed = new Array(groups).fill(0);
  for (const e of effects ?? []) {
    const tokens = String(e).split(/\s+/).filter((x) => x.length);
    if (e[0] !== 'r' || e[1] === 'f' || tokens.length < 2) continue;
    const id = Number.parseInt(tokens[0].split('r')[1], 10);
    const amount = Number.parseInt(tokens[1], 10);
    if (!Number.isFinite(id) || !Number.isFinite(amount) || id < 0 || id >= groups) continue;
    changed[id] += amount;
  }
  return changed;
}

const HOME_PROVINCE = localizedTable({
  Argonian: ['blackMarsh', 'Black Marsh'], Breton: ['highRock', 'High Rock'], DarkElf: ['morrowind', 'Morrowind'],
  HighElf: ['sumurset', 'Sumurset'], Khajiit: ['elsweyr', 'Elsweyr'], Nord: ['skyrim', 'Skyrim'],
  Redguard: ['hammerfell', 'Hammerfell'], WoodElf: ['valenwood', 'Valenwood'],
});
const GEOGRAPHICAL_FEATURE = localizedTable({
  Argonian: ['swamps', 'swamps'], Breton: ['rollingHills', 'rolling hills'], DarkElf: ['mountains', 'mountains'],
  HighElf: ['shores', 'shores'], Khajiit: ['desertLand', 'desertland'], Nord: ['mountains', 'mountains'],
  Redguard: ['desertLand', 'desertland'], WoodElf: ['forests', 'forests'],
});
const IMPERIAL_NAMES = Object.freeze(
  ['Pelagius', 'Cephorus', 'Uriel', 'Cassynder', 'Voragiel', 'Trabbatus']);

export function biogMacroSource(raceKey, seed) {
  const bank = () => getNameBank(raceKey);
  return {
    homeProvinceName: () => HOME_PROVINCE[raceKey] ?? null,
    geographicalFeature: () => GEOGRAPHICAL_FEATURE[raceKey] ?? null,
    name() { setSeed(seed); return fullName(bank(), GENDERS.Male); },
    imperialName() { setSeed(seed); return IMPERIAL_NAMES[rand() % 6]; },
    femaleName() { setSeed(seed + 123); return fullName(bank(), GENDERS.Female); },
    maleName() { setSeed(seed + 9543); return fullName(bank(), GENDERS.Male); },
  };
}

export function generateBackstory(textRsc, backstoryId, effects, ctx = {}) {
  if (!textRsc) return [];
  const perQuestion = [];
  for (const e of effects ?? []) {
    if (!isTextEffect(e)) continue;
    const [command, index] = String(e).split(' ');
    const q = Number.parseInt(index, 10);
    if (!Number.isFinite(q)) { console.warn('[biog] GenerateBackstory: Invalid question index.'); continue; }
    const id = Number.parseInt(command.slice(1), 10);
    if (!Number.isFinite(id)) continue;
    (perQuestion[q] = perQuestion[q] ?? []).push(id);
  }
  const firstLine = (id) => textRsc.linesById(id)?.[0]?.text ?? '';
  const macro = (digits, suffix) => {
    const list = perQuestion[Number(digits) - 1] ?? [];
    const id = list[suffix === 'b' ? 2 : suffix === 'a' ? 1 : 0];
    return id == null ? '' : firstLine(id);
  };
  const mcp = { source: biogMacroSource(ctx.raceKey ?? null, ctx.seed ?? 0) };
  const hooks = { playerRaceName: () => ctx.raceName ?? null };
  const handlers = {};
  for (const symbol of MACRO_SYMBOLS) handlers[symbol] = () => getMacroValue(symbol, mcp, hooks);
  for (let n = 1; n <= 12; n++) {
    for (const suffix of ['', 'a', 'b']) handlers[`%q${n}${suffix}`] = () => macro(n, suffix);
  }
  const rows = textRsc.linesById(backstoryId).map((row) => ({ ...row }));
  expandTalkMacros(rows, handlers);
  return rows;
}

export function applyBiographyEffects(entity, effects, opts = {}) {
  const applied = [];
  for (const e of effects ?? []) applied.push(applyBiographyEffect(entity, e, opts));
  return applied;
}

export function biographySkillBonuses(effects) {
  const out = new Array(SKILL_COUNT).fill(0);
  for (const e of effects ?? []) {
    const t = String(e).split(/\s+/).filter((x) => x.length);
    if (!/^-?\d+$/.test(t[0] ?? '')) continue;
    const id = Number.parseInt(t[0], 10), mod = Number.parseInt(t[1], 10);
    if (Number.isInteger(id) && id >= 0 && id < SKILL_COUNT && Number.isFinite(mod)) out[id] += mod;
  }
  return out;
}

export const tagEffect = (effect, questionIndex) =>
  (isTextEffect(effect) ? `${effect} ${questionIndex}` : effect);
