// @ts-check
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

export const vendorView = (v, me) => ({ map: Number(v.map_id), id: v.id, buildingKey: Number(v.building_key), region: Number(v.region), owner: v.owner_name, mine: v.player === me });

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
  await reckonPatrons(ctx, { maps: [vend.map] }, env).catch(() => null);
  const { results = [] } = await db.prepare(`SELECT * FROM market_listings WHERE vendor_map = ?1 AND vendor_id = ?2 AND state = 'open'
    AND expires_at > ?3 AND seller = ?4 ORDER BY at DESC LIMIT ${VENDOR_STOCK_SHOWN}`).bind(vend.map, vend.id, nowS, v.player).all();
  const patrons = (await patronsTold(db, [vend.map], nowS).catch(() => [])).filter((p) => p.vendor === vend.id && p.buildingKey === Number(v.building_key));
  return { ok: true, vendor: vendorView(v, player.id), rows: results.map((l) => listingView(l, player.id)), patrons };
}

export async function marketVendors(ctx, player, env, { region, character = null } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { needRid: false, needChar: false });
  if (refused) return refused;
  const closed = shut(player, env);
  if (closed) return closed;
  if (!regionOk(region)) return { error: 'bad-region' };
  const me = typeof character === 'string' && CHAR_ID_RE.test(character) ? character : '';
  // The caller's own rows are read before the board: on a replica session a read after a write
  // waits for that write, and the board may write its row last.
  const [mates, rooms] = me ? await db.batch([
    db.prepare('SELECT a.player, a.char_id FROM guild_members a JOIN guild_members b ON b.guild_id = a.guild_id WHERE b.player = ?1 AND b.char_id = ?2').bind(player.id, me),
    db.prepare(`SELECT map_id, building_key, MAX(until) AS until FROM home_rooms WHERE tenant = ?1 AND tenant_char = ?2 AND until > ?3
      GROUP BY map_id, building_key`).bind(player.id, me, nowS),
  ]) : [null, null];
  const board = await vendorBoard(ctx, region);
  const mate = new Set((mates?.results ?? []).map((/** @type {any} */ m) => m.player));
  const rent = new Map((rooms?.results ?? []).map((/** @type {any} */ r) => [`${r.map_id}:${r.building_key}`, Number(r.until)]));
  const traderOf = (/** @type {any} */ l) => `${l.v_map}:${l.v_key}:${l.v_id}`;
  const shown = new Set(board.newest.map(traderOf));
  const results = [...board.newest, ...board.houses.filter((/** @type {any} */ l) => !shown.has(traderOf(l)))];
  const since = nowS - PATRON_TOLD_S;
  return {
    ok: true, region,
    patrons: board.patrons.filter((/** @type {any} */ r) => Number(r.at) > since).map(patronView),
    rows: results.map((l) => {
      const tenancy = rent.get(`${l.v_map}:${l.v_key}`);
      return listingView(l, player.id, {
        vendor: { map: Number(l.v_map), id: l.v_id }, map: Number(l.v_map), buildingKey: Number(l.v_key), owner: l.v_owner,
        home: { owner: l.v_owner, entry: l.v_entry, mine: l.v_player === player.id,
          ...(l.v_entry === 'guild' && mate.has(l.v_player) ? { guildmate: true } : {}),
          ...(Number.isSafeInteger(tenancy) ? { tenant: tenancy } : {}) },
      });
    }),
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {number} region */
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
  const ver = v?.results?.[0]?.ver;
  const text = JSON.stringify(read);
  if (Number.isSafeInteger(ver) && keptFits(text, 'a region\'s traders')) {
    const { since, until } = vendorSpan(span?.results?.[0], read.patrons.length, nowS);
    await db.prepare(VENDOR_BOARD_KEEP).bind(region, ver, VENDOR_BOARD_SHAPE, nowS, since, until, text).run()
      .catch((/** @type {any} */ e) => console.warn('[market] the region\'s board not kept', e?.message ?? e));
  }
  return read;
}
export const VENDOR_BOARD_READ = `SELECT v.ver, b.built, b.shape, b.since, b.until, b.rows
  FROM (SELECT ?1 AS r) q LEFT JOIN market_vendor_ver v ON v.region = q.r LEFT JOIN market_vendor_boards b ON b.region = q.r`;
