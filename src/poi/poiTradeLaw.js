// @ts-check

// What an item named by a POI trade, key or condition must be, checked against the game's own item law.
// poiLawV2.js checks a stack's shape: a template number, a group name, a material, a count, some enchantments. This file
// asks the game's catalogues whether that stack could exist, in the terms the server uses when it mints a reward
// (server-account/src/staffGive.js mintGift). The server still mints the piece and runs the item law over it at
// settlement; this check lets the editor and the approval step refuse what settlement would refuse.
// Everything imported here lives under src/, so the account service, the editor and an offline game can all load it.

import { lawTemplate, templateGroups } from '../systems/item/itemLaw.js';
import { isStackable } from '../systems/inventory.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../systems/armorMaterials.js';
import { pickEnchantment } from '../systems/enchantmentCatalogue.js';
import { MAX_ENCHANTMENTS } from '../systems/enchanting.js';

/** @typedef {import('./poiLaw.js').PoiProblem} PoiProblem */

/** The material numbers a weapon or a piece of armour may be made of, as the item maker takes them. */
const WEAPON_MATS = new Set(Object.values(WEAPON_MATERIALS).filter((v) => v >= 0));
const ARMOR_MATS = new Set(Object.entries(ARMOR_MATERIAL).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([, v]) => v));
/** The most enchantments one rewarded piece may carry: the item maker's limit and one more for a bound soul. */
export const POI_TRADE_ENCHANT_MAX = MAX_ENCHANTMENTS + 1;

/**
 * Whether one stack names an item that could exist, as problems at `at`. `reward` stacks may carry enchantments.
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
  if (Array.isArray(s.enchant)) {
    if (s.enchant.length > POI_TRADE_ENCHANT_MAX) say(`${at}.enchant`, 'enchants', { max: POI_TRADE_ENCHANT_MAX });
    s.enchant.forEach((/** @type {any} */ e, /** @type {number} */ i) => {
      const pick = typeof e?.key === 'string' ? pickEnchantment(e.key, e.param) : null;
      if (!pick || pick.kind !== 'add') say(`${at}.enchant[${i}]`, 'item-enchant');
    });
  }
}

/**
 * Every item stack a v2 document names, against the game's catalogues: trade requirements and rewards, interactive key
 * items and the stacks in conditions. Run it after poiDocProblems finds nothing, so the shapes can be trusted.
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
  const walk = (/** @type {any[] | undefined} */ rows, /** @type {string} */ name, /** @type {(row: any) => any} */ pick) => rows?.forEach((r, i) => tree(pick(r), `${name}[${i}]`));
  walk(doc?.events, 'events', (e) => e?.when);
  walk(doc?.npcs, 'npcs', (n) => n?.showWhen);
  (doc?.dialogues ?? []).forEach((/** @type {any} */ d, /** @type {number} */ i) => (d?.nodes ?? []).forEach((/** @type {any} */ n, /** @type {number} */ k) => (n?.options ?? []).forEach((/** @type {any} */ o, /** @type {number} */ m) => tree(o?.when, `dialogues[${i}].nodes[${k}].options[${m}].when`))));
  return out;
}
