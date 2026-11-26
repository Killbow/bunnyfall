// @ts-check
import { LEAGUE_M } from '../../world/ethericSea.js';
import { naturalShot, shotId, shotGun, shotReach } from './shotKinds.js';

export const CAPTAIN_XP = Object.freeze({
  sunk: Object.freeze({ pirate: 40, merchant: 25, navy: 50, ether: 60, legend: 300 }),
  taken: Object.freeze({ pirate: 60, merchant: 40, navy: 75, ether: 90, legend: 400 }),
  repelled: 30, claimed: 20, contract: 50, league: 12, map: 40, island: 25, deep: 15,
  traded: 1,
});
export const TRADED_GOLD = 40;
export const CAPTAIN_LEVEL_MAX = 30;

const n0 = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
export function captainXpOf(log) {
  if (!log || typeof log !== 'object') return 0;
  let xp = 0;
  for (const [trade, w] of Object.entries(CAPTAIN_XP.sunk)) xp += n0(log.sunk?.[trade]) * w;
  for (const [trade, w] of Object.entries(CAPTAIN_XP.taken)) xp += n0(log.taken?.[trade]) * w;
  xp += n0(log.repelled) * CAPTAIN_XP.repelled + n0(log.claimed) * CAPTAIN_XP.claimed;
  for (const v of Object.values(log.contracts ?? {})) xp += n0(v) * CAPTAIN_XP.contract;
  xp += Math.floor(n0(log.sailed) / LEAGUE_M) * CAPTAIN_XP.league;
  xp += n0(log.maps) * CAPTAIN_XP.map + n0(log.islands) * CAPTAIN_XP.island + n0(log.deepest) * CAPTAIN_XP.deep;
  xp += Math.floor(n0(log.traded) / TRADED_GOLD) * CAPTAIN_XP.traded;
  return Math.floor(xp);
}
export const xpForLevel = (L) => (L <= 1 ? 0 : Math.round(100 * (L - 1) ** 1.6));
export function levelOf(xp) {
  let L = 1;
  while (L < CAPTAIN_LEVEL_MAX && n0(xp) >= xpForLevel(L + 1)) L++;
  return L;
}
export const starPoints = (level) => Math.max(0, Math.min(CAPTAIN_LEVEL_MAX, level | 0) - 1);
export function captainOf(log) {
  const xp = captainXpOf(log), level = levelOf(xp);
  return { xp, level, points: starPoints(level), next: level < CAPTAIN_LEVEL_MAX ? xpForLevel(level + 1) : null };
}

export const CAPTAIN_STATS = Object.freeze(['way', 'oars', 'turn', 'cargo', 'hull', 'repair', 'trade', 'harm', 'reload', 'aim', 'grape', 'chain', 'heated', 'boarders', 'reach']);

