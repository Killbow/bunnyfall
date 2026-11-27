// @ts-check

import { lawTemplate, templateGroups } from '../items/itemLaw.js';
import { isStackable, GLASS_BOTTLE_TEMPLATE } from '../items/inventory.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { varsRead, persists, needsService } from './poiDmCore.js';
import { potionKeyOf } from './poiSettle.js';

/** @typedef {import('./poiLaw.js').PoiProblem} PoiProblem */

const WEAPON_MATS = new Set(Object.values(WEAPON_MATERIALS).filter((v) => v >= 0));
const ARMOR_MATS = new Set(Object.entries(ARMOR_MATERIAL).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([, v]) => v));
/**
 * @param {any} s
 * @param {string} at
 * @param {PoiProblem[]} out
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
  if (s.recipe !== undefined && (potionKeyOf(s.recipe) === null || group !== 'UselessItems1' || s.template !== GLASS_BOTTLE_TEMPLATE)) say(`${at}.recipe`, 'item-recipe');
}

/**
 * @param {any} doc
 * @returns {PoiProblem[]}
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
 * @param {any} doc
 * @returns {PoiProblem[]}
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
 * @param {any} doc
 * @returns {PoiProblem[]}
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
 * @param {any} doc
 * @param {PoiProblem[]} own
 * @returns {PoiProblem[]}
 */
export const poiPayProblems = (doc, own) => (own.length ? own : [...poiTradeProblems(doc), ...poiSettleProblems(doc), ...poiEncounterProblems(doc)]);
