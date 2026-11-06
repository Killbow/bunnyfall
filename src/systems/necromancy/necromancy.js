// @ts-check
// BUNNYFALL (2026-11-06): CHEB'S NECROMANCY - THE CASTER'S SIDE (the law: systems/necromancy/necroLaw.js; the bodies in
// the world: scenes/necroHost.js, over the companion layer). Kept here:
//   - THE MINIONS: the character's raised undead, each `{ id, type, magnitude, health, maxHealth, mace }`, saved with the
//     character (modSaveData, the mod's vendor name), counted at the player's side (companionSlots.js) and listed on the
//     companion roster. One dies (its health run out: the layer's knock) and it is gone - a minion is raised, not hired.
//   - THE CAST (necroCast): a caster-only spell carrying the mod's effects (the cast engine's CasterOnly arm, through
//     scenes/bunnySpellEngine.js cast): each effect's Chance rolled as DFU rolls it (Dice100.SuccessRoll(ChanceValue())),
//     a summon's reagents found in the pack and spent only when the minion rises, its magnitude rolled (GetMagnitude).
//     Recall Minions asks the host to bring every one to the caster's side.
//   - THE CORPSE (CustomCorpseItem): its row, its mint, and the drop on a fallen humanoid's body (OnEnemyDeath), through
//     the loot's extras.
//   - THE GRAVES (GravediggingActivation): a grave searched (systems/searchables.js's roll, told the kind) is robbed by
//     the mod's roll, once a grave; its corpse and its trifle go to the pack, its words to the screen.
//   - THE NECROMANCER'S KIT (CustomWizard.cs :560-581): Animate Dead, Novice Recall and a corpse at creation.
import {
  NECRO_TYPES, MINIONS, isNecroType, minionHealth, minionMace, METAL_NAMES, CORPSE_TEMPLATE, CORPSE_GROUP, CORPSE_NAME,
  CORPSE_WEIGHT_KG, REAGENT, dropsCorpse, robGrave, NECRO_SPELLS, NECRO_SPELL_INDEX_BASE, NECRO_SPELL_SETTINGS, NECRO_SPELL_ICON,
  NECROMANCER_NAME,
} from './necroLaw.js';
import { ITEM_TEMPLATES, registerCustomTemplates, registerTemplateLore, setItemFields, mintCondition } from '../item/itemTemplates.js';
import { addItem, getItem, removeOne } from '../inventory.js';
import { registerModSaveData } from '../modSaveData.js';
import { registerCompanionCount, registerCompanionRoster, companionSlotFree, COMPANION_SLOTS_FULL } from '../companionSlots.js';
import { chanceValue } from '../effects.js';
import { rollMagnitude } from '../spellcast.js';
import { skillValue, SKILLS } from '../skills.js';
import { liveStat } from '../statMods.js';
import { registerEnemyLootExtra, keepLoot } from '../loot/loot.js';
import { registerGraveSearchListener } from '../searchables.js';
import { buildCustomSpell } from '../spell/spellMaker.js';

export const NECRO_SAVE_VENDOR = "Cheb's Necromancy";

// ── the corpse ────────────────────────────────────────────────────────────────────────────────────────────────────
const DEAD_BODY = 281;   // MiscItems.Dead_Body: its picture (TEXTURE.380 record 1)
export const CORPSE_ROW = Object.freeze({
  ...ITEM_TEMPLATES[DEAD_BODY], index: CORPSE_TEMPLATE, name: CORPSE_NAME, baseWeight: CORPSE_WEIGHT_KG, basePrice: 0, value: 0,
  stackable: true, rarity: 1,
});
registerCustomTemplates([CORPSE_ROW]);
registerTemplateLore(CORPSE_TEMPLATE, 'What is left of someone. A necromancer has a use for it.');
/** `n` Humanoid Corpses, one stack. */
export function mintCorpses(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: CORPSE_GROUP, templateIndex: CORPSE_TEMPLATE, name: CORPSE_NAME })), { stackCount: Math.max(1, Math.trunc(n) || 1) });
}
export const isCorpse = (item) => item?.templateIndex === CORPSE_TEMPLATE && item?.group === CORPSE_GROUP;
/** A reagent's item (a classic template), one. */
const mintReagent = (r) => mintCondition(setItemFields({ group: r.group, templateIndex: r.templateIndex }));

// OnEnemyDeath: every humanoid's body carries one (the loot's extras run on a foe with a loot table - every class foe
// and the orcs have one)
registerEnemyLootExtra('CHEBS-CORPSE', ({ items, mobileType }) => {
  if (dropsCorpse(mobileType)) items.push(keepLoot(mintCorpses(1)));
});

// ── the minions ───────────────────────────────────────────────────────────────────────────────────────────────────
/** @type {Array<{ id: string, type: number, magnitude: number, health: number|null, maxHealth: number|null, mace: number|null }>} */
let _minions = [];
let _seq = 0;
let _recall = false;
/** @type {((text: string) => void) | null} */
let _say = null;
/** The host's mouth for the party's words (a minion fallen, the slots full on a load). */
export function setNecroSay(fn) { _say = typeof fn === 'function' ? fn : null; }
const say = (s) => { try { _say?.(s); } catch { /* a word is nobody's failure */ } };