// Written only while the region's version is still the one read, so a slow reader never puts an
// older board over a newer one.
export const VENDOR_BOARD_KEEP = `INSERT INTO market_vendor_boards (region, built, shape, since, until, rows)
  SELECT ?1, ?2, ?3, ?5, ?6, ?7 WHERE (SELECT ver FROM market_vendor_ver WHERE region = ?1) = ?2
  ON CONFLICT (region) DO UPDATE SET built = excluded.built, shape = excluded.shape, since = excluded.since, until = excluded.until, rows = excluded.rows
  WHERE NOT (built = excluded.built AND shape IS excluded.shape AND until > ?4)`;
export const VENDOR_BOARD_KEPT_S = 86_400;
/** @param {any} row @param {number} patrons @param {number} nowS */
export function vendorSpan(row, patrons, nowS) {
  const gone = row?.gone == null ? 0 : Number(row.gone);
  const told = patrons < VENDOR_BOARD_SHOWN && row?.told != null ? Number(row.told) + PATRON_TOLD_S : 0;
  return { since: Math.min(nowS, Math.max(0, gone, told)), until: Math.min(Number(row?.next ?? Infinity), nowS + VENDOR_BOARD_KEPT_S) };
}
export function vendorBoardOf(/** @type {unknown} */ text) {
  let o;
  try { o = JSON.parse(String(text)); } catch { return null; }
  return o && Array.isArray(o.newest) && Array.isArray(o.houses) && Array.isArray(o.patrons) ? o : null;
}

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
  await reckonPatrons(ctx, { maps: [...new Set(traders.map((v) => Number(v.map_id)))] }, env).catch(() => null);
  const { results: stock = [] } = await db.prepare(`SELECT * FROM market_listings WHERE seller = ?1 AND char_id = ?2 AND vendor_id IS NOT NULL AND state = 'open'
    AND expires_at > ?3 ORDER BY at DESC LIMIT ${VENDOR_STOCK_SHOWN * 2}`).bind(me, character, nowS).all();
  const { results: sold = [] } = await db.prepare(`SELECT s.listing, s.price, s.total, s.tax, s.tithe, s.fee, s.at, l.item, l.vendor_map, l.vendor_id
    FROM market_sales s JOIN market_listings l ON l.id = s.listing
    WHERE s.seller = ?1 AND l.char_id = ?2 AND l.vendor_id IS NOT NULL ORDER BY s.at DESC LIMIT ${VENDOR_STOCK_SHOWN}`).bind(me, character).all();
  const gold = await db.prepare('SELECT gold FROM market_gold WHERE player = ?1 AND char_id = ?2').bind(me, character).first();
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

export const PATRON_CRON_TOWNS = 40;
export const PATRON_READ_STATEMENTS = 200;
export const PATRON_TOLD_S = 86_400;
export const PATRON_HOME_SQL = `h.entry = 'public' AND h.player = l.seller AND d.yard = 0 AND h.guild_id IS NULL
  AND json_extract(d.place, '$.station') = '${VENDOR_STATION}'`;
export const PATRON_SQL = `l.state = 'open' AND l.vendor_id IS NOT NULL AND l.currency = 'gold' AND l.kind = 'item' AND ${PATRON_HOME_SQL}`;
export const PATRON_FROM = `FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
  JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key`;
export const PATRON_HELD_SQL = `EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = l.char_id AND c.player = l.seller AND (${holdStandsSql('c', "CAST(strftime('%s', 'now') AS INTEGER)")} OR c.judged_seq IS NULL))`;
export const PATRON_TOWN_SQL = `SELECT l.id, l.seller, l.char_id, l.kind, l.price, l.item, l.own + l.bought AS cnt, l.at, l.expires_at, l.patron_hour,
    (SELECT h.building_key FROM home_decor d JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key
      WHERE d.map_id = l.vendor_map AND d.id = l.vendor_id AND ${PATRON_HOME_SQL} LIMIT 1) AS bkey, ${PATRON_HELD_SQL} AS held
  FROM market_listings l WHERE l.vendor_map = ?1 AND l.state = 'open' AND l.vendor_id IS NOT NULL AND l.currency = 'gold'`;
