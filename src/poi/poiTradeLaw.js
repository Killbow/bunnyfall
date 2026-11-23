// @ts-check

// Validates items named by a POI trade, key item, or condition against the game's item law.
// poiLawV2.js checks a stack's shape: a template number, a group name, a material, and a count. This file
// asks the game's catalogs whether that stack could exist, in the terms the server uses when it mints a reward
// (server-account/src/staffGive.js mintGift). The server still mints the piece and runs the item law over it at
// settlement; this check lets the editor and the approval step refuse what settlement would refuse. It also checks the
// values of the fields the shape law knows only by key (a stack's `recipe`, an encounter's `pacifiable`).
// Everything imported here lives under src/, so the account service, the editor, and an offline game can all load it.

import { lawTemplate, templateGroups } from '../items/itemLaw.js';
import { isStackable, GLASS_BOTTLE_TEMPLATE } from '../items/inventory.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { varsRead, persists, needsService } from './poiDmCore.js';
import { potionKeyOf } from './poiSettle.js';

/** @typedef {import('./poiLaw.js').PoiProblem} PoiProblem */

/** The material numbers a weapon or a piece of armour may be made of, as the item maker takes them. */
const WEAPON_MATS = new Set(Object.values(WEAPON_MATERIALS).filter((v) => v >= 0));
const ARMOR_MATS = new Set(Object.entries(ARMOR_MATERIAL).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([, v]) => v));
/**
 * Whether one stack names an item that could exist, as problems at `at`.
 * @param {any} s @param {string} at @param {PoiProblem[]} out
 */
export function stackProblems(s, at, out) {
  const say = (/** @type {string} */ path, /** @type {string} */ code, /** @type {any} */ args = {}) => out.push({ path, code, ...args });
  if (!s || typeof s !== 'object' || !Number.isInteger(s.template) || !lawTemplate(s.template)) { say(`${at}.template`, 'item-template'); return; }
  const groups = templateGroups(s.template);
  const group = s.group === undefined ? groups[0] : s.group;
  if (!groups.includes(group)) { say(`${at}.group`, 'item-group'); return; }
  const mats = group === 'Weapons' ? WEAPON_MATS : group === 'Armor' ? ARMOR_MATS : null;
  if (mats && s.material !== undefined && !mats.has(s.material)) say(`${at}.material`, 'item-material');
  if (!mats && s.material !== undefined) say(`${at}.material`, 'item-material');
  if (s.count > 1 && !isStackable({ group, templateIndex: s.template })) say(`${at}.count`, 'item-stack');
  // a recipe names one of the game's potions, and only a potion (a Glass Bottle) carries one
  if (s.recipe !== undefined && (potionKeyOf(s.recipe) === null || group !== 'UselessItems1' || s.template !== GLASS_BOTTLE_TEMPLATE)) say(`${at}.recipe`, 'item-recipe');
}

/**
 * Every item stack a v2 document names, against the game's catalogues: trade requirements and rewards, interactive key
 * items, the stacks in conditions and the items events give or take. Run it after poiDocProblems finds nothing, so the shapes can be trusted.
 * @param {any} doc @returns {PoiProblem[]}
 */
