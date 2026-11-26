// @ts-check
// A sworn revenant's star sky. Points come from its level, earned at the player's side, and from its rank when sworn;
// a star is bought only beside one already held. A hostile revenant has no oath, so its stars do nothing.

// Errands pay XP only below ERRAND_LEVEL_MOST, because offline rest carries errands on and would farm levels.
export const RVN_XP = Object.freeze({ WON: 5, WON_PER: 1, WON_LEVEL_MOST: 30, ERRAND: 15, HARD_SHARE: 0.5, ERRAND_LEVEL_MOST: 10 });
export const RVN_LEVEL_MAX = 20;

const n0 = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
export const rvnXpWon = (foeLevel) => RVN_XP.WON + RVN_XP.WON_PER * Math.min(RVN_XP.WON_LEVEL_MOST, Math.max(1, Math.floor(n0(foeLevel)) || 1));
export const rvnXpErrand = (place, won, road = 0) => Math.floor(RVN_XP.ERRAND * n0(place?.days) * (1 - (Number(road) || 0)) * n0(place?.danger) * (won ? 1 : RVN_XP.HARD_SHARE));
export const rvnXpForLevel = (L) => (L <= 1 ? 0 : Math.round(75 * (L - 1) ** 1.7));
// Caps saved XP, so a hand-edited huge value cannot wrap past 2^31 at the next win.
export const RVN_XP_MOST = rvnXpForLevel(RVN_LEVEL_MAX);
export const rvnXpOf = (v) => Math.min(RVN_XP_MOST, Math.floor(n0(Number(v))));
export function rvnLevelOf(xp) {
  let L = 1;
  while (L < RVN_LEVEL_MAX && n0(xp) >= rvnXpForLevel(L + 1)) L++;
  return L;
}
export const rvnStarPoints = (level, rank) => Math.max(0, Math.min(RVN_LEVEL_MAX, level | 0) - 1) + Math.max(0, Math.min(5, rank | 0) - 1);
export function rvnStarsOf(r) {
  const xp = rvnXpOf(r?.companion?.xp), level = rvnLevelOf(xp);
  const held = Array.isArray(r?.companion?.stars) ? r.companion.stars : ['oath'];
  return { xp, level, points: rvnStarPoints(level, r?.rank ?? 1), next: level < RVN_LEVEL_MAX ? rvnXpForLevel(level + 1) : null, set: Math.max(0, held.length - 1) };
}

export const RVN_STAR_STATS = Object.freeze(['health', 'blows', 'art', 'haste', 'awaken', 'odds', 'haul', 'road', 'bold', 'loyal', 'rest']);
export const RVN_STAR_MOST = Object.freeze({ health: 0.5, blows: 0.4, art: 0.4, haste: 0.25, awaken: 1, odds: 0.5, haul: 0.4, road: 0.15, bold: 1, loyal: 0.5, rest: 0.5 });

const RING = Object.freeze([150, 270, 390, 510, 640]);
const at = (deg, r) => { const a = (deg * Math.PI) / 180; return [Math.round(Math.sin(a) * r), Math.round(-Math.cos(a) * r)]; };
function path(sec, deg, stars) {
  return stars.map(([id, kind, stats], i) => ({ id, sec, kind, stats: Object.freeze(stats), pos: at(deg, RING[i]), links: [i === 0 ? 'oath' : stars[i - 1][0]] }));
}
export const RVN_STARS = Object.freeze([
  { id: 'oath', sec: 'oath', kind: 'start', stats: Object.freeze({}), pos: [0, 0], links: [] },
  ...path('blade', 330, [['b_hp1', 'small', { health: 0.05 }], ['b_hp2', 'small', { health: 0.05 }], ['b_iron', 'notable', { health: 0.1 }], ['b_hp3', 'small', { health: 0.05 }], ['b_deathless', 'keystone', { health: 0.25, blows: -0.1 }]]),
  ...path('blade', 30, [['b_bl1', 'small', { blows: 0.04 }], ['b_bl2', 'small', { blows: 0.04 }], ['b_relent', 'notable', { blows: 0.08 }], ['b_bl3', 'small', { blows: 0.04 }], ['b_rage', 'keystone', { blows: 0.2, health: -0.1 }]]),
  ...path('grave', 90, [['g_pow1', 'small', { art: 0.05 }], ['g_pow2', 'small', { art: 0.05 }], ['g_focus', 'notable', { art: 0.1 }], ['g_pow3', 'small', { art: 0.05 }], ['g_pact', 'keystone', { art: 0.15, health: -0.1 }]]),
  ...path('grave', 150, [['g_hst1', 'small', { haste: 0.05 }], ['g_hst2', 'small', { haste: 0.05 }], ['g_rite', 'notable', { haste: 0.1 }], ['g_hst3', 'small', { haste: 0.05 }]]),
  { id: 'g_wake', sec: 'grave', kind: 'notable', stats: Object.freeze({ awaken: 1 }), pos: at(120, 470), links: ['g_focus', 'g_rite'] },
  ...path('road', 210, [['r_odd1', 'small', { odds: 0.3 }], ['r_haul1', 'small', { haul: 0.05 }], ['r_far', 'notable', { road: 0.15, odds: 0.2 }], ['r_haul2', 'small', { haul: 0.05 }], ['r_fortune', 'keystone', { haul: 0.3, bold: 1 }]]),
  ...path('road', 270, [['r_loy1', 'small', { loyal: 0.1 }], ['r_rest1', 'small', { rest: 0.1 }], ['r_bound', 'notable', { loyal: 0.2 }], ['r_rest2', 'small', { rest: 0.1 }], ['r_vigil', 'keystone', { rest: 0.3, loyal: 0.2, road: -0.1 }]]),
].map((s) => Object.freeze({ ...s, pos: Object.freeze(s.pos), links: Object.freeze(s.links) })));
export const RVN_STAR_CROSS = Object.freeze([['b_iron', 'b_relent'], ['b_relent', 'g_focus'], ['g_rite', 'r_far'], ['r_far', 'r_bound'], ['r_bound', 'b_iron']]);
const BY_ID = new Map(RVN_STARS.map((s) => [s.id, s]));
export const rvnStarOf = (id) => BY_ID.get(id) ?? null;
export const RVN_STAR_EDGES = Object.freeze([...RVN_STARS.flatMap((s) => s.links.map((l) => Object.freeze([l, s.id]))), ...RVN_STAR_CROSS.map((e) => Object.freeze([...e]))]);
const NEIGHBOURS = new Map(RVN_STARS.map((s) => [s.id, new Set()]));
for (const [a, b] of RVN_STAR_EDGES) { NEIGHBOURS.get(a).add(b); NEIGHBOURS.get(b).add(a); }
export const rvnNeighboursOf = (id) => [...(NEIGHBOURS.get(id) ?? [])];

