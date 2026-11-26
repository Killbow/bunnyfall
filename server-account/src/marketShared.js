// @ts-check
// The market's shared reads: the open check and its guards, hubs, couriers, and witnesses, the
// piece and good views, and the listing, auction, bid, board, sale, and order views.
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
/** GOLD-MARKET: the Stores origin of units bought in the row's own currency (a listing's or a sale's `currency`). */
export const BOUGHT_ORIGIN_SQL = "CASE WHEN currency = 'gold' THEN 'gold' ELSE 'bought' END";
/** How far back "My listings" shows a closed listing or order, and "Your trades" reaches. */
export const RECENT_S = 7 * DAY_S;
/** Rows one settle works, at most - a read settles the rest next time. */
export const SETTLE_MAX = 20;

/** Whether the market is open to this account: the board, the professions and the Marks, each at its switch. */
export function marketOpenFor(player, env) {
  return boardOpenFor(player, env) && profOpenFor(player, env) && marksOpenFor(player, env);
}
export const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
/** The first door: a registered account, its character, and (for an act) a request id. */
export function asks(player, { character, rid, needRid = true, needChar = true }) {
  if (accountKind(player) !== 'linked') return { error: 'prof-need-account' };
  if (needChar && !charOk(character)) return { error: 'prof-character' };
  if (needRid && (typeof rid !== 'string' || !MARKET_RID_RE.test(rid))) return { error: 'prof-rid' };
  return null;
}
export const shut = (player, env) => (marketOpenFor(player, env) ? null : { error: 'market-closed' });
/** HOME-VENDOR: a trader standing - the home's piece `?1`/`?2` (its town, its id), indoors, made the vendor station. The
 *  query joins it as `d` to its home `h`. */
export const VENDOR_STANDS_SQL = `d.map_id = ?1 AND d.id = ?2 AND d.yard = 0 AND json_extract(d.place, '$.station') = '${VENDOR_STATION}'`;
export const idOk = (id) => typeof id === 'string' && MARKET_ID_RE.test(id);
/** STAFF-PANEL3-REALM (design doc weak spots, "Freeze and trade holds": "A banned, frozen or held player's market listings
 *  keep selling. Buys and bids check the seller's hold, ban and freeze"): 1 when the seller of listing or auction `x` may
 *  sell nothing now - its account banned, or the character it listed from held (realm.js holdStandsSql, the patrons'
 *  own) - `now` the SQL of the time. Read with the row a buy or a bid reads, so it costs no round trip. The freeze joins
 *  it beside the ban (the freeze's own build). */
export const sellerStoppedSql = (/** @type {string} */ x, /** @type {string} */ now) => `(EXISTS (SELECT 1 FROM players sp WHERE sp.id = ${x}.seller AND sp.banned_until > ${now})
  OR EXISTS (SELECT 1 FROM realm_characters sc WHERE sc.id = ${x}.char_id AND sc.player = ${x}.seller AND ${holdStandsSql('sc', now)}))`;
/** An account a week registered may witness (SEAT0 3.2), as a harvest's does. */
export const witnessOf = (player, nowS) => (Number.isSafeInteger(player.registered_at) && player.registered_at <= nowS - WITNESS.ageS ? 1 : 0);

/** The hubs a request carries - `{ [region]: [x, y] }`, the client's own derivation - as a Map of region to pixel;
 *  anything out of shape is left out, never refused. */
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
/** THE ROADS' ENDS: each region's hub as the witnesses say it is, else as this client derived it (marketLaw hubPixel). */
export async function hubsAt(db, regions, own) {
  const keys = hubKeysOf(regions);
  if (!keys.length) return new Map();
  return hubsFrom(keys, (await hubsStatement(db, keys).all()).results ?? [], own);
}
/** MARKET-SPEED: hubsAt's keys, its read as a statement (for a read's batch) and its Map off the rows - each key's rows
 *  gathered once, where every key filtered every row. */