const RING = Object.freeze([150, 270, 390, 510, 640]);
const at = (deg, r) => { const a = (deg * Math.PI) / 180; return [Math.round(Math.sin(a) * r), Math.round(-Math.cos(a) * r)]; };
function path(sec, deg, stars, from = 'helm') {
  return stars.map(([id, kind, stats], i) => ({ id, sec, kind, stats: Object.freeze(stats), pos: at(deg, RING[i]), links: [i === 0 ? from : stars[i - 1][0]] }));
}
// Saved skies name stars by id, so a star keeps its id even when its stats change.
export const CAPTAIN_STARS = Object.freeze([
  { id: 'helm', sec: 'helm', kind: 'start', stats: Object.freeze({}), pos: [0, 0], links: [] },
  ...path('master', 225, [['m_way1', 'small', { way: 0.03 }], ['m_way2', 'small', { way: 0.03 }], ['m_clean', 'notable', { way: 0.06 }], ['m_way3', 'small', { way: 0.03 }], ['m_wind', 'keystone', { way: 0.12, oars: -0.12 }]]),
  ...path('master', 255, [['m_oar1', 'small', { oars: 0.05 }], ['m_turn1', 'small', { turn: 0.06 }], ['m_quick', 'notable', { turn: 0.12, oars: 0.05 }], ['m_oar2', 'small', { oars: 0.05 }]]),
  ...path('master', 285, [['m_hold1', 'small', { cargo: 0.06 }], ['m_hold2', 'small', { cargo: 0.06 }], ['m_deep', 'notable', { cargo: 0.12 }], ['m_trade1', 'small', { trade: 0.2 }], ['m_prince', 'keystone', { cargo: 0.25, trade: 0.3, harm: -0.1 }]]),
  ...path('master', 315, [['m_hull1', 'small', { hull: 0.04 }], ['m_rep1', 'small', { repair: 0.15 }], ['m_oak', 'notable', { hull: 0.08, repair: 0.1 }], ['m_hull2', 'small', { hull: 0.04 }], ['m_iron', 'keystone', { hull: 0.2, way: -0.08 }]]),
  ...path('commander', 45, [['c_rel1', 'small', { reload: 0.03 }], ['c_rel2', 'small', { reload: 0.03 }], ['c_drill', 'notable', { reload: 0.06 }], ['c_harm1', 'small', { harm: 0.04 }], ['c_line', 'keystone', { harm: 0.15, reload: -0.1 }]]),
  ...path('commander', 75, [['c_aim1', 'small', { aim: 0.06 }], ['c_aim2', 'small', { aim: 0.06 }], ['c_long', 'notable', { aim: 0.12 }], ['c_harm2', 'small', { harm: 0.04 }]]),
  ...path('commander', 105, [['c_shot1', 'small', { harm: 0.03 }]]),
  { id: 'c_grape', sec: 'commander', kind: 'notable', stats: Object.freeze({ grape: 0.3 }), pos: at(92, 290), links: ['c_shot1'] },
  { id: 'c_chain', sec: 'commander', kind: 'notable', stats: Object.freeze({ chain: 0.3 }), pos: at(118, 290), links: ['c_shot1'] },
  { id: 'c_hot', sec: 'commander', kind: 'notable', stats: Object.freeze({ heated: 0.5 }), pos: at(105, 430), links: ['c_grape'] },
  ...path('commander', 135, [['c_board1', 'small', { boarders: 1 }], ['c_ram1', 'small', { reach: 0.15 }], ['c_irons', 'notable', { reach: 0.25, boarders: 1 }], ['c_board2', 'small', { boarders: 1 }], ['c_creed', 'keystone', { boarders: 2, hull: -0.1 }]]),
].map((s) => Object.freeze({ ...s, pos: Object.freeze(s.pos) })));
export const CAPTAIN_CROSS = Object.freeze([['m_clean', 'm_quick'], ['m_quick', 'm_deep'], ['m_deep', 'm_oak'], ['c_drill', 'c_long'], ['c_long', 'c_grape'], ['c_chain', 'c_hot'], ['c_hot', 'c_irons']]);
const BY_ID = new Map(CAPTAIN_STARS.map((s) => [s.id, s]));
export const starOf = (id) => BY_ID.get(id) ?? null;
export const CAPTAIN_EDGES = Object.freeze([...CAPTAIN_STARS.flatMap((s) => s.links.map((l) => Object.freeze([l, s.id]))), ...CAPTAIN_CROSS.map((e) => Object.freeze([...e]))]);
const NEIGHBOURS = new Map(CAPTAIN_STARS.map((s) => [s.id, new Set()]));
for (const [a, b] of CAPTAIN_EDGES) { NEIGHBOURS.get(a).add(b); NEIGHBOURS.get(b).add(a); }
export const neighboursOf = (id) => [...(NEIGHBOURS.get(id) ?? [])];

