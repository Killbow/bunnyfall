// @ts-check
// Home traders: a trader's stall and the traders list, the trader board, and the patrons'
// reckoning with its SQL and its notices.
import { mustChange, holdStandsSql } from './realm.js';
import { lawfulItem, itemWorth } from '../../src/items/itemLaw.js';
import { patronHour, patronCands, patronHours, patronWorth, patronTakes, PATRON_HOUR_S, PATRON_TOWN_HOUR, PATRON_SELLER_HOUR, PATRON_SELLER_DAY_GOLD } from '../../src/net/patronLaw.js';
import { countedDb } from './metrics.js';
import { faucetStatement } from './budget.js';
import { ledgerKeyOf } from './judge.js';
import { escrowSpentSteps } from './ledger.js';
import { CHAR_ID_RE } from './service.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { goldSaleOf, MARKET_GOLD_HELD_MAX, goodRefusal } from '../../src/net/marketLaw.js';
import { vendorOf, VENDOR_STATION, VENDOR_STOCK_SHOWN, VENDOR_BOARD_SHOWN } from '../../src/net/vendorLaw.js';
import { patronActStatements } from './townEcon.js';
import { shapeOf, keptFits } from './keptBoard.js';
import { marketOpenFor, asks, shut, VENDOR_STANDS_SQL, goodOf, listingView } from './marketShared.js';

// ─── HOME-VENDOR: A HOME'S TRADER, AND THE REGION'S TRADERS ─────────────────

/** A trader as its stock's reader sees it: where it stands and whose it is. */
export const vendorView = (v, me) => ({ map: Number(v.map_id), id: v.id, buildingKey: Number(v.building_key), region: Number(v.region), owner: v.owner_name, mine: v.player === me });

/**
 * HOME-VENDOR: A TRADER'S STOCK - `{ vendor: { map, id } }`, read by anyone the market is open to (a visitor at the
 * stall, its owner stocking it): the trader, and its open pieces, newest first. 'vendor-gone' where no trader stands.
 */