export function poiTradeProblems(doc) {
  /** @type {PoiProblem[]} */
  const out = [];
  const tree = (/** @type {any} */ c, /** @type {string} */ at) => {
    if (!c || typeof c !== 'object') return;
    if (c.k === 'has_item') stackProblems(c.item, `${at}.item`, out);
    else if (Array.isArray(c.of)) c.of.forEach((/** @type {any} */ x, /** @type {number} */ i) => tree(x, `${at}.of[${i}]`));
  };
  (doc?.trades ?? []).forEach((/** @type {any} */ t, /** @type {number} */ i) => (t?.recipes ?? []).forEach((/** @type {any} */ r, /** @type {number} */ k) => {
    const at = `trades[${i}].recipes[${k}]`;
    (r?.requireItems ?? []).forEach((/** @type {any} */ s, /** @type {number} */ n) => stackProblems(s, `${at}.requireItems[${n}]`, out));
    (r?.rewardItems ?? []).forEach((/** @type {any} */ s, /** @type {number} */ n) => stackProblems(s, `${at}.rewardItems[${n}]`, out));
    tree(r?.when, `${at}.when`);
  }));
  (doc?.interactives ?? []).forEach((/** @type {any} */ o, /** @type {number} */ i) => { if (o?.keyItem) stackProblems(o.keyItem, `interactives[${i}].keyItem`, out); });
  const walk = (/** @type {any[] | undefined} */ rows, /** @type {string} */ name, /** @type {string} */ key) => rows?.forEach((r, i) => tree(r?.[key], `${name}[${i}].${key}`));
  walk(doc?.events, 'events', 'when');
  (doc?.events ?? []).forEach((/** @type {any} */ e, /** @type {number} */ i) => {
    for (const list of ['then', 'else']) (e?.[list] ?? []).forEach((/** @type {any} */ a, /** @type {number} */ k) => { if (a?.item) stackProblems(a.item, `events[${i}].${list}[${k}].item`, out); });
  });
  walk(doc?.npcs, 'npcs', 'showWhen');
  (doc?.dialogues ?? []).forEach((/** @type {any} */ d, /** @type {number} */ i) => (d?.nodes ?? []).forEach((/** @type {any} */ n, /** @type {number} */ k) => (n?.options ?? []).forEach((/** @type {any} */ o, /** @type {number} */ m) => tree(o?.when, `dialogues[${i}].nodes[${k}].options[${m}].when`))));
  return out;
}

/**
 * Validates encounter fields whose values the shape law leaves to this file (`pacifiable`, when given, must be a
 * boolean). Run this after poiDocProblems finds no shape problems.
 * @param {any} doc @returns {PoiProblem[]}
 */
export function poiEncounterProblems(doc) {
  /** @type {PoiProblem[]} */
  const out = [];
  (doc?.encounters ?? []).forEach((/** @type {any} */ e, /** @type {number} */ i) => {
    if (e?.pacifiable !== undefined && typeof e.pacifiable !== 'boolean') out.push({ path: `encounters[${i}].pacifiable`, code: 'pacifiable' });
  });
  return out;
}

/**
 * Every recipe, and every event whose branch the service settles (items, gold, or a kept variable moved), whose
 * condition reads a variable the service does not keep (`instance` or `event` scope): online the service refuses to
 * judge such a condition, so the recipe or the event could never run. Run it after poiDocProblems finds nothing.
 * @param {any} doc @returns {PoiProblem[]}
 */
export function poiSettleProblems(doc) {
  /** @type {PoiProblem[]} */
  const out = [];
  const vars = new Map((doc?.variables ?? []).map((/** @type {any} */ v) => [v?.key, v]));
  const read = (/** @type {any} */ c, /** @type {string} */ at) => {
    for (const k of varsRead(c)) if (!persists(vars.get(k))) out.push({ path: at, code: 'settle-var', key: k });
  };
  (doc?.trades ?? []).forEach((/** @type {any} */ t, /** @type {number} */ i) => (t?.recipes ?? []).forEach((/** @type {any} */ r, /** @type {number} */ k) => read(r?.when, `trades[${i}].recipes[${k}].when`)));
  (doc?.events ?? []).forEach((/** @type {any} */ e, /** @type {number} */ i) => {
    if (needsService(doc, e?.then ?? []) || needsService(doc, e?.else ?? [])) read(e?.when, `events[${i}].when`);
  });
  return out;
}

/**
 * The problems a save, a submission, and an approval are refused for, before the assets are looked at: `own` (the shape
 * law's, poiDocProblems), else what settlement would refuse. The service and the in-game editor say the same list.
 * @param {any} doc @param {PoiProblem[]} own @returns {PoiProblem[]}
 */
export const poiPayProblems = (doc, own) => (own.length ? own : [...poiTradeProblems(doc), ...poiSettleProblems(doc), ...poiEncounterProblems(doc)]);