export const minions = () => _minions;
const minionKey = (id) => `nx:${id}`;
export const isMinionKey = (k) => typeof k === 'string' && k.startsWith('nx:');
const _members = new Map();
/** The companion layer's member for a minion (crewAshore.js's party shape: boat, name, key, title, mobile, gender, health). */
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
  return c;
}
/** The minions' party, the companion layer's (systems/naval/crewCompanions.js's shape). */
export function necroParty() {
  return {
    get party() { return _minions.map(memberOf); },
    wake() { /* a minion never rests */ },
    knock(boat, id) {
      const i = _minions.findIndex((m) => m.id === id);
      if (i < 0) return false;
      const [m] = _minions.splice(i, 1);
      _members.delete(id);
      say(`Your ${MINIONS[m.type]?.name.toLowerCase() ?? 'minion'} crumbles back into the dead.`);
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
/** Recall Minions asked: the host reads it once (takeRecall) and brings every one to the caster's side. */
export const takeRecall = () => { const r = _recall; _recall = false; return r; };
/** Tests and a new game: none raised. */
export function forgetMinions() { _minions = []; _members.clear(); _recall = false; }

registerModSaveData(NECRO_SAVE_VENDOR, {
  newSaveData: () => ({ minions: [] }),
  getSaveData: () => ({ minions: _minions.map((m) => ({ ...m })) }),
  restoreSaveData: (r) => {
    _members.clear();
    _minions = (Array.isArray(r?.minions) ? r.minions : [])
      .filter((m) => m && typeof m.id === 'string' && MINIONS[m.type])
      .map((m) => ({ id: m.id.slice(0, 24), type: m.type, magnitude: Math.max(1, m.magnitude | 0), health: Number.isFinite(m.health) ? m.health : null, maxHealth: Number.isFinite(m.maxHealth) ? m.maxHealth : null, mace: Number.isInteger(m.mace) ? m.mace : null }))
      .slice(0, 8);
  },
  newGame: () => { forgetMinions(); },
});

// ── the reagents in the pack ──────────────────────────────────────────────────────────────────────────────────────
const has = (items, r) => !!getItem(items, r.group, r.templateIndex, { allowQuestItem: false });
const spend = (items, r) => removeOne(items, r.templateIndex, { group: r.group, allowQuestItem: false });
const CORPSE = Object.freeze({ templateIndex: CORPSE_TEMPLATE, group: CORPSE_GROUP });
/** What a summon of `type` still lacks in `items`, as the mod's word, or null with everything at hand (HasReagents). */
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
/** ConsumeReagents: the corpse and the first of the others at hand. */
function spendReagents(items, type) {
  spend(items, CORPSE);
  const r = MINIONS[type]?.anyOf.find((x) => has(items, x));
  if (r) spend(items, r);
}

// ── the cast ──────────────────────────────────────────────────────────────────────────────────────────────────────
const d100 = (rolls) => 1 + Math.floor(rolls() * 100);
/** The caster's three numbers: live Mysticism, Intelligence and Willpower. */
const casterNumbers = (entity) => ({
  mysticism: Number(skillValue(entity, SKILLS.Mysticism)) || 1,
  intelligence: Number(liveStat(entity, 'intelligence')) || 1,
  willpower: Number(liveStat(entity, 'willpower')) || 1,
});
/** Raise one minion of `type` at `magnitude` for `entity` - its health and mace by the mod's sums. Answers it. */
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
/** The words a minion rises with (the spawners' HUD lines). */
export const riseText = (m) => (m.mace != null ? `${MINIONS[m.type].name} created with ${METAL_NAMES[m.mace]} Mace!` : `${MINIONS[m.type].name} created!`);

/**
 * A caster-only spell landed (scenes/bunnySpellEngine.js cast): each of the mod's effects in it, in order.
 * @param {any} sp @param {{ entity: any, level: number, say: (s: string) => void, rolls?: () => number }} ctx
 */
export function necroCast(sp, { entity, level, say: speak, rolls = Math.random }) {
  for (const e of sp?.effects ?? []) {
    if (!e || !isNecroType(e.type)) continue;
    const chance = chanceValue(e, level);
    if (e.type === NECRO_TYPES.recall) {
      if (!_minions.length) { speak('You have no minions to recall.'); continue; }
      if (d100(rolls) > chance) { speak('The recall fails.'); continue; }
      _recall = true;
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
/** Does a spell carry any of the mod's effects. */
export const isNecroSpell = (sp) => (sp?.effects ?? []).some((e) => e && isNecroType(e.type));

// ── the graves ────────────────────────────────────────────────────────────────────────────────────────────────────
/** @type {any} */
let _graveRobber = null;
/** The player who robs the graves (the host's). */
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

// ── the ready-made spells and the Necromancer's kit ───────────────────────────────────────────────────────────────
/** The mod's ready-made spells, made fresh each call (a record is the player's once bought). */
export function necroSpells() {
  return NECRO_SPELLS.map(([name, type], i) => buildCustomSpell({
    name, element: 4, rangeType: 0, icon: NECRO_SPELL_ICON, index: NECRO_SPELL_INDEX_BASE - i,
    slots: [{ type, subType: 255, settings: { ...NECRO_SPELL_SETTINGS } }],
  }));
}
/** Is `career` the mod's Necromancer. */
export const isNecromancerCareer = (career) => career?.name === NECROMANCER_NAME && career?.necromancer === true;
/** CustomWizard.cs :560-581: a new Necromancer's Animate Dead, Novice Recall and corpse. */
export function giveNecromancerKit(entity, career) {
  if (!entity || !isNecromancerCareer(career)) return;
  const [animate] = necroSpells();
  const recall = necroSpells().find((s) => s.name === 'Novice Recall');
  entity.spells = [...(entity.spells ?? []), ...[animate, recall].filter(Boolean)];
  entity.items ??= [];
  addItem(entity.items, mintCorpses(1));
}
