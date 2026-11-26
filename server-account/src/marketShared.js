// @ts-check
import { accountKind } from './accounts.js';
import { marksOpenFor } from './marks.js';
import { boardOpenFor } from './board.js';
import { TITHE_CAP } from '../../src/net/townSeatLaw.js';
import { marketHallTitheCap } from '../../src/net/fortLaw.js';
import { tideNow } from './tides.js';
import { tideCourier } from '../../src/net/tideLaw.js';
import { profOpenFor } from './professions.js';
import { holdStandsSql } from './realm.js';
import { CHAR_ID_RE } from './service.js';
import { MARKS_MAX } from '../../src/net/marksLaw.js';
import { regionOk, WITNESS } from '../../src/net/nodeLaw.js';
import { RECIPES, recipeById } from '../../src/net/recipeLaw.js';
import { MARKET_SHOWN, MARKET_RID_RE, MARKET_ID_RE, CRAFTED_FAMILIES, hubReport, hubPixelOk, MARKET_TAX_PCT, MARKET_TITHE_PCT, hubPixel, roadPixels, courierFee, courierSeconds, auctionNext, GOOD_GROUP_FAMILIES, marketPageOf, recipesNamed } from '../../src/net/marketLaw.js';
import { mintVersionOf, masterLinesOf } from '../../src/net/productRecord.js';
import { VENDOR_STATION } from '../../src/net/vendorLaw.js';
import { recordCount } from '../../src/net/realmTradeLaw.js';

export const DAY_S = 86_400;
export const BOUGHT_ORIGIN_SQL = "CASE WHEN currency = 'gold' THEN 'gold' ELSE 'bought' END";
export const RECENT_S = 7 * DAY_S;
export const SETTLE_MAX = 20;

export function marketOpenFor(player, env) {
  return boardOpenFor(player, env) && profOpenFor(player, env) && marksOpenFor(player, env);
}
export const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
export function asks(player, { character, rid, needRid = true, needChar = true }) {
  if (accountKind(player) !== 'linked') return { error: 'prof-need-account' };
  if (needChar && !charOk(character)) return { error: 'prof-character' };
  if (needRid && (typeof rid !== 'string' || !MARKET_RID_RE.test(rid))) return { error: 'prof-rid' };
  return null;
}
export const shut = (player, env) => (marketOpenFor(player, env) ? null : { error: 'market-closed' });
export const VENDOR_STANDS_SQL = `d.map_id = ?1 AND d.id = ?2 AND d.yard = 0 AND json_extract(d.place, '$.station') = '${VENDOR_STATION}'`;
export const idOk = (id) => typeof id === 'string' && MARKET_ID_RE.test(id);
export const sellerStoppedSql = (/** @type {string} */ x, /** @type {string} */ now) => `(EXISTS (SELECT 1 FROM players sp WHERE sp.id = ${x}.seller AND sp.banned_until > ${now})
  OR EXISTS (SELECT 1 FROM realm_characters sc WHERE sc.id = ${x}.char_id AND sc.player = ${x}.seller AND ${holdStandsSql('sc', now)}))`;
export const witnessOf = (player, nowS) => (Number.isSafeInteger(player.registered_at) && player.registered_at <= nowS - WITNESS.ageS ? 1 : 0);

