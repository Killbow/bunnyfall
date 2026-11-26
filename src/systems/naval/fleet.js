// @ts-check
// The fleet ledger: every ship the player holds title to, by her UID. Deeds live in this book instead of the pack,
// and every rule that asks for a deed finds it here. A ship's location is never stored; it is read off the world.

import { mintDeed, BOAT_DEED_TEMPLATE, BOAT_PARTS_TEMPLATE } from './comeSailAwayItems.js';
import { HULL_NAMES, HULL_PRICES, VARIANT_NAMES, HULL_VARIANT_COUNTS } from './comeSailAwayBoat.js';
import { checkName, textCaught } from '../../net/nameFilter.js';
import { shipFlagOf } from './shipFlag.js';
import { liveryOf, LIVERY_PARTS, isPaint } from './shipLivery.js';
import { fittingsOf } from './deckFittings.js';
import { plateMetal } from '../../items/armorMaterials.js';
import { isLocked } from '../../items/itemLock.js';
import { isBound } from '../../items/itemBound.js';
import { isSummoned } from '../../items/inventory.js';
import { WEAPONS } from '../../characters/weapons.js';
import { t } from '../../ui/textManager.js';

export const FLEET_SAVE_VENDOR = 'Fleet';
export const FLEET_SAVE_VERSION = 1;
export const SHIP_NAME_MAX = 24;

export function shipNameVerdict(raw) {
  let s = '';
  for (const ch of String(raw ?? '')) { const c = ch.charCodeAt(0); if (c >= 32 && c <= 126) s += ch; }
  s = s.replace(/\s+/g, ' ').trim().slice(0, SHIP_NAME_MAX).trim();
  if (!s) return { ok: true, name: '', reason: null };
  const v = checkName(s);
  // The name filter reads a multi-word name as one word, so each word is checked too. The wire reader judges names
  // again with this.
  const caught = v.ok ? textCaught(s) : null;
  if (caught) return { ok: false, name: '', reason: `That name reads as "${caught}". Please pick another.` };
  return v.ok ? { ok: true, name: s, reason: null } : { ok: false, name: '', reason: v.reason ?? 'That name will not do.' };
}
export const shipLabel = (rec) => (rec?.name ? rec.name : `${HULL_NAMES[rec?.hull] ?? 'Boat'} '${VARIANT_NAMES[rec?.variant | 0] ?? 'I'}'`);

const metalStore = (label, metal, templates, hint) => Object.freeze({ label, templates: Object.freeze(templates), metal, get hint() { return hint(); } });
export const MATERIALS = Object.freeze({
  timber: Object.freeze({ label: 'Timber', hint: 'Wood Bundles (gathered with a Wood-Axe), planks or logs', templates: Object.freeze([1604, 645, 646, 647, 648, 649, 650, 651, 635, 636, 637, 638, 639, 640, 641]) }),
  iron: Object.freeze({ label: 'Iron', hint: 'Iron from an alchemist, or iron and steel ingots', templates: Object.freeze([71, 620, 621]) }),
  pitch: Object.freeze({ label: 'Pitch', hint: 'Pine Branches for their resin, or Resin itself', templates: Object.freeze([14, 653]) }),
  steel: metalStore('Steel', 1, [621], () => t('naval.ore.steel', 'Steel ingots, or a steel weapon or plate melted down')),
  silver: metalStore('Silver', 2, [622], () => t('naval.ore.silver', 'Silver ingots, or a silver weapon or plate melted down')),
  elven: metalStore('Elven', 3, [623], () => t('naval.ore.elven', 'Moonstone ingots, or an elven weapon or plate melted down')),
  dwarven: metalStore('Dwarven', 4, [624], () => t('naval.ore.dwarven', 'Dwarven ingots, or a dwarven weapon or plate melted down')),
  mithril: metalStore('Mithril', 5, [625], () => t('naval.ore.mithril', 'Mithril ingots, or a mithril weapon or plate melted down')),
  adamantium: metalStore('Adamantium', 6, [626], () => t('naval.ore.adamantium', 'Adamantium ingots, or an adamantium weapon or plate melted down')),
  ebony: metalStore('Ebony', 7, [627, 630], () => t('naval.ore.ebony', 'Ebony or Warforged Steel ingots, or an ebony weapon or plate melted down')),
  orcish: metalStore('Orcish', 8, [628], () => t('naval.ore.orcish', 'Orichalcum ingots, or an orcish weapon or plate melted down')),
  daedric: metalStore('Daedric', 9, [629], () => t('naval.ore.daedric', 'Daedric ingots, or a daedric weapon or plate melted down')),
});
export function refitMetalOf(item) {
  const m = item?.material;
  if (!Number.isInteger(m)) return null;
  if (item.group === 'Weapons') return item.templateIndex !== WEAPONS.Arrow && m >= 0 && m <= 9 ? m : null;
  return item.group === 'Armor' ? plateMetal(m) : null;
}
const listed = (v) => Array.isArray(v) && v.length > 0;
// Only plain pieces melt: the refit takes their metal without asking.
export const meltable = (item) => !!item && item.equipSlot == null && !isLocked(item) && !isBound(item) && !isSummoned(item) && !item.questItem
  && !item.artifact && !item.sigil && typeof item.provenance !== 'string'
  && !listed(item.enchantments) && !listed(item.customEnchantments)
  && !item.magic && (item.rarity == null || item.rarity === 'common') && !listed(item.affixes) && !item.legendary
  && item.socket == null && !listed(item.sockets);