export const hubKeysOf = (regions) => [...new Set(regions)].map(String);
export const hubsStatement = (db, keys) => db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = 'hub' AND key IN (${keys.map((_, i) => `?${i + 1}`).join(', ')})`)
  .bind(...keys);
export function hubsFrom(keys, /** @type {any[]} */ results, own) {
  const by = new Map();
  for (const r of results) { const a = by.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); by.set(r.key, a); }
  return new Map(keys.map((k) => [Number(k), hubPixel(by.get(k) ?? [], own.get(Number(k)) ?? null)]));
}
/** The courier between two regions: `{ courier, seconds, road }` - nothing on the same region, null with no road.
 *  SEASON1 part two: `slow` the Tide's factor on its seconds where it is bound (tideLaw.js tideCourier). */
export function courierOf(hubs, from, to, units, slow = 1) {
  if (from === to) return { courier: 0, seconds: 0, road: 0 };
  const a = hubs.get(from), b = hubs.get(to);
  if (!a || !b) return null;
  const road = roadPixels(a, b);
  return { courier: courierFee(units, road), seconds: courierSeconds(road) * slow, road };
}
/** SEASON1 part two (9.3): a Bandit Summer where a courier is bound, while a Season is counted. */
export const courierSlow = (env, nowS, to) => tideCourier(tideNow(env, nowS, to));
/** AUDIT 30 S3: whether the ledger already holds this account's line `rid` + `suffix` - a request id spent, though the
 *  row that would answer its repeat was pruned. */
export const spent = async (db, me, rid, suffix) => !!(await db.prepare('SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(me, `${rid}${suffix}`).first());
/** The witness statements an act writes for the regions it names (SEAT0 3.2), each where its decision stands. */
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

// ─── WHAT A ROW LOOKS LIKE TO THE CLIENT ─────────────────────────────

/** CRAFT-PROCS (FIELD BUGS 2026-10-13e): a piece's `version` as the client's mint reads it (smithItems.js mintPiece) -
 *  its record's, so every row a piece is read from selects `p.record`; none for a record made before the stamp. */
export const mintVersionView = (record) => { const v = mintVersionOf(record); return v ? { version: v } : {}; };
export const pieceOf = (p, wear) => (p ? {
  provenance: p.provenance, recipe: p.recipe, quality: Number(p.quality), seed: Number(p.seed), maker: p.maker ?? null,
  marked: Number(p.marked) === 1, template: Number(p.template), material: Number(p.material), wear: Number(wear),
  ...(p.dye == null ? {} : { dye: Number(p.dye) }),   // PROF7: a garment is the colour it was sewn in
  ...(p.hand == null ? {} : { hand: Number(p.hand) }),   // PROF9: a dish keeps its cook's hand (0069)
  ...mintVersionView(p.record),   // CRAFT-PROCS: a piece made before mints as it was
  ...(masterLinesOf(p.record) ? { lines: masterLinesOf(p.record) } : {}),   // MASTER-ART: a Master's work mints its chosen lines
} : null);
/** AUDIT PROF-541 R2-S4: an auction's piece's recipe - its products row's, or, the piece disenchanted since (the row
 *  deleted), its disenchant's (prof_disenchants.provenance is UNIQUE: one look-up). `a` the auction, `p` its row. */
export const GONE_RECIPE_SQL = 'COALESCE(p.recipe, (SELECT recipe FROM prof_disenchants WHERE provenance = a.provenance)) AS recipe';
/** MARKET-ANY: a piece from a pack, as its listing or its delivery carries it - its record, or null. */
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
// Only source-owned group names enter this SQL; the requested family remains a bound parameter.
// Guard malformed persisted JSON before extracting its group; goodOf still validates every returned record.
export const goodSqlText = (value) => `'${value.replaceAll("'", "''")}'`;
export const GOODS_FAMILY_SQL = `CASE WHEN json_valid(item) THEN CASE json_extract(item, '$.group')
  ${GOOD_GROUP_FAMILIES.map(([group, family]) => `WHEN ${goodSqlText(group)} THEN ${goodSqlText(family)}`).join(' ')}
  ELSE 'other' END ELSE NULL END`;
// Recipe families are source-owned. One JSON binding keeps filtering ahead of the row cutoff
// without spending one D1 parameter per recipe; truthy unsupported families retain their empty result.
export const RECIPE_FAMILY_KEYS = new Map([...new Set(RECIPES.map((r) => r.family))]
  .map((family) => [family, JSON.stringify(RECIPES.filter((r) => r.family === family).map((r) => r.id))]));
export const recipeFamilyKeys = (family) => family ? (RECIPE_FAMILY_KEYS.get(family) ?? '[]') : null;
/** BOARD-SIFT: THE RECIPES A READ OF PIECES ASKS, one bound JSON array, so a page is a page: its family's (a family that is
 *  no string, or not `listed`, names none - recipeFamilyKeys' law), narrowed to a search's recipes (`recipes`, the
 *  client's reading of its words - marketLaw recipesNamed over the names the rows wear, AUDIT BOARD-SIFT; null for no
 *  search); `listed` the families a view lists (Crafted's CRAFTED_FAMILIES - the filter that ran after the cutoff), null
 *  for a view that lists every recipe and an unknown one too (Auctions), which is unfiltered (null) where nothing
 *  narrows it. */
export const CRAFTED_LISTED = Object.freeze(CRAFTED_FAMILIES.map(([f]) => f));
export function pieceKeys(family, recipes, listed = null) {
  if (family && (typeof family !== 'string' || (listed && !listed.includes(family)))) return '[]';
  if (!recipes) return family ? recipeFamilyKeys(family) : listed ? JSON.stringify(recipesNamed('', listed)) : null;
  const families = family ? [family] : listed;
  return JSON.stringify(recipes.filter((id) => !families || families.includes(recipeById(id)?.family ?? '')));
}
/** BOARD-SIFT: each view's orders as SQL - source-owned, chosen by marketLaw marketSortOf's word, never a bound value; each
 *  ends on the row's id, so a page never shares a row with the next. */