export function hubsOf(hubs) {
  const out = new Map();
  if (!hubs || typeof hubs !== 'object' || Array.isArray(hubs)) return out;
  for (const [k, v] of Object.entries(hubs).slice(0, 62)) {
    const r = Number(k);
    if (!regionOk(r) || !Array.isArray(v)) continue;
    const [x, y] = v;
    if (hubPixelOk(x, y)) out.set(r, { x, y });
  }
  return out;
}
export async function hubsAt(db, regions, own) {
  const keys = hubKeysOf(regions);
  if (!keys.length) return new Map();
  return hubsFrom(keys, (await hubsStatement(db, keys).all()).results ?? [], own);
}
export const hubKeysOf = (regions) => [...new Set(regions)].map(String);
export const hubsStatement = (db, keys) => db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = 'hub' AND key IN (${keys.map((_, i) => `?${i + 1}`).join(', ')})`)
  .bind(...keys);
export function hubsFrom(keys, /** @type {any[]} */ results, own) {
  const by = new Map();
  for (const r of results) { const a = by.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); by.set(r.key, a); }
  return new Map(keys.map((k) => [Number(k), hubPixel(by.get(k) ?? [], own.get(Number(k)) ?? null)]));
}
export function courierOf(hubs, from, to, units, slow = 1) {
  if (from === to) return { courier: 0, seconds: 0, road: 0 };
  const a = hubs.get(from), b = hubs.get(to);
  if (!a || !b) return null;
  const road = roadPixels(a, b);
  return { courier: courierFee(units, road), seconds: courierSeconds(road) * slow, road };
}
export const courierSlow = (env, nowS, to) => tideCourier(tideNow(env, nowS, to));
export const spent = async (db, me, rid, suffix) => !!(await db.prepare('SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(me, `${rid}${suffix}`).first());
export function witnessStatements(db, player, nowS, regions, own, guardSql, guardBinds) {
  if (!witnessOf(player, nowS)) return [];
  const out = [];
  for (const r of new Set(regions)) {
    const px = own.get(r);
    if (!px) continue;
    out.push(db.prepare(`INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at)
      SELECT 'hub', ?1, ?2, ?3, ?4, ?5 WHERE ${guardSql}`).bind(String(r), player.id, hubReport(px.x, px.y), r, nowS, ...guardBinds));
  }
  return out;
}

export const mintVersionView = (record) => { const v = mintVersionOf(record); return v ? { version: v } : {}; };
export const pieceOf = (p, wear) => (p ? {
  provenance: p.provenance, recipe: p.recipe, quality: Number(p.quality), seed: Number(p.seed), maker: p.maker ?? null,
  marked: Number(p.marked) === 1, template: Number(p.template), material: Number(p.material), wear: Number(wear),
  ...(p.dye == null ? {} : { dye: Number(p.dye) }),
  ...(p.hand == null ? {} : { hand: Number(p.hand) }),
  ...mintVersionView(p.record),
  ...(masterLinesOf(p.record) ? { lines: masterLinesOf(p.record) } : {}),
} : null);
export const GONE_RECIPE_SQL = 'COALESCE(p.recipe, (SELECT recipe FROM prof_disenchants WHERE provenance = a.provenance)) AS recipe';
export const stackedListing = (l) => {
  if (l.kind !== 'item' || l.vendor_id == null) return false;
  const left = Number(l.own) + Number(l.bought);
  const it = goodOf(l.item);
  return left > 1 && !!it && recordCount(it) === left;
};
export const goodOf = (text) => {
  let v = null;
  try { v = typeof text === 'string' ? JSON.parse(text) : null; } catch { v = null; }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
};
// Only source-owned group names enter this SQL; the requested family stays a bound parameter.
export const goodSqlText = (value) => `'${value.replaceAll("'", "''")}'`;
export const GOODS_FAMILY_SQL = `CASE WHEN json_valid(item) THEN CASE json_extract(item, '$.group')
  ${GOOD_GROUP_FAMILIES.map(([group, family]) => `WHEN ${goodSqlText(group)} THEN ${goodSqlText(family)}`).join(' ')}
  ELSE 'other' END ELSE NULL END`;
// One JSON binding keeps the filter ahead of the row cutoff without spending a D1 parameter per recipe.
export const RECIPE_FAMILY_KEYS = new Map([...new Set(RECIPES.map((r) => r.family))]
  .map((family) => [family, JSON.stringify(RECIPES.filter((r) => r.family === family).map((r) => r.id))]));
