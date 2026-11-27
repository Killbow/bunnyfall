// @ts-check
import { appStorage } from '../platform/appStorage.js';
import { FRIEND_CSS } from '../net/social.js';

export const TV_FILTER_GROUPS = Object.freeze(['towns', 'distant', 'dungeons', 'enemies', 'travellers', 'gathering']);
export const TV_FILTER_STORE_KEY = 'dfjs.overworld.filters';

export const TV_FILTER_TEXT = Object.freeze({
  title: 'Show',
  towns: 'Towns',
  distant: 'Distant',
  dungeons: 'Dungeons',
  enemies: 'Enemies',
  travellers: 'Travellers',
  gathering: 'Gathering',
  tip: (label, on) => `${on ? 'Hide' : 'Show'} ${label.toLowerCase()} on the overworld`,
});

/** @param {string} kind */
export function markGroup(kind = '') {
  const words = String(kind).split(' ');
  const k = words[0];
  // A mark giving chase is never filtered, so a threat closing on the player always stays on screen.
  if (words.includes('chase')) return null;
  if (k === 'place' && words.includes('dungeon')) return 'dungeons';
  if (k === 'place' || k === 'yard') return 'towns';
  if (k === 'far') return words.includes('dungeon') ? 'dungeons' : 'distant';
  if (k === 'lair') return 'dungeons';
  if (k === 'band' || k === 'camp' || k === 'raider') return 'enemies';
  if (k === 'traveller' || k === 'wayfarer') return 'travellers';
  if (k === 'gather') return 'gathering';
  return null;
}

let shown = null;
const listeners = new Set();

function read() {
  const all = Object.fromEntries(TV_FILTER_GROUPS.map((g) => [g, true]));
  let raw = null;
  try { raw = appStorage()?.getItem(TV_FILTER_STORE_KEY) ?? null; } catch { raw = null; }
  if (raw) {
    try {
      const v = JSON.parse(raw);
      for (const g of TV_FILTER_GROUPS) if (typeof v?.[g] === 'boolean') all[g] = v[g];
    } catch { }
  }
  return all;
}

export function travelViewFilters() {
  shown ??= read();
  return shown;
}

export function toggleTravelViewFilter(group) {
  if (!TV_FILTER_GROUPS.includes(group)) return false;
  const next = { ...travelViewFilters(), [group]: !travelViewFilters()[group] };
  shown = next;
  try { appStorage()?.setItem(TV_FILTER_STORE_KEY, JSON.stringify(next)); } catch { }
  for (const fn of [...listeners]) { try { fn(next); } catch { } }
  return next[group];
}

export const playersOnMaps = (f = travelViewFilters()) => f.travellers !== false;

export function onTravelViewFilters(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const TV_WHO_STORE_KEY = 'dfjs.overworld.who';
export const TV_WHO_GROUPS = Object.freeze(['friends', 'guild', 'others']);
export const TV_RENOWN_STEPS = Object.freeze([0, 5, 10, 20, 40]);
export const TV_NODE_KM_STEPS = Object.freeze([null, 0.5, 1, 2]);
export const TV_WHO_TEXT = Object.freeze({
  title: 'Players',
  friends: 'Friends',
  guild: 'Guild',
  others: 'Others',
  renown: (n) => (n > 0 ? `Renown ${n}+` : 'Any renown'),
  nodeKm: (km) => (km == null ? 'Nodes: any km' : `Nodes: ${km} km`),
  tip: (label, on) => `${on ? 'Hide' : 'Show'} ${label.toLowerCase()} on the maps`,
  renownTip: 'Shows players with at least this Renown. Click for the next',
  all: (on) => (on ? 'Shown' : 'Hidden'),
  allTip: (on) => `${on ? 'Hide' : 'Show'} other players on the maps`,
  nodeTip: 'Shows gathering groups up to this distance. Click for the next',
});
export const TV_KIN_COLORS = Object.freeze({
  friend: FRIEND_CSS,
  guild: '#c9a6ff',
});
export const TV_KIN_LEGEND = Object.freeze({ friend: 'Friend', guild: 'Guild-mate' });
const WHO_DEFAULT = Object.freeze({ friends: true, guild: true, others: true, renown: 0, nodeKm: null });
let who = null;

function readWho() {
  const w = { ...WHO_DEFAULT };
  let raw = null;
  try { raw = appStorage()?.getItem(TV_WHO_STORE_KEY) ?? null; } catch { raw = null; }
  if (raw) {
    try {
      const v = JSON.parse(raw);
      for (const g of TV_WHO_GROUPS) if (typeof v?.[g] === 'boolean') w[g] = v[g];
      if (TV_RENOWN_STEPS.includes(v?.renown)) w.renown = v.renown;
      if (TV_NODE_KM_STEPS.includes(v?.nodeKm ?? null)) w.nodeKm = v?.nodeKm ?? null;
    } catch { }
  }
  return w;
}
export function travelViewWho() {
  who ??= readWho();
  return who;
}
function setWho(next) {
  who = next;
  try { appStorage()?.setItem(TV_WHO_STORE_KEY, JSON.stringify(next)); } catch { }
  for (const fn of [...listeners]) { try { fn(travelViewFilters()); } catch { } }
  return next;
}
export function toggleTravelViewWho(group) {
  if (!TV_WHO_GROUPS.includes(group)) return false;
  return setWho({ ...travelViewWho(), [group]: !travelViewWho()[group] })[group];
}
export function cycleTravelViewRenown() {
  const at = TV_RENOWN_STEPS.indexOf(travelViewWho().renown);
  return setWho({ ...travelViewWho(), renown: TV_RENOWN_STEPS[(at + 1) % TV_RENOWN_STEPS.length] }).renown;
}
export function cycleTravelViewNodeKm() {
  const at = TV_NODE_KM_STEPS.indexOf(travelViewWho().nodeKm);
  return setWho({ ...travelViewWho(), nodeKm: TV_NODE_KM_STEPS[(at + 1) % TV_NODE_KM_STEPS.length] }).nodeKm;
}
/**
 * @param {{ friend?: boolean, gt?: string | null } | null | undefined} p
 * @param {string | null} [myTag]
 */
export function travellerKin(p, myTag = null) {
  if (p?.friend) return 'friend';
  if (myTag && p?.gt && String(p.gt).toUpperCase() === String(myTag).toUpperCase()) return 'guild';
  return null;
}
/** @param {{ kin?: string | null, lv?: number | null } | null | undefined} p */
export function playerShown(p, w = travelViewWho()) {
  const g = p?.kin === 'friend' ? 'friends' : p?.kin === 'guild' ? 'guild' : 'others';
  if (w[g] === false) return false;
  return !(w.renown > 0) || (Number(p?.lv) || 0) >= w.renown;
}

export function markShown(m, f = travelViewFilters(), w = travelViewWho()) {
  const g = markGroup(m?.kind);
  if (g != null && f[g] === false) return false;
  if (g === 'travellers' && !playerShown(m, w)) return false;
  if (g === 'gathering' && w.nodeKm != null && Number.isFinite(m?.dist) && m.dist > w.nodeKm) return false;
  return true;
}

export const isYardMark = (m) => String(m?.kind ?? '').split(' ')[0] === 'yard';
export function countGroups(marks) {
  const n = Object.fromEntries(TV_FILTER_GROUPS.map((g) => [g, 0]));
  for (const m of marks ?? []) { const g = markGroup(m?.kind); if (g && !isYardMark(m)) n[g] += 1; }
  return n;
}

export function _resetTravelViewFilters() { shown = null; who = null; listeners.clear(); }
