// @ts-check
import {
  NECRO_TYPES, MINIONS, isNecroType, minionHealth, minionMace, METAL_NAMES, CORPSE_TEMPLATE, CORPSE_GROUP, CORPSE_NAME,
  CORPSE_WEIGHT_KG, REAGENT, dropsCorpse, robGrave, NECRO_SPELLS, NECRO_SPELL_INDEX_BASE, NECRO_SPELL_SETTINGS, NECRO_SPELL_ICON,
  NECROMANCER_NAME,
} from './necroLaw.js';
import { ITEM_TEMPLATES, registerCustomTemplates, registerTemplateLore, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { addItem, getItem, removeOne } from '../../items/inventory.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { registerCompanionCount, registerCompanionRoster, companionSlotFree, COMPANION_SLOTS_FULL } from '../../characters/companionSlots.js';
import { chanceValue } from '../../magic/effects.js';
import { rollMagnitude } from '../../magic/spellcast.js';
import { skillValue, SKILLS } from '../../characters/skills.js';
import { liveStat } from '../../characters/statMods.js';
import { registerEnemyLootExtra, keepLoot } from '../../items/loot.js';
import { registerGraveSearchListener } from '../../items/searchables.js';
import { buildCustomSpell } from '../../magic/spellMaker.js';

// Saves store the minions under this vendor name, so renaming it drops saved minions.
export const NECRO_SAVE_VENDOR = "Cheb's Necromancy";

const DEAD_BODY = 281;
export const CORPSE_ROW = Object.freeze({
  ...ITEM_TEMPLATES[DEAD_BODY], index: CORPSE_TEMPLATE, name: CORPSE_NAME, baseWeight: CORPSE_WEIGHT_KG, basePrice: 0, value: 0,
  stackable: true, rarity: 1,
});
registerCustomTemplates([CORPSE_ROW]);
registerTemplateLore(CORPSE_TEMPLATE, 'What is left of someone. A necromancer has a use for it.');
export function mintCorpses(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: CORPSE_GROUP, templateIndex: CORPSE_TEMPLATE, name: CORPSE_NAME })), { stackCount: Math.max(1, Math.trunc(n) || 1) });
}
export const isCorpse = (item) => item?.templateIndex === CORPSE_TEMPLATE && item?.group === CORPSE_GROUP;
const mintReagent = (r) => mintCondition(setItemFields({ group: r.group, templateIndex: r.templateIndex }));

registerEnemyLootExtra('CHEBS-CORPSE', ({ items, mobileType }) => {
  if (dropsCorpse(mobileType)) items.push(keepLoot(mintCorpses(1)));
});

/** @type {Array<{ id: string, type: number, magnitude: number, health: number|null, maxHealth: number|null, mace: number|null }>} */
let _minions = [];
let _seq = 0;
let _recall = false;
const _waiting = new Set();
/** @type {string[]} */
const _partings = [];
/** @type {((text: string) => void) | null} */
let _say = null;
export function setNecroSay(fn) { _say = typeof fn === 'function' ? fn : null; }
const say = (s) => { try { _say?.(s); } catch { } };

export const minions = () => _minions;
const minionKey = (id) => `nx:${id}`;
export const isMinionKey = (k) => typeof k === 'string' && k.startsWith('nx:');
const _members = new Map();
function memberOf(m) {
  let c = _members.get(m.id);
  if (!c) { c = { boat: 'nx', name: m.id, key: minionKey(m.id) }; _members.set(m.id, c); }
  const row = MINIONS[m.type];
  c.title = row?.name ?? 'Minion';
  c.role = 'Minion';
  c.mobile = row?.mobile ?? 15;
  c.gender = 'male';
  c.health = m.health;
  c.maxHealth = m.maxHealth;
  c.minion = m;
  c.waiting = _waiting.has(m.id);
  return c;
}
function dropMinion(id) {
  const i = _minions.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const [m] = _minions.splice(i, 1);
  _members.delete(id);
  _waiting.delete(id);
  return m;
}
const crumbleText = (m) => `Your ${MINIONS[m.type]?.name.toLowerCase() ?? 'minion'} crumbles back into the dead.`;
export function necroParty() {
  return {
    get party() { return _minions.map(memberOf); },
    wake() { },
    knock(boat, id) {
      const m = dropMinion(id);
      if (!m) return false;
      say(crumbleText(m));
      return true;
    },
    hurt(boat, id, health, maxHealth) {
      const m = _minions.find((x) => x.id === id);
      if (!m) return;
      m.health = Number.isFinite(health) && health > 0 ? Math.min(health, maxHealth || health) : null;
      m.maxHealth = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : null;
    },
    isAshore(boat, id) { return _minions.some((m) => m.id === id); },
  };
}
registerCompanionCount('minions', () => _minions.length);
registerCompanionRoster('minions', () => _minions.map((m) => ({ name: MINIONS[m.type]?.name ?? 'Minion', role: 'Minion' })));
export const takeRecall = () => { const r = _recall; _recall = false; return r; };
export const minionRows = () => _minions.map((m) => ({ id: m.id, name: MINIONS[m.type]?.name ?? 'Minion', health: m.health, maxHealth: m.maxHealth, waiting: _waiting.has(m.id) }));
/** @param {string} id @param {boolean} on */
export function setMinionWaiting(id, on) {
  if (!_minions.some((m) => m.id === id)) return false;
  if (on) _waiting.add(id); else _waiting.delete(id);
  return true;
}
/** @param {string} id */
export function releaseMinion(id) {
  const m = dropMinion(id);
  if (m) _partings.push(crumbleText(m));
  return !!m;
}
export const takePartings = () => _partings.splice(0);
export function forgetMinions() { _minions = []; _members.clear(); _recall = false; _waiting.clear(); _partings.length = 0; }