export const PATRON_COUNTS_SQL = `SELECT NULL AS seller, COUNT(*) AS n, 0 AS g FROM market_patron_sales WHERE map = ?1 AND hour = ?2
  UNION ALL SELECT seller, SUM(hour = ?2), SUM(price) FROM market_patron_sales WHERE day = ?3 AND seller IN (SELECT value FROM json_each(?4)) GROUP BY seller`;
export const PATRON_TOLD_SQL = (/** @type {string} */ where) => `SELECT s.listing, s.map, s.hour, s.minute, s.seed, s.price, s.at, s.building_key, l.item, l.vendor_id
  FROM market_patron_sales s JOIN market_listings l ON l.id = s.listing WHERE ${where} AND s.at > ?1 ORDER BY s.at DESC LIMIT ${VENDOR_BOARD_SHOWN}`;

export const VENDOR_COLUMNS = `l.id, l.kind, l.region, l.material, l.item, l.own, l.bought, l.units, l.price, l.fee, l.wear, l.at, l.expires_at, l.state,
      l.currency, l.seller, d.map_id AS v_map, d.id AS v_id, h.building_key AS v_key, h.owner_name AS v_owner, h.player AS v_player,
      h.char_id AS v_char, h.entry AS v_entry`;
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
export const VENDOR_SPAN_SQL = `SELECT (SELECT MIN(expires_at) FROM market_listings WHERE state = 'open' AND vendor_id IS NOT NULL AND region = ?1 AND expires_at > ?2) AS next,
    (SELECT MAX(expires_at) FROM market_listings WHERE state = 'open' AND vendor_id IS NOT NULL AND region = ?1 AND expires_at <= ?2) AS gone,
    (SELECT MAX(at) FROM market_patron_sales WHERE region = ?1 AND at <= ?3) AS told`;
export const VENDOR_BOARD_SHAPE = shapeOf('vendor-board: {newest, houses, patrons} from since to until', VENDOR_NEWEST_SQL, VENDOR_HOUSES_SQL, VENDOR_PATRONS_SQL,
  VENDOR_SPAN_SQL, PATRON_TOLD_S, VENDOR_BOARD_KEPT_S, VENDOR_BOARD_SHOWN);