export function heldStars(ids, points = Infinity) {
  const want = [];
  for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string' && id !== 'helm' && BY_ID.has(id) && !want.includes(id)) want.push(id);
  const out = ['helm'];
  const seen = new Set(out);
  for (let grew = true; grew && out.length - 1 < points;) {
    grew = false;
    for (const id of want) {
      if (out.length - 1 >= points) break;
      if (seen.has(id) || !neighboursOf(id).some((n) => seen.has(n))) continue;
      seen.add(id); out.push(id); grew = true;
    }
  }
  return out;
}
export function takeable(held, id, points) {
  const h = new Set(heldStars(held));
  return BY_ID.has(id) && !h.has(id) && neighboursOf(id).some((n) => h.has(n)) && h.size - 1 < points;
}
export function takesBack(held, id) {
  const h = new Set(heldStars(held));
  if (id === 'helm' || !h.has(id)) return [];
  h.delete(id);
  const reach = new Set(['helm']);
  const stack = ['helm'];
  while (stack.length) for (const n of neighboursOf(stack.pop())) if (h.has(n) && !reach.has(n)) { reach.add(n); stack.push(n); }
  return [id, ...[...h].filter((x) => !reach.has(x))];
}
export const refundable = (held, id) => takesBack(held, id).length === 1;
export function wayTo(held, id) {
  const h = new Set(heldStars(held));
  if (!BY_ID.has(id)) return null;
  if (h.has(id)) return [];
  const from = new Map();
  const queue = [...h];
  for (const q of queue) from.set(q, null);
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighboursOf(cur)) {
      if (from.has(n)) continue;
      from.set(n, cur);
      if (n === id) { const way = []; for (let x = n; x && !h.has(x); x = from.get(x)) way.unshift(x); return way; }
      queue.push(n);
    }
  }
  return null;
}
// Star stats scale ship numbers where they are read and are never written into the ship's record.
export function starStats(held) {
  const out = Object.fromEntries(CAPTAIN_STATS.map((k) => [k, 0]));
  for (const id of heldStars(held)) for (const [k, v] of Object.entries(starOf(id).stats)) out[k] = Math.round((out[k] + v) * 10000) / 10000;
  return Object.freeze(out);
}
export const statScale = (stats, key) => Math.max(0.1, 1 + (Number(stats?.[key]) || 0));

export const RELOAD_LEAST = 0.5;

export function captainRefit(refit, stats) {
  if (!refit) return refit;
  return {
    ...refit,
    cargo: refit.cargo * statScale(stats, 'cargo'), speed: refit.speed * statScale(stats, 'way'), hull: refit.hull * statScale(stats, 'hull'),
    guns: refit.guns * statScale(stats, 'harm'), oars: statScale(stats, 'oars'), turn: statScale(stats, 'turn'),
  };
}
export function captainWorth(worth, stats) {
  if (!stats) return worth;
  const n = (k) => Number(stats[k]) || 0;
  return { ...worth, reload: Math.max(RELOAD_LEAST, worth.reload * (1 - n('reload'))), mend: worth.mend * statScale(stats, 'repair'), hands: Math.max(0, worth.hands + Math.round(n('boarders'))) };
}
/**
 * @param {string} gunKind
 * @param {any} gun
 * @param {string | null} shot
 * @param {any} stats
 */
export function captainShot(gunKind, gun, shot, stats) {
  if (!gun || !stats || gunKind === 'barrel') return gun;
  const s = shot == null ? naturalShot(gunKind) : shotId(shot);
  if (s === 'grape' && stats.grape) return { ...gun, crew: gun.crew * statScale(stats, 'grape') };
  if (s === 'chain' && stats.chain) return { ...gun, sail: gun.sail * statScale(stats, 'chain') };
  if (s === 'heated' && stats.heated) return { ...gun, fireK: statScale(stats, 'heated') };
  return gun;
}
export function struckGun(gunKind, gun, shot, t, stats) {
  const g = captainShot(gunKind, shotGun(gunKind, gun, shot ?? null), shot ?? null, stats);
  if (!g) return null;
  const reach = shotReach(shot, t);
  return reach < 1 ? { ...g, crew: g.crew * reach } : g;
}