registerModSaveData(NECRO_SAVE_VENDOR, {
  newSaveData: () => ({ minions: [] }),
  getSaveData: () => ({ minions: _minions.map((m) => ({ ...m })) }),
  restoreSaveData: (r) => {
    _members.clear();
    _waiting.clear();
    _partings.length = 0;
    _minions = (Array.isArray(r?.minions) ? r.minions : [])
      .filter((m) => m && typeof m.id === 'string' && MINIONS[m.type])
      .map((m) => ({ id: m.id.slice(0, 24), type: m.type, magnitude: Math.max(1, m.magnitude | 0), health: Number.isFinite(m.health) ? m.health : null, maxHealth: Number.isFinite(m.maxHealth) ? m.maxHealth : null, mace: Number.isInteger(m.mace) ? m.mace : null }))
      .slice(0, 8);
  },
  newGame: () => { forgetMinions(); },
});

const has = (items, r) => !!getItem(items, r.group, r.templateIndex, { allowQuestItem: false });
const spend = (items, r) => removeOne(items, r.templateIndex, { group: r.group, allowQuestItem: false });
const CORPSE = Object.freeze({ templateIndex: CORPSE_TEMPLATE, group: CORPSE_GROUP });
export function missingReagent(items, type) {
  const row = MINIONS[type];
  if (!row) return 'Nothing answers.';
  if (!has(items, CORPSE)) return 'No corpse item available.';
  if (row.anyOf.length && !row.anyOf.some((r) => has(items, r))) {
    const names = row.anyOf.map((r) => ITEM_TEMPLATES[r.templateIndex]?.name ?? 'reagent');
    return `You need ${names.join(' or ')} as well.`;
  }
  return null;
}
function spendReagents(items, type) {
  spend(items, CORPSE);
  const r = MINIONS[type]?.anyOf.find((x) => has(items, x));
  if (r) spend(items, r);
}

const d100 = (rolls) => 1 + Math.floor(rolls() * 100);
const casterNumbers = (entity) => ({
  mysticism: Number(skillValue(entity, SKILLS.Mysticism)) || 1,
  intelligence: Number(liveStat(entity, 'intelligence')) || 1,
  willpower: Number(liveStat(entity, 'willpower')) || 1,
});
export function raiseMinion(entity, type, magnitude) {
  const { mysticism, intelligence, willpower } = casterNumbers(entity);
  const m = {
    id: `${Date.now().toString(36)}${(++_seq).toString(36)}`, type, magnitude: Math.max(1, magnitude | 0),
    health: null, maxHealth: minionHealth(type, magnitude, mysticism, intelligence, willpower),
    mace: minionMace(type, magnitude, mysticism, intelligence, willpower),
  };
  _minions.push(m);
  return m;
}
export const riseText = (m) => (m.mace != null ? `${MINIONS[m.type].name} created with ${METAL_NAMES[m.mace]} Mace!` : `${MINIONS[m.type].name} created!`);

/**
 * @param {any} sp
 * @param {{ entity: any, level: number, say: (s: string) => void, rolls?: () => number }} ctx
 */
export function necroCast(sp, { entity, level, say: speak, rolls = Math.random }) {
  for (const e of sp?.effects ?? []) {
    if (!e || !isNecroType(e.type)) continue;
    const chance = chanceValue(e, level);
    if (e.type === NECRO_TYPES.recall) {
      if (!_minions.length) { speak('You have no minions to recall.'); continue; }
      if (d100(rolls) > chance) { speak('The recall fails.'); continue; }
      _recall = true;
      _waiting.clear();
      continue;
    }
    if (!companionSlotFree()) { speak(COMPANION_SLOTS_FULL); continue; }
    const lack = missingReagent(entity?.items ?? [], e.type);
    if (lack) { speak(lack); continue; }
    if (d100(rolls) > chance) { speak('The dead do not answer.'); continue; }
    spendReagents(entity.items, e.type);
    const m = raiseMinion(entity, e.type, rollMagnitude(e, level, rolls));
    speak(riseText(m));
  }
}
export const isNecroSpell = (sp) => (sp?.effects ?? []).some((e) => e && isNecroType(e.type));

/** @type {any} */
let _graveRobber = null;
export function setGraveRobber(entity) { _graveRobber = entity ?? null; }
registerGraveSearchListener((kind) => {
  const p = _graveRobber;
  if (!p || !Array.isArray(p.items)) return;
  const { mysticism, intelligence, willpower } = casterNumbers(p);
  const r = robGrave(mysticism, intelligence, willpower);
  say(r.text);
  if (r.corpse) addItem(p.items, mintCorpses(1));
  if (r.reagent && REAGENT[r.reagent]) addItem(p.items, mintReagent(REAGENT[r.reagent]));
});

// Builds fresh spell records on every call, since a bought record belongs to the player.
export function necroSpells() {
  return NECRO_SPELLS.map(([name, type], i) => buildCustomSpell({
    name: /** @type {string} */ (name), element: 4, rangeType: 0, icon: NECRO_SPELL_ICON, index: NECRO_SPELL_INDEX_BASE - i,
    slots: [{ type: /** @type {number} */ (type), subType: 255, settings: { ...NECRO_SPELL_SETTINGS } }],
  }));
}
export const isNecromancerCareer = (career) => career?.name === NECROMANCER_NAME && career?.necromancer === true;
export function giveNecromancerKit(entity, career) {
  if (!entity || !isNecromancerCareer(career)) return;
  const [animate] = necroSpells();
  const recall = necroSpells().find((s) => s.name === 'Novice Recall');
  entity.spells = [...(entity.spells ?? []), ...[animate, recall].filter(Boolean)];
  entity.items ??= [];
  addItem(entity.items, mintCorpses(1));
}