export const PIECE_ORDER = Object.freeze({ cheap: 'l.price, l.at, l.id', dear: 'l.price DESC, l.at, l.id', new: 'l.at DESC, l.id', quality: 'p.quality DESC, l.price, l.at, l.id' });
export const AUCTION_ORDER = Object.freeze({ ending: 'a.ends_at, a.at, a.id', cheap: 'COALESCE(a.high, a.opening), a.ends_at, a.id',
  dear: 'COALESCE(a.high, a.opening) DESC, a.ends_at, a.id', new: 'a.at DESC, a.id' });
/** BOARD-SIFT: a page's rows - MARKET_SHOWN of them, `page` pages in. */
export const pageSql = (page) => `LIMIT ${MARKET_SHOWN} OFFSET ${marketPageOf(page) * MARKET_SHOWN}`;
export function listingView(l, me, extra = {}) {
  return {
    id: l.id, kind: l.kind, region: Number(l.region), ...(l.material ? { material: l.material } : {}),
    ...(l.kind === 'item' ? { item: goodOf(l.item) } : {}),   // MARKET-ANY: the piece's record
    units: Number(l.own) + Number(l.bought), listed: Number(l.units), price: Number(l.price), fee: Number(l.fee),
    ...(l.wear != null ? { wear: Number(l.wear) } : {}), at: Number(l.at), expiresAt: Number(l.expires_at), state: l.state,
    currency: l.currency === 'gold' ? 'gold' : 'marks',   // GOLD-MARKET: what its price is in
    mine: l.seller === me, ...extra,
  };
}
/** PROF5b: an auction as the tab reads it - its standing bid (or none), the least next bid, its end. */
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
/** PROF5b: a sale's tax and Tithe off its whole, in SQL - `x`'s floor of hundredths, as saleTax and saleTithe are. */
export const netSql = (x) => `${x} - (${x} * ${MARKET_TAX_PCT}) / 100 - (${x} * ${MARKET_TITHE_PCT}) / 100`;
/** AUDIT SCALE A1: the most any seat's Tithe can take of a sale - the crown's cap and a Market Hall's whole rise
 *  (townSeatLaw.js TITHE_CAP, fortLaw.js marketHallTitheCap) - and so the least a seller can be owed. */
export const TITHE_PCT_MOST = marketHallTitheCap(Math.max(...Object.values(TITHE_CAP)), Infinity);
export const leastNetSql = (x) => `${x} - (${x} * ${MARKET_TAX_PCT}) / 100 - (${x} * ${TITHE_PCT_MOST}) / 100`;
/** SEAT1d: a board's town pixel as a request names it (`board: [x, y]`), or null - an older client's names none. */
export const boardOf = (b) => (Array.isArray(b) && b.length === 2 && hubPixelOk(b[0], b[1]) ? [b[0], b[1]] : null);
/** SEAT1d: a row's board pixel (a listing's, an auction's), or null. */
export const rowBoard = (r) => (r?.board_x == null ? null : [Number(r.board_x), Number(r.board_y)]);
/** SEAT1d (SEAT0 7.2): a Tithe line's end - the holder's Drake treasury where the guild stands and its cap takes it,
 *  else burnt (PROF0 18: "SEAT1 writes the Tithe's line (to the holder, or burnt)"). `g` the guild id's parameter, `amt`
 *  the amount's expression. */
export const titheEnd = (g, amt) => `EXISTS (SELECT 1 FROM guilds WHERE id = ${g}) AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ${g}), 0) + ${amt} <= ${MARKS_MAX}`;
/** MARKET-AUDIT: a home's traders' stock an account (`?1`) stands - its own count (VENDOR_STOCK_MAX), never the board's
 *  thirty: "such a listing stands on no regional board" (vendorLaw.js), yet thirty pieces at a stall shut the board. */
export const stallSalesSql = () => `(SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND vendor_id IS NOT NULL)`;
/** PROF5b: the open sales an account (`?1`) stands - its listings and its auctions (10.2's thirty are both); AUDIT 31
 *  L1: an auction past its end, a won one waiting on its seller's Marks cap, stands no longer - the moment at `now`. */
export const openSalesSql = (now) => `((SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND vendor_id IS NULL)   -- MARKET-AUDIT: a trader's stock is its own count
  + (SELECT COUNT(*) FROM market_auctions WHERE seller = ?1 AND state = 'open' AND ends_at > ${now}))`;
export const orderView = (o, me) => ({
  id: o.id, region: Number(o.region), material: o.material, units: Number(o.units), left: Number(o.left_units), price: Number(o.price),
  escrow: Number(o.escrow), at: Number(o.at), expiresAt: Number(o.expires_at), state: o.state, mine: o.poster === me,
});