const isOf = (item, kind) => { const m = MATERIALS[kind]; return !!m && !!item && (m.templates.includes(item.templateIndex) || (m.metal != null && refitMetalOf(item) === m.metal && meltable(item))); };
export const UPGRADE_LINES = Object.freeze([
  Object.freeze({ id: 'hold', label: 'Hold', what: 'More cargo before the ship slows', per: 0.2, effect: 'cargo', mats: Object.freeze(['timber', 'iron']), guns: false }),
  Object.freeze({ id: 'rigging', label: 'Rigging', what: 'Speed under sail', per: 0.04, effect: 'speed', mats: Object.freeze(['timber', 'pitch']), guns: false }),
  Object.freeze({ id: 'hull', label: 'Hull', what: 'Hull and sail strength', per: 0.1, effect: 'hull', mats: Object.freeze(['timber', 'pitch', 'iron']), guns: false }),
  Object.freeze({ id: 'guns', label: 'Guns', what: 'Broadside damage', per: 0.08, effect: 'guns', mats: Object.freeze(['iron', 'pitch']), guns: true }),
]);
export const BASE_TIERS = 3;
export const ORE_TIERS = Object.freeze([
  Object.freeze({ ore: 'steel', level: 3, gold: 6000, n: 4 }),
  Object.freeze({ ore: 'silver', level: 5, gold: 9000, n: 4 }),
  Object.freeze({ ore: 'elven', level: 8, gold: 13000, n: 5 }),
  Object.freeze({ ore: 'dwarven', level: 11, gold: 18000, n: 5 }),
  Object.freeze({ ore: 'mithril', level: 14, gold: 24000, n: 6 }),
  Object.freeze({ ore: 'adamantium', level: 17, gold: 32000, n: 6 }),
  Object.freeze({ ore: 'ebony', level: 20, gold: 42000, n: 7 }),
  Object.freeze({ ore: 'orcish', level: 24, gold: 55000, n: 7 }),
  Object.freeze({ ore: 'daedric', level: 28, gold: 70000, n: 8 }),
]);
export const ORE_PER = 0.5;
export const UPGRADE_TIERS = BASE_TIERS + ORE_TIERS.length;
export const REFIT_NUMERALS = Object.freeze(['-', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']);
export const TIER_GOLD = Object.freeze([600, 1500, 3500]);
export const TIER_MATS = Object.freeze([3, 6, 10]);
export const HULL_UPGRADE_SCALE = Object.freeze([0.5, 0.75, 1, 1.75, 2.5]);
const lineOf = (id) => UPGRADE_LINES.find((l) => l.id === id) ?? null;
const tierOf = (rec, id) => Math.max(0, Math.min(UPGRADE_TIERS, rec?.upgrades?.[id] | 0));
export function upgradeCost(hull, id, tier) {
  const line = lineOf(id);
  if (!line || !(tier >= 0 && tier < UPGRADE_TIERS)) return null;
  const k = HULL_UPGRADE_SCALE[hull] ?? 1;
  const n = (c) => Math.max(1, Math.round(c * k));
  if (tier < BASE_TIERS) return { gold: Math.round((TIER_GOLD[tier] * k) / 10) * 10, mats: line.mats.map((kind) => ({ kind, n: n(TIER_MATS[tier]) })), level: 1 };
  const ore = ORE_TIERS[tier - BASE_TIERS];
  return { gold: Math.round((ore.gold * k) / 10) * 10, mats: [{ kind: ore.ore, n: n(ore.n) }, { kind: line.mats[0], n: n(TIER_MATS[BASE_TIERS - 1]) }], level: ore.level };
}
export function refitShare(id, tier) {
  const t = Math.max(0, Math.min(UPGRADE_TIERS, tier | 0)), per = lineOf(id)?.per ?? 0;
  return Math.min(t, BASE_TIERS) * per + Math.max(0, t - BASE_TIERS) * per * ORE_PER;
}
export function refitOf(rec) {
  const at = (id) => Math.round((1 + refitShare(id, tierOf(rec, id))) * 10000) / 10000;
  return { cargo: at('hold'), speed: at('rigging'), hull: at('hull'), guns: at('guns') };
}
export const refitWords = (id, tier) => { const l = lineOf(id); return l ? `${l.label} ${REFIT_NUMERALS[tier] ?? tier}` : ''; };
export function materialCount(lists, kind) {
  let n = 0;
  for (const list of lists) for (const it of list ?? []) if (isOf(it, kind)) n += Math.max(1, it.stackCount | 0 || 1);
  return n;
}
export function meltCount(lists, kind, n) {
  const m = MATERIALS[kind];
  if (!m || m.metal == null) return 0;
  let ingots = 0;
  for (const list of lists) for (const it of list ?? []) if (it && m.templates.includes(it.templateIndex)) ingots += Math.max(1, it.stackCount | 0 || 1);
  return Math.max(0, Math.min(n, materialCount(lists, kind)) - ingots);
}
const lentTemplate = (kind, tpl) => Object.keys(MATERIALS).some((k) => k !== kind && MATERIALS[k].templates.includes(tpl));
// Stores no piece is melted for go first. A steel ingot counts for both Iron and Steel, so Iron takes one only
// when no other iron is at hand.
const takeOrder = (mats) => [...mats].sort((a, b) => Number(MATERIALS[a.kind]?.metal != null) - Number(MATERIALS[b.kind]?.metal != null));
export function materialsFor(lists, mats) {
  const copy = lists.map((l) => (l ?? []).map((it) => (it ? { ...it } : it)));
  return takeOrder(mats).every((m) => takeMaterials(copy, m.kind, m.n));
}
export function takeAllMaterials(lists, mats) {
  if (!materialsFor(lists, mats)) return false;
  for (const m of takeOrder(mats)) takeMaterials(lists, m.kind, m.n);
  return true;
}
export function meltCounts(lists, mats) {
  const copy = lists.map((l) => (l ?? []).map((it) => (it ? { ...it } : it)));
  const melt = new Map();
  for (const m of takeOrder(mats)) { melt.set(m, meltCount(copy, m.kind, m.n)); takeMaterials(copy, m.kind, m.n); }
  return mats.map((m) => melt.get(m) ?? 0);
}
export function takeMaterials(lists, kind, n) {
  if (materialCount(lists, kind) < n) return false;
  let left = n;
  const t = MATERIALS[kind].templates, lent = t.filter((tpl) => lentTemplate(kind, tpl)), own = t.filter((tpl) => !lent.includes(tpl));
  // Ingots go first across every list, a store's own before shared ones, and only then is a piece melted down.
  const ingots = [own, lent].filter((ts) => ts.length).map((ts) => (it) => !!it && ts.includes(it.templateIndex));
  for (const take of [...ingots, (it) => isOf(it, kind)]) for (const list of lists) {
    for (let i = 0; list && i < list.length && left > 0;) {
      const it = list[i];
      if (!take(it)) { i++; continue; }
      const have = Math.max(1, it.stackCount | 0 || 1);
      if (have > left) { it.stackCount = have - left; left = 0; break; }
      left -= have;
      list.splice(i, 1);
    }
  }
  return true;
}

// A ship bought on credit stays claimed (no refits) while her region's bank is owed anything. The due date is
// no mark of her loan, since later borrowing moves it.
export function loanOwed(rec, accounts) {
  const c = rec?.credit;
  if (!c || !Array.isArray(accounts)) return null;
  const a = accounts[c.region];
  if (!a || !(a.loanTotal > 0)) return null;
  return { region: c.region, owed: a.loanTotal };
}
export function settleCredit(accounts) {
  if (!Array.isArray(accounts)) return 0;
  let n = 0;
  for (const r of _ships.values()) if (r.credit && !(accounts[r.credit.region]?.loanTotal > 0)) { r.credit = null; n++; }
  return n;
}

const _ships = new Map();
const _book = [];
const upgradesBlank = () => ({ hold: 0, rigging: 0, hull: 0, guns: 0 });
const isUid = (v) => Number.isSafeInteger(v) && v > 0;
const _crossed = new Set();
const hullOk = (h) => Number.isInteger(h) && h >= 0 && h < HULL_NAMES.length;
// Spawning a hull throws on a variant it does not have.
const variantOk = (hull, v) => Number.isInteger(v) && v >= 0 && v < Math.max(1, HULL_VARIANT_COUNTS[hull] ?? 0);
export const FLEET_MAX = 256;
export const CROSSED_MAX = 4096;
// A ship that came into the realm through customs stays crossed for life, and no shipyard buys her.
export const fleetCrossed = (uid) => _crossed.has(uid);
/** @param {any} modData @param {any[][]} [itemLists] @param {any[]|null} [placedBoats] */
export function crossFleetData(modData, itemLists = [], placedBoats = null) {
  if (!modData || typeof modData !== 'object') return 0;
  const uids = new Set();
  for (const r of Array.isArray(modData[FLEET_SAVE_VENDOR]?.ships) ? modData[FLEET_SAVE_VENDOR].ships : []) if (isUid(r?.uid)) uids.add(r.uid);
  for (const b of Array.isArray(placedBoats) ? placedBoats : []) if (isUid(b?.UID)) uids.add(b.UID);
  for (const list of itemLists) {
    for (const it of Array.isArray(list) ? list : []) if ((it?.templateIndex === BOAT_DEED_TEMPLATE || it?.templateIndex === BOAT_PARTS_TEMPLATE) && isUid(it.UID)) uids.add(it.UID);
  }
  if (!uids.size) return 0;
  const rec = modData[FLEET_SAVE_VENDOR] && typeof modData[FLEET_SAVE_VENDOR] === 'object' ? modData[FLEET_SAVE_VENDOR] : (modData[FLEET_SAVE_VENDOR] = newFleetSaveData());
  const all = new Set((Array.isArray(rec.crossed) ? rec.crossed : []).filter(isUid));
  for (const u of uids) all.add(u);
  rec.crossed = [...all].slice(0, CROSSED_MAX);
  return uids.size;
}
export const SHIP_VALUE_MAX = 10000000;
const hullOfItem = (it) => Math.floor((it?.message | 0) / 10);
const variantOfItem = (it) => (it?.message | 0) % 10;

function recordFor(uid, hull, variant, value) {
  let r = _ships.get(uid);
  if (!r) {
    r = { uid, hull, variant, value: Number.isFinite(value) ? value : HULL_PRICES[hull] ?? 0, name: '', upgrades: upgradesBlank(), credit: null, port: null, colours: null, livery: null, cabin: 0, deck: [], plaque: false };
    _ships.set(uid, r);
  }
  return r;
}
export const fleetShip = (uid) => _ships.get(uid) ?? null;
export const fleetShips = () => [..._ships.values()];
export const fleetBook = () => _book;
export const titleOf = (uid) => _book.find((it) => it?.UID === uid) ?? null;
export function titleDeed(deed, { from = null, port = null } = {}) {
  if (deed?.templateIndex !== BOAT_DEED_TEMPLATE || !isUid(deed.UID) || !hullOk(hullOfItem(deed))) return null;
  if (from) { const i = from.indexOf(deed); if (i >= 0) from.splice(i, 1); }
  if (!titleOf(deed.UID)) _book.push(deed);
  const r = recordFor(deed.UID, hullOfItem(deed), variantOfItem(deed), deed.value);
  if (port) r.port = port;
  return r;
}
export function titleDeedsIn(pack, opts = {}) {
  let n = 0;
  // Never the deed a placing holds, or the placing could not spend it from the pack.
  for (const it of [...(pack ?? [])]) if (it?.templateIndex === BOAT_DEED_TEMPLATE && it !== opts.except && titleDeed(it, { ...opts, from: pack })) n++;
  return n;
}
export function knowShip(uid, hull, variant, value) {
  if (!isUid(uid) || !hullOk(hull)) return null;
  const r = recordFor(uid, hull, variantOk(hull, variant) ? variant : 0, value);
  if (r.hull === hull && variantOk(hull, variant) && r.variant !== variant) {
    r.variant = variant;
    const t = titleOf(uid);
    if (t) { const fresh = mintDeed(r.hull, variant, uid, t.value); t.message = fresh.message; t.name = fresh.name; }
  }
  return r;
}
export function forgetShip(uid) {
  _ships.delete(uid);
  const i = _book.findIndex((it) => it?.UID === uid);
  if (i >= 0) _book.splice(i, 1);
}
export function renameShip(uid, raw) {
  const r = _ships.get(uid);
  if (!r) return { ok: false, name: '', reason: 'No such ship of yours.' };
  const v = shipNameVerdict(raw);
  if (v.ok) { r.name = v.name; if (!r.name) r.plaque = false; }
  return v;
}
export function setShipColours(uid, raw) {
  const r = _ships.get(uid);
  if (!r) return false;
  const f = raw == null ? null : shipFlagOf(raw);
  if (raw != null && !f) return false;
  r.colours = f;
  return true;
}
export function setShipLivery(uid, raw) {
  const r = _ships.get(uid);
  if (!r || (raw != null && typeof raw !== 'object')) return false;
  const l = raw == null ? null : liveryOf(raw, r.hull);
  if (raw != null && !l && !LIVERY_PARTS.every((p) => !raw[p])) return false;
  r.livery = l;
  return true;
}
export function setShipCabin(uid, paint) {
  const r = _ships.get(uid);
  if (!r || !isPaint(paint)) return false;
  r.cabin = paint;
  return true;
}
export function setShipPlaque(uid, on) {
  const r = _ships.get(uid);
  if (!r || typeof on !== 'boolean' || (on && !r.name)) return false;
  r.plaque = on;
  return true;
}
export function setShipFittings(uid, raw) {
  const r = _ships.get(uid);
  if (!r || !Array.isArray(raw)) return false;
  r.deck = fittingsOf(raw);
  return true;
}
export function addRefit(uid, id) {
  const r = _ships.get(uid);
  if (!r || !lineOf(id) || tierOf(r, id) >= UPGRADE_TIERS) return false;
  r.upgrades[id] = tierOf(r, id) + 1;
  return true;
}
export function setShipPort(uid, port) { const r = _ships.get(uid); if (r) r.port = port ? { name: String(port.name ?? ''), ...(port.ether ? { ether: true } : {}) } : null; }
export function retitle(uid) {
  const r = _ships.get(uid);
  if (!r || titleOf(uid)) return titleOf(uid);
  const d = mintDeed(r.hull, r.variant, uid, r.value);
  _book.push(d);
  return d;
}

export function newFleetSaveData() { return { v: FLEET_SAVE_VERSION, ships: [], crossed: [] }; }
export function fleetSaveData() {
  return {
    v: FLEET_SAVE_VERSION,
    ships: [..._ships.values()].map((r) => ({ uid: r.uid, hull: r.hull, variant: r.variant, value: r.value, name: r.name, upgrades: { ...r.upgrades },
      credit: r.credit ? { ...r.credit } : null, port: r.port ? { ...r.port } : null, title: !!titleOf(r.uid), ...(r.colours ? { colours: { ...r.colours } } : {}), ...(r.livery ? { livery: { ...r.livery } } : {}), ...(r.cabin ? { cabin: r.cabin } : {}), ...(r.deck?.length ? { deck: r.deck.map((f) => ({ ...f })) } : {}), ...(r.plaque ? { plaque: true } : {}) })),
    crossed: [..._crossed],
  };
}
export function restoreFleetSaveData(data) {
  _ships.clear();
  _book.length = 0;
  _crossed.clear();
  for (const u of (Array.isArray(data?.crossed) ? data.crossed : []).slice(0, CROSSED_MAX)) if (isUid(u)) _crossed.add(u);
  // A save may be hand-made or from a newer build, so every field is checked as it is read.
  for (const s of (Array.isArray(data?.ships) ? data.ships : []).slice(0, FLEET_MAX)) {
    if (!s || !isUid(s.uid) || !hullOk(s.hull) || _ships.has(s.uid)) continue;
    const variant = variantOk(s.hull, s.variant) ? s.variant : 0;
    const r = recordFor(s.uid, s.hull, variant, Number.isFinite(s.value) ? Math.max(0, Math.min(SHIP_VALUE_MAX, s.value)) : undefined);
    const v = shipNameVerdict(s.name);
    r.name = v.ok ? v.name : '';
    for (const l of UPGRADE_LINES) r.upgrades[l.id] = Math.max(0, Math.min(UPGRADE_TIERS, Number(s.upgrades?.[l.id]) | 0));
    r.credit = s.credit && Number.isInteger(s.credit.region) && s.credit.region >= 0 ? { region: s.credit.region, due: Number.isFinite(s.credit.due) ? s.credit.due : 0 } : null;
    const port = typeof s.port?.name === 'string' ? printable(s.port.name).slice(0, 64) : '';
    r.port = s.port && typeof s.port.name === 'string' ? { name: port, ...(s.port.ether === true ? { ether: true } : {}) } : null;
    r.colours = shipFlagOf(s.colours);
    r.livery = liveryOf(s.livery, r.hull);
    r.cabin = isPaint(s.cabin) ? s.cabin : 0;
    r.deck = fittingsOf(s.deck);
    r.plaque = s.plaque === true && !!r.name;
    if (s.title) _book.push(mintDeed(r.hull, r.variant, r.uid, r.value));
  }
}
const printable = (raw) => { let t = ''; for (const ch of String(raw ?? '')) { const c = ch.charCodeAt(0); if (c >= 32 && c <= 126) t += ch; else if (/\s/.test(ch)) t += ' '; } return t.replace(/\s+/g, ' ').trim(); };
export const fleetSaveSlot = Object.freeze({ newSaveData: newFleetSaveData, getSaveData: fleetSaveData, restoreSaveData: restoreFleetSaveData });
export function _resetFleetForTests() { _ships.clear(); _book.length = 0; _crossed.clear(); }
export { BOAT_DEED_TEMPLATE, BOAT_PARTS_TEMPLATE };