export const recipeFamilyKeys = (family) => family ? (RECIPE_FAMILY_KEYS.get(family) ?? '[]') : null;
export const CRAFTED_LISTED = Object.freeze(CRAFTED_FAMILIES.map(([f]) => f));
export function pieceKeys(family, recipes, listed = null) {
  if (family && (typeof family !== 'string' || (listed && !listed.includes(family)))) return '[]';
  if (!recipes) return family ? recipeFamilyKeys(family) : listed ? JSON.stringify(recipesNamed('', listed)) : null;
  const families = family ? [family] : listed;
  return JSON.stringify(recipes.filter((id) => !families || families.includes(recipeById(id)?.family ?? '')));
}
export const PIECE_ORDER = Object.freeze({ cheap: 'l.price, l.at, l.id', dear: 'l.price DESC, l.at, l.id', new: 'l.at DESC, l.id', quality: 'p.quality DESC, l.price, l.at, l.id' });
export const AUCTION_ORDER = Object.freeze({ ending: 'a.ends_at, a.at, a.id', cheap: 'COALESCE(a.high, a.opening), a.ends_at, a.id',
  dear: 'COALESCE(a.high, a.opening) DESC, a.ends_at, a.id', new: 'a.at DESC, a.id' });
export const pageSql = (page) => `LIMIT ${MARKET_SHOWN} OFFSET ${marketPageOf(page) * MARKET_SHOWN}`;
export function listingView(l, me, extra = {}) {
  return {
    id: l.id, kind: l.kind, region: Number(l.region), ...(l.material ? { material: l.material } : {}),
    ...(l.kind === 'item' ? { item: goodOf(l.item) } : {}),
    units: Number(l.own) + Number(l.bought), listed: Number(l.units), price: Number(l.price), fee: Number(l.fee),
    ...(l.wear != null ? { wear: Number(l.wear) } : {}), at: Number(l.at), expiresAt: Number(l.expires_at), state: l.state,
    currency: l.currency === 'gold' ? 'gold' : 'marks',
    mine: l.seller === me, ...extra,
  };
}
export function auctionView(a, me, extra = {}) {
  const high = a.high == null ? null : Number(a.high);
  return {
    id: a.id, kind: 'auction', region: Number(a.region), opening: Number(a.opening), high, bids: Number(a.bids),
    next: auctionNext(high, Number(a.opening)), fee: Number(a.fee), wear: Number(a.wear), at: Number(a.at), endsAt: Number(a.ends_at),
    state: a.state, mine: a.seller === me, ...extra,
  };
}
export const bidView = (b) => ({
  id: b.id, auction: b.auction, amount: Number(b.amount), courier: Number(b.courier), region: Number(b.region), state: b.state,
  returned: Number(b.returned) === 1, at: Number(b.at),
});
export const netSql = (x) => `${x} - (${x} * ${MARKET_TAX_PCT}) / 100 - (${x} * ${MARKET_TITHE_PCT}) / 100`;
export const TITHE_PCT_MOST = marketHallTitheCap(Math.max(...Object.values(TITHE_CAP)), Infinity);
export const leastNetSql = (x) => `${x} - (${x} * ${MARKET_TAX_PCT}) / 100 - (${x} * ${TITHE_PCT_MOST}) / 100`;
export const boardOf = (b) => (Array.isArray(b) && b.length === 2 && hubPixelOk(b[0], b[1]) ? [b[0], b[1]] : null);
export const rowBoard = (r) => (r?.board_x == null ? null : [Number(r.board_x), Number(r.board_y)]);
export const titheEnd = (g, amt) => `EXISTS (SELECT 1 FROM guilds WHERE id = ${g}) AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ${g}), 0) + ${amt} <= ${MARKS_MAX}`;
export const stallSalesSql = () => `(SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND vendor_id IS NOT NULL)`;
export const openSalesSql = (now) => `((SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND vendor_id IS NULL)   -- MARKET-AUDIT: a trader's stock is its own count
  + (SELECT COUNT(*) FROM market_auctions WHERE seller = ?1 AND state = 'open' AND ends_at > ${now}))`;
export const orderView = (o, me) => ({
  id: o.id, region: Number(o.region), material: o.material, units: Number(o.units), left: Number(o.left_units), price: Number(o.price),
  escrow: Number(o.escrow), at: Number(o.at), expiresAt: Number(o.expires_at), state: o.state, mine: o.poster === me,
});
