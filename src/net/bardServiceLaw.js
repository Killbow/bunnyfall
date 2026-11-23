// @ts-check
// BARDS' GUILD SERVICES, paid in Favor Tokens (the Favor shop's coin, net/tavernFavorLaw.js). The one law both ends read:
// the client's window shows the prices and cleans the words, the account service (server-account/src/bardServices.js)
// charges the Favor and writes the result. Pure: no DOM, no network, no clock.
//
//   item-name   rename a piece of the pack: the name rides the record (`bardName`) and shows wherever the piece is named
//   item-buff   write a flourish for a piece: a name and a line of text (`bardBuff`), shown on the piece's card
//   home-name   rename a home you own: its door's plate says the new name (`homes.title`)
//
// A BARD'S BUFF IS COSMETIC. It changes no stat, no spell, no enchantment: it is words on the item's card, so it can
// carry no balance risk. Every window that offers it says so.
import { textCaught } from './nameFilter.js';
import { BOAT_TEMPLATES } from './realmTradeLaw.js';

/** Favor Tokens each service costs. A song minute or a finished shift earns one (tavernFavorLaw songFavor). */
export const BARD_SERVICE_PRICES = Object.freeze({ 'item-name': 10, 'item-buff': 30, 'home-name': 25 });
/** Every service's op word. */
export const BARD_SERVICE_OPS = Object.freeze(Object.keys(BARD_SERVICE_PRICES));
export const bardServicePrice = (/** @type {unknown} */ op) => (typeof op === 'string' && Object.hasOwn(BARD_SERVICE_PRICES, op) ? BARD_SERVICE_PRICES[/** @type {keyof typeof BARD_SERVICE_PRICES} */ (op)] : null);

/** The longest an item's custom name, a buff's name, a buff's text and a home's name may be. */
export const BARD_ITEM_NAME_MAX = 40;
export const BARD_BUFF_NAME_MAX = 32;
export const BARD_BUFF_TEXT_MAX = 120;
export const BARD_HOME_NAME_MAX = 40;
/** The words said where the buff is offered. */
export const BARD_BUFF_COSMETIC_TEXT = 'A flourish is for show only: it changes no stat, spell or enchantment. It is words on the item\'s card.';

const lineOf = (/** @type {unknown} */ raw, /** @type {number} */ max) => {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠﻿]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
/** @param {unknown} raw @param {number} max @returns {{ text: string } | { error: string, word?: string }} */
function cleanLine(raw, max) {
  const s = lineOf(raw, max);
  if (!s) return { error: 'bard-text' };
  const word = textCaught(s);   // net/nameFilter.js: a player's words, as a name or a chat line meets them
  return word ? { error: 'bard-text-filtered', word } : { text: s };
}

/** An item's custom name as kept: trimmed, one line, within the bound, and passing the name filter - or `{ error }`. */
export const bardItemNameOf = (/** @type {unknown} */ raw) => cleanLine(raw, BARD_ITEM_NAME_MAX);
/** A home's new name as kept, likewise. */
export const bardHomeNameOf = (/** @type {unknown} */ raw) => cleanLine(raw, BARD_HOME_NAME_MAX);
/** A buff as kept - `{ name, text }` - or `{ error }`. */
export function bardBuffOf(/** @type {any} */ raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'bard-text' };
  const name = cleanLine(raw.name, BARD_BUFF_NAME_MAX);
  if ('error' in name) return name;
  const text = cleanLine(raw.text, BARD_BUFF_TEXT_MAX);
  if ('error' in text) return text;
  return { buff: { name: name.text, text: text.text } };
}

/** The item field `bardBuff` as a record may carry it (declared in systems/item/itemFields.js). */
export const validBardBuffField = (/** @type {any} */ v) => !!v && typeof v === 'object' && !Array.isArray(v)
  && typeof v.name === 'string' && v.name.length > 0 && v.name.length <= BARD_BUFF_NAME_MAX
  && typeof v.text === 'string' && v.text.length > 0 && v.text.length <= BARD_BUFF_TEXT_MAX;

/** Whether the Guild will write on a record: not coin, a quest's, a summoned one or a boat's. Both ends ask it. */
export function bardWritable(/** @type {any} */ rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !Number.isSafeInteger(rec.templateIndex)) return false;
  if (rec.group === 'Currency' || rec.questItem || (rec.timeForItemToDisappear ?? 0) !== 0) return false;
  return !BOAT_TEMPLATES.includes(rec.templateIndex);
}

/** The card line a buff makes. */
export const bardBuffLine = (/** @type {any} */ item) => (validBardBuffField(item?.bardBuff) ? `${item.bardBuff.name}: ${item.bardBuff.text}` : null);

