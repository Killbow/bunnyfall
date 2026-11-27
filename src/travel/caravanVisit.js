// @ts-check
// Entry codes are HOME_ENTRIES indices sent as `we` (absent for private), with the owner's guild tag as `wg`;
// src/travel/horseCartWire.js and net/wire.js validParkData read the same codes. Visitors receive placed and
// removed room pieces, never storage contents.
import { HOME_ENTRIES, HOME_ENTRY_DEFAULT, homeEntryOk, homeMayEnter } from '../net/homeLaw.js';
import { GUILD_TAG_RE } from '../net/guildLaw.js';
import { decorPieceOf, DECOR_CAP, DECOR_BASE_KEY_RE, DECOR_HIDDEN_CAP } from '../net/decorLaw.js';
import { MAX_FRAME_BYTES } from '../net/wire.js';
import { activeWagonItem, wagonKindOf, isWagonItem } from './wagonKinds.js';

export const caravanEntryCode = (entry) => Math.max(0, HOME_ENTRIES.indexOf(homeEntryOk(entry) ? entry : HOME_ENTRY_DEFAULT));
export const caravanEntryOfCode = (code) => (Number.isInteger(code) && code > 0 && code < HOME_ENTRIES.length ? HOME_ENTRIES[code] : HOME_ENTRY_DEFAULT);
export const CARAVAN_GUILD_CODE = HOME_ENTRIES.indexOf('guild');
export const caravanGuildTag = (tag) => (typeof tag === 'string' && GUILD_TAG_RE.test(tag) ? tag : null);

export const caravanEntryOf = (item) => (isWagonItem(item) && wagonKindOf(item) === 'caravan' && homeEntryOk(item.wagonEntry) ? item.wagonEntry : HOME_ENTRY_DEFAULT);

export function setDrivenCaravanEntry(items, entry) {
  const item = activeWagonItem(items);
  if (!item || !Array.isArray(items) || wagonKindOf(item) !== 'caravan' || !homeEntryOk(entry)) return null;
  const { wagonEntry: _drop, ...rest } = item;
  items[items.indexOf(item)] = entry === HOME_ENTRY_DEFAULT ? rest : { ...rest, wagonEntry: entry };
  return entry;
}

export function caravanMayEnter(t, { partyNames = [], guild = null } = {}) {
  if (!t || typeof t.owner !== 'string' || !t.owner) return false;
  const tag = caravanGuildTag(guild);
  return homeMayEnter({ owner: t.owner, entry: t.entry, guildmate: !!tag && caravanGuildTag(t.guild) === tag }, { partyNames });
}

export const CARAVAN_VISIT_TEXT = Object.freeze({
  entryRow: (words) => `Who may enter: ${words}`,
  entryLine: (words) => `Who may enter your caravan: ${words}.`,
  shut: (owner) => `This is ${owner}'s caravan. Its door is shut.`,
  gone: 'The caravan has moved on. You step outside.',
  closed: (owner) => `${owner} has shut the caravan's door. You step outside.`,
});

export const CARAVAN_DECOR_V = 1;
export const CARAVAN_DECOR_BYTES = MAX_FRAME_BYTES - 512;

const caravanHiddenOf = (raw) => [...new Set((Array.isArray(raw) ? raw : []).filter((k) => typeof k === 'string' && DECOR_BASE_KEY_RE.test(k)))].slice(0, DECOR_HIDDEN_CAP);

// `hidden` is counted first, so the list of removed room pieces always fits before any placed piece.
export function caravanDecorDoc(pieces, hidden = []) {
  const p = [];
  const h = caravanHiddenOf(hidden);
  let bytes = 32 + JSON.stringify(h).length;
  for (const raw of Array.isArray(pieces) ? pieces : []) {
    if (p.length >= DECOR_CAP) break;
    const piece = decorPieceOf(raw);
    if (!piece) continue;
    const n = JSON.stringify(piece).length + 1;
    if (bytes + n > CARAVAN_DECOR_BYTES) break;
    bytes += n;
    p.push(piece);
  }
  return { v: CARAVAN_DECOR_V, p, h };
}
export function readCaravanDecor(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.v !== CARAVAN_DECOR_V || !Array.isArray(doc.p)) return null;
  return doc.p.slice(0, DECOR_CAP).map(decorPieceOf).filter(Boolean);
}
export function readCaravanHidden(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.v !== CARAVAN_DECOR_V) return [];
  return caravanHiddenOf(doc.h);
}