// Held stars are read through here: known stars only, each joined to the Oath through held stars, within the points,
// and in an order they could have been bought.
export function rvnHeldStars(ids, points = Infinity) {
  points = Math.floor(points);
  const want = [];
  for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string' && id !== 'oath' && BY_ID.has(id) && !want.includes(id)) want.push(id);
  const out = ['oath'];
  const seen = new Set(out);
  for (let grew = true; grew && out.length - 1 < points;) {
    grew = false;
    for (const id of want) {
      if (out.length - 1 >= points) break;
      if (seen.has(id) || !rvnNeighboursOf(id).some((n) => seen.has(n))) continue;
      seen.add(id); out.push(id); grew = true;
    }
  }
  return out;
}
// A star given back also frees every held star that reaches the Oath only through it.
export function rvnTakesBack(held, id) {
  const h = new Set(rvnHeldStars(held));
  if (id === 'oath' || !h.has(id)) return [];
  h.delete(id);
  const reach = new Set(['oath']);
  const stack = ['oath'];
  while (stack.length) for (const n of rvnNeighboursOf(stack.pop())) if (h.has(n) && !reach.has(n)) { reach.add(n); stack.push(n); }
  return [id, ...[...h].filter((x) => !reach.has(x))];
}
export function rvnWayTo(held, id) {
  const h = new Set(rvnHeldStars(held));
  if (!BY_ID.has(id)) return null;
  if (h.has(id)) return [];
  const from = new Map();
  const queue = [...h];
  for (const q of queue) from.set(q, null);
  while (queue.length) {
    const cur = queue.shift();
    for (const n of rvnNeighboursOf(cur)) {
      if (from.has(n)) continue;
      from.set(n, cur);
      if (n === id) { const way = []; for (let x = n; x && !h.has(x); x = from.get(x)) way.unshift(x); return way; }
      queue.push(n);
    }
  }
  return null;
}
export const RVN_STAR_LEAST = Object.freeze(Object.fromEntries(RVN_STAR_STATS.map((k) => [k, Math.round(RVN_STARS.reduce((n, s) => n + Math.min(0, s.stats[k] ?? 0), 0) * 10000) / 10000])));
export function rvnStarStats(held) {
  const out = Object.fromEntries(RVN_STAR_STATS.map((k) => [k, 0]));
  for (const id of rvnHeldStars(held)) for (const [k, v] of Object.entries(rvnStarOf(id).stats)) out[k] = Math.round((out[k] + v) * 10000) / 10000;
  for (const k of RVN_STAR_STATS) out[k] = Math.max(RVN_STAR_LEAST[k], Math.min(RVN_STAR_MOST[k], out[k]));
  return Object.freeze(out);
}
const NONE = rvnStarStats(['oath']);
export const rvnStatsOf = (r) => (r?.sworn && Array.isArray(r.companion?.stars) ? rvnStarStats(rvnHeldStars(r.companion.stars, rvnStarsOf(r).points)) : NONE);
export const rvnStatScale = (stats, key) => Math.max(0.1, 1 + (Number(stats?.[key]) || 0));
export const rvnAwakened = (r) => rvnStatsOf(r).awaken > 0;
// The fraction left after rounding a reduced loss carries to the next loss, so a loyal share under a half still counts.
export function rvnLoyaltyMove(r, d, c = r?.companion) {
  if (!(d < 0)) return d;
  const exact = d * (1 - rvnStatsOf(r).loyal) + (Number.isFinite(c?.lossCarry) ? c.lossCarry : 0);
  const whole = Math.ceil(exact - 1e-9);
  if (c) c.lossCarry = Math.round((exact - whole) * 1e6) / 1e6;
  return whole;
}
export const rvnRestMinutes = (r, minutes) => Math.round(minutes * (1 - rvnStatsOf(r).rest));
// Taken onto an errand as it sets out, so star changes while it is away change neither its length nor its haul.
export const rvnErrandSky = (r) => { const s = rvnStatsOf(r); return Object.freeze({ odds: s.odds, haul: s.haul, road: s.road, bold: s.bold > 0 }); };
export function rvnErrandSkyOf(v) {
  if (!v || typeof v !== 'object') return null;
  const n = (k) => Math.max(RVN_STAR_LEAST[k], Math.min(RVN_STAR_MOST[k], Number.isFinite(v[k]) ? v[k] : 0));
  return Object.freeze({ odds: n('odds'), haul: n('haul'), road: n('road'), bold: v.bold === true });
}