export async function marketVendor(ctx, player, env, { vendor = null } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { needRid: false, needChar: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  const vend = vendorOf(vendor);
  if (!vend) return { error: 'bad-vendor' };
  const v = await db.prepare(`SELECT d.map_id, d.id, h.building_key, h.region, h.owner_name, h.player FROM home_decor d
    JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key WHERE ${VENDOR_STANDS_SQL}`).bind(vend.map, vend.id).first();
  if (!v) return { error: 'vendor-gone' };
  await reckonPatrons(ctx, { maps: [vend.map] }, env).catch(() => null);   // LW15: the town's patrons first, lazily
  const { results = [] } = await db.prepare(`SELECT * FROM market_listings WHERE vendor_map = ?1 AND vendor_id = ?2 AND state = 'open'
    AND expires_at > ?3 AND seller = ?4 ORDER BY at DESC LIMIT ${VENDOR_STOCK_SHOWN}`).bind(vend.map, vend.id, nowS, v.player).all();
  // AUDIT LW-II-2 S7: its own house's sales alone - a piece's id is its owner's client's, so another's trader of the same
  // id in the town told its sales at this one's stall (AUDIT LW-II P9's case, at the trader's own read)
  const patrons = (await patronsTold(db, [vend.map], nowS).catch(() => [])).filter((p) => p.vendor === vend.id && p.buildingKey === Number(v.building_key));
  return { ok: true, vendor: vendorView(v, player.id), rows: results.map((l) => listingView(l, player.id)), patrons };
}

/**
 * HOME-VENDOR: THE REGION'S TRADERS - `{ region, character? }`: every open piece standing at a trader of a home in that
 * region, newest first, each with its trader (the Notice Board's Vendors tab searches these by the item, the owner, the
 * town) and its house's DOOR as the town answer says it (homes.js townHomes: `entry`, `mine`, `guildmate`, `tenant`) for
 * the character named - so the client keeps only the traders that character may walk in on (net/homeLaw.js homeMayEnter,
 * the door's own law; a party's names are the relay's, never the service's). A guild's hall stands no trader.
 */
export async function marketVendors(ctx, player, env, { region, character = null } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { needRid: false, needChar: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  // VENDOR-BOARD (2026-10-19; bible/11-Multiplayer/Scale-Arc.md VENDOR-BOARD; migration 0137): THE REGION'S BOARD, EVERY
  // CALLER'S ALIKE, IS ONE ROW (vendorBoard), and the caller's own door - its own house, its guild's, a room it rents -
  // is read off two of its own rows, where the board's two statements asked them of every listing
  // AUDIT LEAN-READS D5: the caller's own rows read first - the board may keep its row last, and on a replica's session a
  // read after a write waits for the write's position
  const me = typeof character === 'string' && CHAR_ID_RE.test(character) ? character : '';
  const [mates, rooms] = me ? await db.batch([
    db.prepare('SELECT a.player, a.char_id FROM guild_members a JOIN guild_members b ON b.guild_id = a.guild_id WHERE b.player = ?1 AND b.char_id = ?2').bind(player.id, me),
    db.prepare(`SELECT map_id, building_key, MAX(until) AS until FROM home_rooms WHERE tenant = ?1 AND tenant_char = ?2 AND until > ?3
      GROUP BY map_id, building_key`).bind(player.id, me, nowS),
  ]) : [null, null];
  const board = await vendorBoard(ctx, region);
  // ACCOUNT-HOMES (2026-10-06): a house is its ACCOUNT's, so the door's guildmate is a guild shared with any character of
  // the owner's account - the accounts of the caller's guildmates, not their characters
  const mate = new Set((mates?.results ?? []).map((/** @type {any} */ m) => m.player));
  const rent = new Map((rooms?.results ?? []).map((/** @type {any} */ r) => [`${r.map_id}:${r.building_key}`, Number(r.until)]));
  const traderOf = (/** @type {any} */ l) => `${l.v_map}:${l.v_key}:${l.v_id}`;
  const shown = new Set(board.newest.map(traderOf));
  const results = [...board.newest, ...board.houses.filter((/** @type {any} */ l) => !shown.has(traderOf(l)))];
  const since = nowS - PATRON_TOLD_S;
  return {
    ok: true, region,
    patrons: board.patrons.filter((/** @type {any} */ r) => Number(r.at) > since).map(patronView),   // LW15: the region's patrons' purchases, for its towns to draw
    rows: results.map((l) => {
      const tenancy = rent.get(`${l.v_map}:${l.v_key}`);
      return listingView(l, player.id, {
        vendor: { map: Number(l.v_map), id: l.v_id }, map: Number(l.v_map), buildingKey: Number(l.v_key), owner: l.v_owner,
        // the house's door, as the town answer says it to this character (homeMayEnter's own fields)
        home: { owner: l.v_owner, entry: l.v_entry, mine: l.v_player === player.id,   // ACCOUNT-HOMES: the account's own, whichever character bought it
          ...(l.v_entry === 'guild' && mate.has(l.v_player) ? { guildmate: true } : {}),
          ...(Number.isSafeInteger(tenancy) ? { tenant: tenancy } : {}) },   // the rooms read rents still running alone
      });
    }),
  };
}

/**
 * VENDOR-BOARD (2026-10-19, the account database overloaded again: the region's traders the read most asked again in
 * the 18:05 overload - 1,517 asks in five minutes where 330 was the rate; bible/11-Multiplayer/Scale-Arc.md VENDOR-BOARD;
 * migration 0137): THE REGION'S TRADERS AS EVERY CALLER READS THEM - `{ newest, houses, patrons }`, the rows the board's
 * three reads answer, before any caller's own door. Its kept row while it is its version's (the database moves it on
 * every trader listing, trader, trader's house and patron sale written - in a row of its own, AUDIT LEAN-READS 2 B3; no
 * such row, no board kept: B4), its shape's (these reads' and their bounds' - keptBoard.js) and the caller's second is
 * between `since` and `until` (vendorSpan: AUDIT LEAN-READS B3, a caller whose second came before the read's is told the
 * listings still open at its own - and 2 B2, served the board where none ran out between); else read - writing nothing
 * first (D5) - the version, the three reads and the board's bounds in ONE batch, one snapshot, and kept at the version it
 * read: a write landing between leaves the version past it, so the next caller reads again. Kept only where the version
 * is still the one it read, so a slow reader never puts an older board over a newer one, and only where no board kept
 * meanwhile serves its second or a later one already, so readers that missed together write it once (B2).
 *
 * PATRON-LOAD (2026-10-10, Mac: "the newest update account service keeps failing"): THE REGION'S READ RECKONS NOTHING.
 * Every online client standing in a living town reads it each PATRON_READ_S (scenes/world.js livingPatronsRead), and its
 * lazy reckoning - up to PATRON_READ_STATEMENTS statements a read - backed the database's writes up until D1 refused as
 * overloaded. The hour's cron reckons the towns waiting longest; a trader opened (/vendor) and a seller's own page
 * (/myvendors) reckon their towns; this read tells what they sold. PATRON-LOAD II (migration 0107): AND BY THE LISTING'S
 * OWN REGION - a trader's listing carries its home's region (listGood), so `l.region = ?2` asks what `h.region = ?2`
 * asks, and idx_market_vendor_region answers it. AUDIT LW-II-2 W6: AND EVERY PUBLIC TRADER OF THE REGION its patrons may
 * buy of - each such house's newest piece, where the board's VENDOR_BOARD_SHOWN newest left the house out: the towns'
 * word reads its traders off these rows (world.js livingPatronsStep). Bounded as the board is: a house a row,
 * VENDOR_BOARD_SHOWN of them.
 * @param {{ db: any, nowS: number }} ctx @param {number} region
 */
export async function vendorBoard({ db, nowS }, region) {
  const kept = await db.prepare(VENDOR_BOARD_READ).bind(region).first();
  const fresh = kept?.ver != null && Number(kept.built) === Number(kept.ver) && kept.shape === VENDOR_BOARD_SHAPE
    && Number(kept.since) <= nowS && nowS < Number(kept.until) ? vendorBoardOf(kept.rows) : null;
  if (fresh) return fresh;
  const [v, newest, houses, patrons, span] = await db.batch([
    db.prepare('SELECT ver FROM market_vendor_ver WHERE region = ?1').bind(region),
    db.prepare(VENDOR_NEWEST_SQL).bind(nowS, region),
    db.prepare(VENDOR_HOUSES_SQL).bind(nowS, region),
    db.prepare(VENDOR_PATRONS_SQL).bind(nowS - PATRON_TOLD_S, region),
    db.prepare(VENDOR_SPAN_SQL).bind(region, nowS, nowS - PATRON_TOLD_S),
  ]);
  const read = { newest: newest?.results ?? [], houses: houses?.results ?? [], patrons: patrons?.results ?? [] };
  const ver = v?.results?.[0]?.ver;   // AUDIT LEAN-READS 2 B4: no version row, no board kept - read every time
  const text = JSON.stringify(read);
  if (Number.isSafeInteger(ver) && keptFits(text, 'a region\'s traders')) {
    const { since, until } = vendorSpan(span?.results?.[0], read.patrons.length, nowS);
    await db.prepare(VENDOR_BOARD_KEEP).bind(region, ver, VENDOR_BOARD_SHAPE, nowS, since, until, text).run()
      .catch((/** @type {any} */ e) => console.warn('[market] the region\'s board not kept', e?.message ?? e));   // the answer stands; the next caller reads it again
  }
  return read;
}
/** VENDOR-BOARD: a region's version and its kept board - one row each, the version's its own (AUDIT LEAN-READS 2 B3). */
export const VENDOR_BOARD_READ = `SELECT v.ver, b.built, b.shape, b.since, b.until, b.rows
  FROM (SELECT ?1 AS r) q LEFT JOIN market_vendor_ver v ON v.region = q.r LEFT JOIN market_vendor_boards b ON b.region = q.r`;
/** VENDOR-BOARD: a board read kept - where the region's version row still holds the version it read (?2; AUDIT LEAN-READS
 *  2 B4: a row deleted after the read keeps nothing) and no board of that version and shape is kept for its second (?4)
 *  or a later one already: one serving it already (B2: readers that missed together write it once), or one read at a
 *  later second, which a caller whose clock lagged never puts back to its own. */
export const VENDOR_BOARD_KEEP = `INSERT INTO market_vendor_boards (region, built, shape, since, until, rows)
  SELECT ?1, ?2, ?3, ?5, ?6, ?7 WHERE (SELECT ver FROM market_vendor_ver WHERE region = ?1) = ?2
  ON CONFLICT (region) DO UPDATE SET built = excluded.built, shape = excluded.shape, since = excluded.since, until = excluded.until, rows = excluded.rows
  WHERE NOT (built = excluded.built AND shape IS excluded.shape AND until > ?4)`;
/** VENDOR-BOARD: how long a board with no listing to run out is kept before it is read again regardless. */
export const VENDOR_BOARD_KEPT_S = 86_400;
/**
 * VENDOR-BOARD: THE SECONDS A BOARD READ AT `nowS` IS THE BOARD FOR - `{ since, until }` off VENDOR_SPAN_SQL's row (its
 * bounds read in the board's own batch: one snapshot). `until`: its first listing to run out, a day at most. `since`
 * (AUDIT LEAN-READS 2 B2): a caller's second before `nowS` reads the listings that ran out between as open (`expires_at
 * > ?1`) - none after the last to run out by `nowS`, so from there - and the patrons' sales that left the day between
 * (`at > ?1 - PATRON_TOLD_S`) - which change its answer only where the board tells fewer than VENDOR_BOARD_SHOWN, newest
 * first, so from the last such sale's leaving. Where the reads read with the overload's lag, the board read at the
 * read's second is the board for its callers' seconds as well.
 * @param {any} row @param {number} patrons the board's patrons told @param {number} nowS
 */
export function vendorSpan(row, patrons, nowS) {
  const gone = row?.gone == null ? 0 : Number(row.gone);
  const told = patrons < VENDOR_BOARD_SHOWN && row?.told != null ? Number(row.told) + PATRON_TOLD_S : 0;
  return { since: Math.min(nowS, Math.max(0, gone, told)), until: Math.min(Number(row?.next ?? Infinity), nowS + VENDOR_BOARD_KEPT_S) };
}
/** VENDOR-BOARD: a kept board's text read back, or null for one that is not a board. */
export function vendorBoardOf(/** @type {unknown} */ text) {
  let o;
  try { o = JSON.parse(String(text)); } catch { return null; }
  return o && Array.isArray(o.newest) && Array.isArray(o.houses) && Array.isArray(o.patrons) ? o : null;
}

/**
 * HOME-VENDOR: MY TRADERS - `{ character }`: the Vendor page's read (the pause window's, beside the Professions). Every
 * trader of this character's homes (where it stands), the pieces standing at them, the pieces they have SOLD (newest
 * first, while the market keeps the sale's listing), and the gold the sales hold to collect at any board.
 * ACCOUNT-HOMES (2026-10-06): the traders are the ACCOUNT's homes' (every character of it owns them); what stands at
 * them, what they sold and the gold held stay this character's - a listing is its seller character's goods.
 */
export async function marketMyVendors(ctx, player, env, { character } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  const me = player.id;
  const { results: traders = [] } = await db.prepare(`SELECT d.map_id, d.id, h.building_key, h.region, h.owner_name, h.player FROM home_decor d
    JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
    WHERE h.player = ?1 AND h.guild_id IS NULL AND (h.deed = 0 OR h.char_id = ?2) AND d.yard = 0 AND json_extract(d.place, '$.station') = '${VENDOR_STATION}' ORDER BY h.map_id, d.id`).bind(me, character).all();
  await reckonPatrons(ctx, { maps: [...new Set(traders.map((v) => Number(v.map_id)))] }, env).catch(() => null);   // LW15: my traders' towns' patrons first
  const { results: stock = [] } = await db.prepare(`SELECT * FROM market_listings WHERE seller = ?1 AND char_id = ?2 AND vendor_id IS NOT NULL AND state = 'open'
    AND expires_at > ?3 ORDER BY at DESC LIMIT ${VENDOR_STOCK_SHOWN * 2}`).bind(me, character, nowS).all();
  const { results: sold = [] } = await db.prepare(`SELECT s.listing, s.price, s.total, s.tax, s.tithe, s.fee, s.at, l.item, l.vendor_map, l.vendor_id
    FROM market_sales s JOIN market_listings l ON l.id = s.listing
    WHERE s.seller = ?1 AND l.char_id = ?2 AND l.vendor_id IS NOT NULL ORDER BY s.at DESC LIMIT ${VENDOR_STOCK_SHOWN}`).bind(me, character).all();
  const gold = await db.prepare('SELECT gold FROM market_gold WHERE player = ?1 AND char_id = ?2').bind(me, character).first();
  // LW15: what the town's patrons bought - the buyer the seed the client deals to a resident of the town
  const { results: patronSold = [] } = await db.prepare(`SELECT s.listing, s.map, s.hour, s.minute, s.seed, s.price, s.tax, s.fee, s.gets, s.at, l.item, l.vendor_map, l.vendor_id
    FROM market_patron_sales s JOIN market_listings l ON l.id = s.listing WHERE s.seller = ?1 AND s.char_id = ?2 ORDER BY s.at DESC LIMIT ${VENDOR_STOCK_SHOWN}`).bind(me, character).all();
  return {
    ok: true,
    patronSold: patronSold.map((s) => ({
      listing: s.listing, item: goodOf(s.item), price: Number(s.price), total: Number(s.price), gets: Number(s.gets), at: Number(s.at),
      vendor: { map: Number(s.vendor_map), id: s.vendor_id }, patron: { map: Number(s.map), seed: Number(s.seed), hour: Number(s.hour), minute: Number(s.minute) },
    })),
    traders: traders.map((v) => vendorView(v, me)),
    stock: stock.map((l) => listingView(l, me, { vendor: { map: Number(l.vendor_map), id: l.vendor_id } })),
    sold: sold.map((s) => ({
      listing: s.listing, item: goodOf(s.item), price: Number(s.price), total: Number(s.total),
      gets: Math.max(0, Number(s.total) - Number(s.tax) - Number(s.tithe) - Number(s.fee ?? 0)), at: Number(s.at),
      vendor: { map: Number(s.vendor_map), id: s.vendor_id },
    })),
    gold: Number(gold?.gold ?? 0),
  };
}

// ─── LW15: THE PATRONS (bible/06-Systems/Living-World-II.md "LW15") ─

/** The towns one firing of the hour's cron reckons (the rest the next, or their next read). */
export const PATRON_CRON_TOWNS = 40;
/** AUDIT LW-II P5: THE STATEMENTS ONE READ'S RECKONING MAY RUN - counted as the cron's share is (cron.js countedDb), a
 *  third of a firing's: D1 answers an invocation a thousand queries, and one read of a region two days behind ran 5,826.
 *  Spent, the reckoning stops between hours and marks the last it finished; the next read, or the hour's cron, goes on. */
export const PATRON_READ_STATEMENTS = 200;
/** How far back a trader's answer tells its patrons' purchases (the client draws the buyer coming in). */
export const PATRON_TOLD_S = 86_400;
/** A trader's home the patrons see: one the town may enter (`public`) whose owner stocks it, the trader standing in it
 *  (`d` the trader, `h` its home, `l` the listing). */
export const PATRON_HOME_SQL = `h.entry = 'public' AND h.player = l.seller AND d.yard = 0 AND h.guild_id IS NULL
  AND json_extract(d.place, '$.station') = '${VENDOR_STATION}'`;
/** A trader's listings the patrons see: gold, a pack's piece, at such a home. */
export const PATRON_SQL = `l.state = 'open' AND l.vendor_id IS NOT NULL AND l.currency = 'gold' AND l.kind = 'item' AND ${PATRON_HOME_SQL}`;
export const PATRON_FROM = `FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
  JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key`;
/** AUDIT LW-II P4: a listing's seller the judge holds (realm.js holdRefusal's own: held, or a record no checkpoint has
 *  read) - `l` the listing. Asked in the sale's write; AUDIT LW-II-2 S5: and with the town's listings, so a held seller's
 *  pieces are no candidates - refused in the write alone they stayed the hour's lowest draws, every hour, and an honest
 *  seller beside four held ones sold a fraction of what it sold alone. */
export const PATRON_HELD_SQL = `EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = l.char_id AND c.player = l.seller AND (${holdStandsSql('c', "CAST(strftime('%s', 'now') AS INTEGER)")} OR c.judged_seq IS NULL))`;   // AUDIT AUTO-HOLD: a dead seller's hold timed out stands no more (realm.js holdStandsSql)
/** A TOWN'S TRADERS' LISTINGS, every open one its reckoning's mark moves - each once, with the house a patron may walk into
 *  for it (`bkey`; none, a listing no patron sees) and whether its seller is held (`held`). AUDIT LW-II P7: a town whose
 *  traders stand all in homes no patron may enter is marked too, so its hours never wait to be paid when a door opens;
 *  AUDIT LW-II P5: and the mark is written only where one would move. */
export const PATRON_TOWN_SQL = `SELECT l.id, l.seller, l.char_id, l.kind, l.price, l.item, l.own + l.bought AS cnt, l.at, l.expires_at, l.patron_hour,
    (SELECT h.building_key FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE d.map_id = l.vendor_map AND d.id = l.vendor_id AND ${PATRON_HOME_SQL} LIMIT 1) AS bkey, ${PATRON_HELD_SQL} AS held
  FROM market_listings l WHERE l.vendor_map = ?1 AND l.state = 'open' AND l.vendor_id IS NOT NULL AND l.currency = 'gold'`;
/** AUDIT LW-II P5/P6: AN HOUR'S COUNTS, ONE ASK - the town's sales in the hour (`seller` NULL) and each of the hour's
 *  candidates' sellers' sales in it and gold that real day, by the day (idx_patron_sales_seller): `?1` the town, `?2` the
 *  hour, `?3` its day, `?4` the sellers (JSON). Asked only for an hour some listing draws under its odds. */
export const PATRON_COUNTS_SQL = `SELECT NULL AS seller, COUNT(*) AS n, 0 AS g FROM market_patron_sales WHERE map = ?1 AND hour = ?2
  UNION ALL SELECT seller, SUM(hour = ?2), SUM(price) FROM market_patron_sales WHERE day = ?3 AND seller IN (SELECT value FROM json_each(?4)) GROUP BY seller`;
/** AUDIT LW-II P6: the region's read of its last day's sales (idx_patron_sales_region), and the towns' (`?2...`). */
export const PATRON_TOLD_SQL = (/** @type {string} */ where) => `SELECT s.listing, s.map, s.hour, s.minute, s.seed, s.price, s.at, s.building_key, l.item, l.vendor_id
  FROM market_patron_sales s JOIN market_listings l ON l.id = s.listing WHERE ${where} AND s.at > ?1 ORDER BY s.at DESC LIMIT ${VENDOR_BOARD_SHOWN}`;

/** VENDOR-BOARD: a trader listing's columns as the board keeps them - the ones listingView reads (AUDIT LEAN-READS B7: its
 *  bookkeeping is none of the board's, and migration 0137's trigger moves the board on these alone) - and its trader's. */
export const VENDOR_COLUMNS = `l.id, l.kind, l.region, l.material, l.item, l.own, l.bought, l.units, l.price, l.fee, l.wear, l.at, l.expires_at, l.state,
      l.currency, l.seller, d.map_id AS v_map, d.id AS v_id, h.building_key AS v_key, h.owner_name AS v_owner, h.player AS v_player,
      h.char_id AS v_char, h.entry AS v_entry`;
/** VENDOR-BOARD: the board's reads (?1 now, ?2 the region) - the region's newest trader listings, each public house's
 *  newest, the region's patrons of the day (?1 the day's first second) and its next listing to run out (?1 the region). */
export const VENDOR_NEWEST_SQL = `SELECT ${VENDOR_COLUMNS}
    FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
    JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
    WHERE l.state = 'open' AND l.expires_at > ?1 AND l.vendor_id IS NOT NULL AND l.region = ?2 AND h.region = ?2 AND h.player = l.seller AND d.yard = 0
      AND h.guild_id IS NULL AND json_extract(d.place, '$.station') = '${VENDOR_STATION}'
    ORDER BY l.at DESC LIMIT ${VENDOR_BOARD_SHOWN}`;
export const VENDOR_HOUSES_SQL = `SELECT * FROM (SELECT ${VENDOR_COLUMNS},
      ROW_NUMBER() OVER (PARTITION BY d.map_id, d.building_key, d.id ORDER BY l.at DESC, l.id) AS v_rank
    ${PATRON_FROM} WHERE ${PATRON_SQL} AND l.expires_at > ?1 AND l.region = ?2 AND h.region = ?2) WHERE v_rank = 1
    ORDER BY at DESC LIMIT ${VENDOR_BOARD_SHOWN}`;
export const VENDOR_PATRONS_SQL = PATRON_TOLD_SQL('s.region = ?2');
/** VENDOR-BOARD: a board's bounds (?1 the region, ?2 now, ?3 the patrons' day's first second) - its next listing to run
 *  out, the last that ran out by now (idx_market_vendor_expiry, each), and the last patron's sale that left the day
 *  (idx_patron_sales_region): vendorSpan's. */
export const VENDOR_SPAN_SQL = `SELECT (SELECT MIN(expires_at) FROM market_listings WHERE state = 'open' AND vendor_id IS NOT NULL AND region = ?1 AND expires_at > ?2) AS next,
    (SELECT MAX(expires_at) FROM market_listings WHERE state = 'open' AND vendor_id IS NOT NULL AND region = ?1 AND expires_at <= ?2) AS gone,
    (SELECT MAX(at) FROM market_patron_sales WHERE region = ?1 AND at <= ?3) AS told`;
/** VENDOR-BOARD (AUDIT LEAN-READS B1, 2 B5): what a kept board is - its reads, its bounds' and the seconds they span, and
 *  the text it is written as - so a deploy that changes any reads every board again. */
export const VENDOR_BOARD_SHAPE = shapeOf('vendor-board: {newest, houses, patrons} from since to until', VENDOR_NEWEST_SQL, VENDOR_HOUSES_SQL, VENDOR_PATRONS_SQL,
  VENDOR_SPAN_SQL, PATRON_TOLD_S, VENDOR_BOARD_KEPT_S, VENDOR_BOARD_SHOWN);

/**
 * AUDIT LW-II P10: THE DRAW'S SECRET (patronLaw.js patronDraw) - the service's own, derived from a secret it already keeps
 * (`IDENTITY_PRIVATE_KEY`, the identity token's signing key: a SHA-256 of it under this purpose's own words, never the
 * key itself). The same every reckoning, so reckoned late is reckoned on time; '' for a service with no key (the draw
 * then the listing's and the hour's alone).
 * @param {any} env @returns {Promise<string>}
 */
export async function patronSalt(env) {
  const key = typeof env?.IDENTITY_PRIVATE_KEY === 'string' ? env.IDENTITY_PRIVATE_KEY : '';
  if (!key) return '';
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lw15-patron-draw\n${key}`)));
  return Array.from(hash.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** AUDIT LW-II P11: the sale's own guard refusing (realm.js mustChange: its INSERT wrote nothing - sold already, taken
 *  back, the purse full, a ceiling reached, the seller held) - the one failure a patron passes the piece by for. */
export const guardRefused = (/** @type {any} */ e) => /moved = expected/.test(`${e?.message ?? e} ${e?.cause?.message ?? ''}`);

/**
 * LW15: THE PATRONS RECKONED (src/net/patronLaw.js, both ends' law) - each town's traders' listings over the whole hours
 * since they were last reckoned (at most PATRON_RECKON_HOURS): the hour's sales, each its own batch - the piece sold
 * (gone from the realm: no delivery), the 5% tax and the 1% fee burnt, the rest to the seller's held gold (never past
 * MARKET_GOLD_HELD_MAX: a patron passes by a trader whose purse is full), the gold written to the service's own faucet
 * (budget.js, kind `patron`). Keyed by the listing (market_patron_sales): reckoned twice, sold once; reckoned late, the
 * same sales (the dice are the listing's, the hour's and the service's secret's - `env`'s, patronSalt). `maps` the
 * towns to reckon, `region` a region's, else (the hour's cron) the towns waiting, PATRON_CRON_TOWNS of them - the
 * longest waiting first. A read (no `ctx.budget`) runs PATRON_READ_STATEMENTS at most.
 * AUDIT LW-II-2 S3: only while the market is open to EVERYONE (marketOpenFor, no account's) - behind `dev` a developer's
 * read of a region reckoned every seller's towns, their pieces sold and their gold minted while each of their own routes
 * answered 'market-closed' (the hour's cron marks the hours instead: markPatronsShut).
 * @param {any} ctx @param {{ maps?: number[] | null, region?: number | null }} [o] @param {any} [env]
 */
export async function reckonPatrons(ctx, { maps = null, region = null } = {}, env = null) {
  if (!marketOpenFor(null, env)) return { sold: 0, towns: 0 };
  const { nowS } = ctx;
  const tally = { n: 0 };
  const db = ctx.budget ? ctx.db : countedDb(ctx.db, tally);
  const budget = ctx.budget ?? (() => tally.n < PATRON_READ_STATEMENTS);
  const salt = await patronSalt(env);
  const hourNow = Math.floor(nowS / PATRON_HOUR_S);
  let towns = Array.isArray(maps) ? maps.filter((m) => Number.isSafeInteger(m)) : null;
  if (!towns) {
    // AUDIT LW-II P5: the towns waiting LONGEST first - in the map's own order a firing's share reached the same towns
    // every hour, and the rest never (47 of 60 never reckoned in a day)
    const { results = [] } = await db.prepare(`SELECT l.vendor_map AS map ${PATRON_FROM} WHERE ${PATRON_SQL}
      AND COALESCE(l.patron_hour, l.at / ${PATRON_HOUR_S}) < ?1 - 1 ${regionOk(region) ? 'AND h.region = ?2' : ''}
      GROUP BY l.vendor_map ORDER BY MIN(COALESCE(l.patron_hour, l.at / ${PATRON_HOUR_S})), l.vendor_map LIMIT ${PATRON_CRON_TOWNS}`)
      .bind(hourNow, ...(regionOk(region) ? [region] : [])).all();
    towns = results.map((r) => Number(r.map));
  }
  let sold = 0;
  for (const map of towns) {
    if (!budget()) break;   // the share spent: the rest the next
    const { results: rows = [] } = await db.prepare(PATRON_TOWN_SQL).bind(map).all();
    const ls = [];
    for (const r of rows) {
      if (r.bkey == null || r.kind !== 'item') continue;   // no patron sees it: its mark moves, and nothing else
      const item = goodOf(r.item);
      // AUDIT LW-II-2 S8: each listing judged alone - a piece the judge throws on (one listed before a law, read again by
      // it) is passed by, never the reckoning of every town the cron reaches after it (its town waited longest, so the
      // job threw there every firing and no town was reckoned)
      let worth = 0, takes = false, key = null;
      try {
        worth = item ? patronWorth(item, itemWorth) : 0;
        // AUDIT LW-II P3: the item law's re-reading, as a player's buy asks it (marketBuy: a piece listed before the law,
        // or one a later law refuses, is sold to nobody); AUDIT LW-II-2 S5: never a held seller's
        takes = !Number(r.held) && Number(r.cnt) <= 1 && patronTakes(item) && lawfulItem(item) && !goodRefusal(item);
        key = item ? ledgerKeyOf(item) : null;   // AUDIT LW-II-2 S2: the piece the ledger follows
      } catch { worth = 0; takes = false; }
      ls.push({ id: r.id, seller: r.seller, char: r.char_id, price: Number(r.price), at: Number(r.at), expires: Number(r.expires_at), last: r.patron_hour == null ? null : Number(r.patron_hour),
        bkey: Number(r.bkey), worth, takes, key });
    }
    const hours = [...new Set(ls.flatMap((l) => patronHours(l.last, l.at, nowS)))].sort((a, b) => a - b);
    const gone = new Set();
    let partial = false, reached = null;
    try {
      for (const hour of hours) {
        if (!budget()) { partial = true; break; }   // an hour unreckoned stays to reckon: the mark moved to the last whole one
        const open = ls.filter((l) => !gone.has(l.id) && Math.floor(l.at / PATRON_HOUR_S) + 1 <= hour && l.expires >= (hour + 1) * PATRON_HOUR_S && (l.last == null || l.last < hour));
        // AUDIT LW-II P5: the law's dice first - an hour no listing draws under its odds asks the database nothing
        const cands = patronCands(open, hour, salt).map((c) => c.l);
        if (cands.length) {
          const day = utcDay(hour * PATRON_HOUR_S);
          const { results: counts = [] } = await db.prepare(PATRON_COUNTS_SQL).bind(map, hour, day, JSON.stringify([...new Set(cands.map((l) => l.seller))])).all();
          let townN = 0;
          const sellerHour = new Map(), sellerDay = new Map();
          for (const c of counts) {
            if (c.seller == null) townN = Number(c.n ?? 0);
            else { sellerHour.set(c.seller, Number(c.n ?? 0)); sellerDay.set(c.seller, Number(c.g ?? 0)); }
          }
          for (const sale of patronHour(cands, hour, { sold: townN, sellerHour, sellerDay, salt })) {
            const l = /** @type {any} */ (cands.find((x) => x.id === sale.id));
            const { tax, fee, gets } = goldSaleOf(0, sale.price);
            const at = hour * PATRON_HOUR_S + sale.minute * 60;
            // AUDIT LW-II-2 S2: a piece the ledger follows lies in its escrow (INT4 - listed, the market's): the claim standing
            // on it, read for the sale to tell the ledger the piece is gone
            const claim = l.key ? ((await db.prepare("SELECT claim_char FROM item_uids WHERE uid = ?1 AND state = 'escrow'").bind(l.key).first())?.claim_char ?? null) : null;
            try {
              await db.batch([
                // THE DECISION: the listing open at its price, its seller's held gold with room - the sale its own row, once.
                // AUDIT LW-II P1: and THE CEILINGS asked in the write itself - the town's hour, the seller's hour and the
                // seller's day, as the sales stand when it lands (read before it, a region's towns reckoned at once each
                // sold its seller to the ceiling: twelve an hour, 48,337 a day). AUDIT LW-II P4: never a seller the judge
                // holds (realm.js holdRefusal's own: held, or a record no checkpoint has read)
                db.prepare(`INSERT OR IGNORE INTO market_patron_sales (listing, map, hour, minute, seed, seller, char_id, region, price, tax, fee, gets, at, day, building_key)
                  SELECT l.id, ?2, ?3, ?4, ?5, l.seller, l.char_id, l.region, l.price, ?6, ?7, ?8, ?9, ?10, ?13 FROM market_listings l WHERE l.id = ?1 AND l.state = 'open'
                    AND l.price = ?11 AND COALESCE((SELECT gold FROM market_gold WHERE player = l.seller AND char_id = l.char_id), 0) + ?8 <= ?12
                    AND (SELECT COUNT(*) FROM market_patron_sales WHERE map = ?2 AND hour = ?3) < ${PATRON_TOWN_HOUR}
                    AND (SELECT COUNT(*) FROM market_patron_sales WHERE seller = l.seller AND day = ?10 AND hour = ?3) < ${PATRON_SELLER_HOUR}
                    AND (SELECT COALESCE(SUM(price), 0) FROM market_patron_sales WHERE seller = l.seller AND day = ?10) + l.price <= ${PATRON_SELLER_DAY_GOLD}
                    AND NOT ${PATRON_HELD_SQL}`)
                  .bind(l.id, map, hour, sale.minute, sale.seed, tax, fee, gets, at, day, sale.price, MARKET_GOLD_HELD_MAX, l.bkey),
                mustChange(db),
                db.prepare(`UPDATE market_listings SET own = 0, bought = 0, state = 'sold', closed_at = ?2 WHERE id = ?1`).bind(l.id, at),
                db.prepare(`INSERT INTO market_gold (player, char_id, gold) VALUES (?1, ?2, ?3)
                  ON CONFLICT (player, char_id) DO UPDATE SET gold = market_gold.gold + excluded.gold`).bind(l.seller, l.char, gets),
                faucetStatement(db, 'patron', hour, gets),
                // AUDIT LW-II-2 S2: the ledger told - the piece out of the realm, a copy claiming it charged to its claimant
                ...(l.key ? escrowSpentSteps(db, l.key, claim, nowS) : []),
                ...patronActStatements(db, l.seller, map, day),   // TOWN-ECON TE2: the patron's purchase counted at its town, the seller's act
              ]);
              gone.add(l.id);
              sold++;
            } catch (e) {
              // the guard's own: sold already, taken back, the purse full, a ceiling reached, the seller held - the patron
              // passes it by. AUDIT LW-II P11: anything else stops the town here, its hours from this one reckoned again
              if (!guardRefused(e)) throw e;
            }
          }
        }
        reached = hour;
      }
    } catch (e) {
      partial = true;
      console.warn('[patrons] a town\'s reckoning stopped', map, e?.message ?? e);
    }
    // the hours reckoned: each listing still open, to the last whole hour - or, the budget spent (or the reckoning
    // stopped), to the last hour it finished (the next firing goes on from it: a town nobody reads is reckoned through,
    // firing by firing). AUDIT LW-II P5: written only where a mark moves - a read in an hour already reckoned writes nothing
    const mark = partial ? reached : hourNow - 1;
    if (mark != null && rows.some((r) => !gone.has(r.id) && (r.patron_hour == null || Number(r.patron_hour) < mark))) {
      await db.prepare(`UPDATE market_listings SET patron_hour = ?2 WHERE vendor_map = ?1 AND state = 'open' AND vendor_id IS NOT NULL AND currency = 'gold'
        AND (patron_hour IS NULL OR patron_hour < ?2)`).bind(map, mark).run();
    }
  }
  return { sold, towns: towns.length };
}

/** AUDIT LW-II-2 S3: THE HOURS THE MARKET STOOD SHUT - while it is not open to everyone (shut, or its developers' alone)
 *  the hour's cron sells to no patron and MARKS every open trader listing reckoned to the hour it runs in, so the hours
 *  it stood shut are never paid when it opens (shut thirty hours, its first firing after opening paid every one of them:
 *  P8 stopped the selling, not the hours waiting). Answers the listings marked. @param {any} ctx */
export async function markPatronsShut({ db, nowS }) {
  const r = await db.prepare(`UPDATE market_listings SET patron_hour = ?1 WHERE state = 'open' AND kind = 'item' AND vendor_id IS NOT NULL AND currency = 'gold'
    AND (patron_hour IS NULL OR patron_hour < ?1)`).bind(Math.floor(nowS / PATRON_HOUR_S)).run();
  return Number(r?.meta?.changes ?? 0);
}

/** LW15: a town's patrons' purchases told to a reader (the client deals each seed to a resident and draws them coming
 *  in at the house the trader stood in at the sale - AUDIT LW-II P9: the sale's own, never a piece of the same id's):
 *  within PATRON_TOLD_S, newest first - of the towns `maps`, or of a region's (a trader sold out still tells its last
 *  day's). @param {any} db @param {number[] | { region: number }} of @param {number} nowS */
export async function patronsTold(db, of, nowS) {   // AUDIT LW-III: exported for its pin (the read's plan)
  const maps = Array.isArray(of) ? of : null;
  if (maps && !maps.length) return [];
  // AUDIT LW-III: a town's read bounded by the HOUR too (a sale's `at` is its hour's, PATRON_HOUR_S on, so the bound
  // drops none) - idx_patron_sales_town is (map, hour), and the window on `at` alone read every sale the town has kept,
  // MARKET_KEEP_DAYS of them, on every stall opened, to answer its last day's
  const where = maps ? `s.map IN (${maps.map((_, i) => `?${i + 2}`).join(', ')}) AND s.hour >= ?${maps.length + 2}` : 's.region = ?2';
  const since = nowS - PATRON_TOLD_S;
  const { results = [] } = await db.prepare(PATRON_TOLD_SQL(where))
    .bind(since, ...(maps ? [...maps, Math.floor(since / PATRON_HOUR_S)] : [/** @type {{ region: number }} */ (of).region])).all();
  return results.map(patronView);
}
/** A patron's purchase as a reader is told it (patronsTold's rows, VENDOR-BOARD's kept ones). */
export const patronView = (/** @type {any} */ r) => ({ listing: r.listing, map: Number(r.map), vendor: r.vendor_id, buildingKey: r.building_key == null ? null : Number(r.building_key),
  hour: Number(r.hour), minute: Number(r.minute), seed: Number(r.seed), price: Number(r.price), at: Number(r.at), name: String(goodOf(r.item)?.name ?? '') });