/** @param {any} env @returns {Promise<string>} */
export async function patronSalt(env) {
  const key = typeof env?.IDENTITY_PRIVATE_KEY === 'string' ? env.IDENTITY_PRIVATE_KEY : '';
  if (!key) return '';
  // Derived from the identity key under its own label, never the key itself, and stable, so a late
  // reckoning draws the same sales.
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lw15-patron-draw\n${key}`)));
  return Array.from(hash.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const guardRefused = (/** @type {any} */ e) => /moved = expected/.test(`${e?.message ?? e} ${e?.cause?.message ?? ''}`);

/** @param {any} ctx @param {{ maps?: number[] | null, region?: number | null }} [o] @param {any} [env] */
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
    const { results = [] } = await db.prepare(`SELECT l.vendor_map AS map ${PATRON_FROM} WHERE ${PATRON_SQL}
      AND COALESCE(l.patron_hour, l.at / ${PATRON_HOUR_S}) < ?1 - 1 ${regionOk(region) ? 'AND h.region = ?2' : ''}
      GROUP BY l.vendor_map ORDER BY MIN(COALESCE(l.patron_hour, l.at / ${PATRON_HOUR_S})), l.vendor_map LIMIT ${PATRON_CRON_TOWNS}`)
      .bind(hourNow, ...(regionOk(region) ? [region] : [])).all();
    towns = results.map((r) => Number(r.map));
  }
  let sold = 0;
  for (const map of towns) {
    if (!budget()) break;
    const { results: rows = [] } = await db.prepare(PATRON_TOWN_SQL).bind(map).all();
    const ls = [];
    for (const r of rows) {
      if (r.bkey == null || r.kind !== 'item') continue;
      const item = goodOf(r.item);
      let worth = 0, takes = false, key = null;
      try {
        worth = item ? patronWorth(item, itemWorth) : 0;
        takes = !Number(r.held) && Number(r.cnt) <= 1 && patronTakes(item) && lawfulItem(item) && !goodRefusal(item);
        key = item ? ledgerKeyOf(item) : null;
      } catch { worth = 0; takes = false; }
      ls.push({ id: r.id, seller: r.seller, char: r.char_id, price: Number(r.price), at: Number(r.at), expires: Number(r.expires_at), last: r.patron_hour == null ? null : Number(r.patron_hour),
        bkey: Number(r.bkey), worth, takes, key });
    }
    const hours = [...new Set(ls.flatMap((l) => patronHours(l.last, l.at, nowS)))].sort((a, b) => a - b);
    const gone = new Set();
    let partial = false, reached = null;
    try {
      for (const hour of hours) {
        if (!budget()) { partial = true; break; }
        const open = ls.filter((l) => !gone.has(l.id) && Math.floor(l.at / PATRON_HOUR_S) + 1 <= hour && l.expires >= (hour + 1) * PATRON_HOUR_S && (l.last == null || l.last < hour));
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
            const claim = l.key ? ((await db.prepare("SELECT claim_char FROM item_uids WHERE uid = ?1 AND state = 'escrow'").bind(l.key).first())?.claim_char ?? null) : null;
            try {
              await db.batch([
                // Keyed by the listing, with the ceilings checked inside the INSERT as the sales stand when it
                // lands, so a town reckoned twice sells once.
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
                ...(l.key ? escrowSpentSteps(db, l.key, claim, nowS) : []),
                ...patronActStatements(db, l.seller, map, day),
              ]);
              gone.add(l.id);
              sold++;
            } catch (e) {
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
    const mark = partial ? reached : hourNow - 1;
    if (mark != null && rows.some((r) => !gone.has(r.id) && (r.patron_hour == null || Number(r.patron_hour) < mark))) {
      await db.prepare(`UPDATE market_listings SET patron_hour = ?2 WHERE vendor_map = ?1 AND state = 'open' AND vendor_id IS NOT NULL AND currency = 'gold'
        AND (patron_hour IS NULL OR patron_hour < ?2)`).bind(map, mark).run();
    }
  }
  return { sold, towns: towns.length };
}

/** @param {any} ctx */
export async function markPatronsShut({ db, nowS }) {
  const r = await db.prepare(`UPDATE market_listings SET patron_hour = ?1 WHERE state = 'open' AND kind = 'item' AND vendor_id IS NOT NULL AND currency = 'gold'
    AND (patron_hour IS NULL OR patron_hour < ?1)`).bind(Math.floor(nowS / PATRON_HOUR_S)).run();
  return Number(r?.meta?.changes ?? 0);
}

/** @param {any} db @param {number[] | { region: number }} of @param {number} nowS */
export async function patronsTold(db, of, nowS) {
  const maps = Array.isArray(of) ? of : null;
  if (maps && !maps.length) return [];
  const where = maps ? `s.map IN (${maps.map((_, i) => `?${i + 2}`).join(', ')}) AND s.hour >= ?${maps.length + 2}` : 's.region = ?2';
  const since = nowS - PATRON_TOLD_S;
  const { results = [] } = await db.prepare(PATRON_TOLD_SQL(where))
    .bind(since, ...(maps ? [...maps, Math.floor(since / PATRON_HOUR_S)] : [/** @type {{ region: number }} */ (of).region])).all();
  return results.map(patronView);
}
export const patronView = (/** @type {any} */ r) => ({ listing: r.listing, map: Number(r.map), vendor: r.vendor_id, buildingKey: r.building_key == null ? null : Number(r.building_key),
  hour: Number(r.hour), minute: Number(r.minute), seed: Number(r.seed), price: Number(r.price), at: Number(r.at), name: String(goodOf(r.item)?.name ?? '') });
