// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): WHAT THE SERVICE KEEPS OF THE GARRISONS - a Company's guard at
// its hall's town and a City Charter's garrison at its capital (migration 0200). The law both ends read is
// src/net/garrisonLaw.js. Each garrison is reckoned on the first read of each UTC day: its soldiers eat out of the
// Company Stores (a Charter's: every member's), the unfed desert, and the soldiers at the front push Rodney's blight back
// (blight.js blightNudge) and lose their tenth.
import { guildActorOf } from './guilds.js';
import { displayName } from './accounts.js';
import { mustChange } from './realm.js';
import { heraldryOfRow } from './halls.js';
import { blightNudge } from './blight.js';
import { GUILD_RANK_OFFICER } from '../../src/net/guild/guildLaw.js';
import { BLIGHT_SECTORS } from '../../src/net/blightLaw.js';
import {
  GARRISON_MAX, RECRUIT_MAX, GARRISON_DAYS_MAX, troopOf, troopsOf, troopTotal, ordersOf, orderedTotal, ordersFit,
  garrisonDay, supplyOf, upkeepOf, supplyDays, marchPushPx,
} from '../../src/net/garrisonLaw.js';

const DAY_S = 86400;
const todayOf = (nowS) => Math.floor(nowS / DAY_S);
const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
const IN_MAX = 20;

/** The Companies whose Stores feed a garrison: its own, or every Company of its Charter. */
async function feedersOf(db, owner) {
  if (owner.startsWith('g:')) return [owner.slice(2)];
  const { results } = await db.prepare('SELECT guild_id FROM city_charter_members WHERE map_id = ?').bind(Number(owner.slice(2))).all();
  return (results ?? []).map((r) => r.guild_id).slice(0, IN_MAX);
}
/** The supplies those Stores hold: `{ have, rows }` - `rows` each `{ rid, supply, qty }`, the cheapest first. */
async function storesOf(db, guildIds) {
  const have = { food: 0, ingots: 0, planks: 0, herbs: 0 };
  /** @type {{ rid: number, supply: string, qty: number }[]} */
  const rows = [];
  if (!guildIds.length) return { have, rows };
  const { results } = await db.prepare(`SELECT rowid AS rid, material, qty FROM guild_prof_stores WHERE qty > 0 AND guild_id IN (${guildIds.map(() => '?').join(',')}) ORDER BY qty DESC`).bind(...guildIds).all();
  for (const r of results ?? []) {
    const s = supplyOf(r.material);
    if (!s) continue;
    have[s] += Number(r.qty);
    rows.push({ rid: Number(r.rid), supply: s, qty: Number(r.qty) });
  }
  return { have, rows };
}

/**
 * RECKON A GARRISON to today: each day since it was last reckoned (GARRISON_DAYS_MAX at most) its soldiers eat, the
 * unfed desert, the march pushes and dies. Claimed by moving its day first, so two readers never reckon it twice.
 * Answers the row as it now stands.
 */
async function reckon(db, row, nowS) {
  const today = todayOf(nowS);
  const days = Math.min(GARRISON_DAYS_MAX, today - Number(row.day));
  if (days <= 0) return row;
  const claim = await db.prepare('UPDATE garrisons SET day = ?1 WHERE owner = ?2 AND day = ?3').bind(today, row.owner, row.day).run();
  if (!claim?.meta?.changes) return await db.prepare('SELECT * FROM garrisons WHERE owner = ?').bind(row.owner).first() ?? row;
  let troops = troopsOf(parse(row.troops));
  let orders = ordersOf(parse(row.orders));
  const { have, rows } = await storesOf(db, await feedersOf(db, row.owner));
  const left = { ...have }, eaten = { food: 0, ingots: 0, planks: 0, herbs: 0 };
  let deserted = 0, lost = 0, pushed = 0;
  for (let d = 0; d < days; d++) {
    const march = orders.march;
    const r = garrisonDay(troops, left, march);
    for (const s of Object.keys(eaten)) { eaten[s] += r.eaten[s]; left[s] -= r.eaten[s]; }
    deserted += r.deserted; lost += r.lost;
    if (march > 0 && Number.isSafeInteger(row.sector)) {
      const px = marchPushPx(march);
      if (await blightNudge(db, nowS, row.sector, px)) pushed += px;
    }
    troops = r.troops;
    orders = ordersFit({ ...orders, march: Math.max(0, march - r.lost) }, troopTotal(troops));
  }
  // what was eaten comes out of the Stores, the fullest rows first
  const take = [];
  for (const s of Object.keys(eaten)) {
    let n = eaten[s];
    for (const x of rows) { if (!n) break; if (x.supply !== s) continue; const k = Math.min(n, x.qty); take.push([x.rid, k]); n -= k; }
  }
  const stmts = take.map(([rid, k]) => db.prepare("UPDATE guild_prof_stores SET qty = qty - ?2, moved_by = 'Garrison', moved_at = ?3 WHERE rowid = ?1 AND qty >= ?2").bind(rid, k, nowS));
  if (take.length) stmts.push(db.prepare(`DELETE FROM guild_prof_stores WHERE qty = 0 AND rowid IN (${take.map(() => '?').join(',')})`).bind(...take.map((t) => t[0])));
  const report = { days, eaten, deserted, lost, pushed: Math.round(pushed * 10) / 10 };
  stmts.push(db.prepare('UPDATE garrisons SET troops = ?2, orders = ?3, report = ?4 WHERE owner = ?1').bind(row.owner, JSON.stringify(troops), JSON.stringify(orders), JSON.stringify(report)));
  await db.batch(stmts);
  return { ...row, day: today, troops: JSON.stringify(troops), orders: JSON.stringify(orders), report: JSON.stringify(report) };
}

/** Where the acting character's Company and Charter keep (or would keep) their garrisons. */
async function placesOf(db, player, character) {
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  const gid = a.me.guild_id;
  const [hall, charter] = await Promise.all([
    db.prepare('SELECT map_id, region FROM homes WHERE guild_id = ?').bind(gid).first(),
    db.prepare('SELECT c.map_id, c.region FROM city_charter_members m JOIN city_charters c ON c.map_id = m.map_id WHERE m.guild_id = ?').bind(gid).first().catch(() => null),
  ]);
  return {
    gid, rank: a.me.rank,
    company: hall ? { owner: `g:${gid}`, mapId: Number(hall.map_id), region: Number(hall.region) } : null,
    charter: charter ? { owner: `c:${Number(charter.map_id)}`, mapId: Number(charter.map_id), region: Number(charter.region) } : null,
  };
}
const kindOf = (owner) => (owner.startsWith('c:') ? 'charter' : 'company');

/** A garrison as its own Companies read it. */
async function viewOf(db, row, place, kind) {
  const troops = row ? troopsOf(parse(row.troops)) : troopsOf({});
  const orders = row ? ordersOf(parse(row.orders)) : ordersOf({});
  const { have } = await storesOf(db, row ? await feedersOf(db, row.owner) : (kind === 'company' ? [place.owner.slice(2)] : await feedersOf(db, place.owner)));
  const days = supplyDays(troops, have);
  return {
    kind, mapId: place.mapId, region: place.region, max: GARRISON_MAX[kind], troops, orders, total: troopTotal(troops),
    have, upkeep: upkeepOf(troops), days: Number.isFinite(days) ? days : null, report: row?.report ? parse(row.report) : null,
    sector: row?.sector ?? null,
  };
}

/**
 * EVERY GARRISON, reckoned to today, as the streets show them (`all`: each town's patrols on their routes, in its
 * owner's colours) - and, for a member, their Company's guard and their Charter's garrison in full (`mine`).
 * @param {{ db: any, nowS: number }} ctx
 */
export async function garrisonsRead({ db, nowS }, player, { character } = {}) {
  const { results } = await db.prepare('SELECT * FROM garrisons').all();
  const rows = [];
  for (const r of results ?? []) rows.push(await reckon(db, r, nowS));
  // the owners still standing: a Company with its hall, a Charter still held - and their colours
  const [halls, charters] = await db.batch([
    db.prepare('SELECT h.guild_id, h.map_id, g.tag, g.heraldry FROM homes h JOIN guilds g ON g.id = h.guild_id WHERE h.guild_id IS NOT NULL'),
    db.prepare('SELECT c.map_id, c.name, g.tag, g.heraldry FROM city_charters c LEFT JOIN guilds g ON g.id = c.founded_by'),
  ]);
  const hallOf = new Map((halls?.results ?? []).map((h) => [`g:${h.guild_id}`, h]));
  const charterOf = new Map((charters?.results ?? []).map((c) => [`c:${Number(c.map_id)}`, c]));
  const all = [];
  for (const r of rows) {
    const o = hallOf.get(r.owner) ?? charterOf.get(r.owner);
    if (!o) continue;
    const arms = heraldryOfRow(o.heraldry);
    const orders = ordersOf(parse(r.orders));
    all.push({ owner: r.owner, kind: kindOf(r.owner), mapId: Number(o.map_id), tag: o.tag ?? null, name: o.name ?? null, field: arms?.field ?? null, border: arms?.border ?? null, routes: orders.routes, march: orders.march, sector: Number.isSafeInteger(r.sector) ? r.sector : null });   // MARCH-ARROWS: how many march and on which slice, for the map's arrows
  }
  let mine = null;
  if (typeof character === 'string' && character) {
    const p = await placesOf(db, player, character).catch(() => null);
    if (p && !('error' in p)) {
      const byOwner = new Map(rows.map((r) => [r.owner, r]));
      mine = {
        command: p.rank <= GUILD_RANK_OFFICER,
        company: p.company ? await viewOf(db, byOwner.get(p.company.owner) ?? null, p.company, 'company') : null,
        charter: p.charter ? await viewOf(db, byOwner.get(p.charter.owner) ?? null, p.charter, 'charter') : null,
      };
    }
  }
  return { ok: true, all, mine };
}

/** The acting Captain's or Officer's place for `which` garrison, or a refusal. */
async function commandOf(db, player, character, which) {
  const p = await placesOf(db, player, character);
  if ('error' in p) return p;
  if (p.rank > GUILD_RANK_OFFICER) return { error: 'garrison-rank' };
  const place = which === 'charter' ? p.charter : which === 'company' ? p.company : null;
  if (!place) return { error: which === 'charter' ? 'garrison-no-charter' : 'garrison-no-hall' };
  return { ...p, place };
}

/**
 * RECRUIT `n` soldiers of `type` into the Company's guard or the Charter's garrison (`which`), paid with gold from the
 * recruiter's Company treasury - up to the garrison's cap.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function garrisonRecruit({ db, nowS }, player, { character, which, type, n } = {}) {
  const t = troopOf(type);
  if (!t || !Number.isSafeInteger(n) || n < 1 || n > RECRUIT_MAX) return { error: 'garrison-bad' };
  const c = await commandOf(db, player, character, which);
  if ('error' in c) return c;
  let row = await db.prepare('SELECT * FROM garrisons WHERE owner = ?').bind(c.place.owner).first();
  if (row) row = await reckon(db, row, nowS);
  const troops = troopsOf(row ? parse(row.troops) : {});
  const kind = kindOf(c.place.owner);
  if (troopTotal(troops) + n > GARRISON_MAX[kind]) return { error: 'garrison-full' };
  troops[t.key] += n;
  const cost = t.gold * n;
  try {
    await db.batch([
      db.prepare(`UPDATE guilds SET treasury = treasury - ?1, realm_gold = MIN(realm_gold, treasury - ?1), moved_by = ?2, moved_at = ?3, moved_kind = 'garrison'
        WHERE id = ?4 AND treasury >= ?1`).bind(cost, displayName(player), nowS, c.gid),
      mustChange(db),
      db.prepare(`INSERT INTO garrisons (owner, map_id, region, day, troops, orders) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT (owner) DO UPDATE SET troops = excluded.troops, map_id = excluded.map_id, region = excluded.region`)
        .bind(c.place.owner, c.place.mapId, c.place.region, row ? Number(row.day) : todayOf(nowS), JSON.stringify(troops), row?.orders ?? JSON.stringify(ordersOf({}))),
    ]);
  } catch { return { error: 'garrison-gold' }; }
  return { ok: true, cost };
}

/**
 * GIVE ORDERS to a garrison: how many walk each route and how many march to the front (`sector` the blight's slice the
 * town faces, the client's measure) - no more than it holds.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function garrisonOrders({ db, nowS }, player, { character, which, routes, march, sector } = {}) {
  const c = await commandOf(db, player, character, which);
  if ('error' in c) return c;
  let row = await db.prepare('SELECT * FROM garrisons WHERE owner = ?').bind(c.place.owner).first();
  if (!row) return { error: 'garrison-empty' };
  row = await reckon(db, row, nowS);
  const o = ordersOf({ routes, march });
  if (orderedTotal(o) > troopTotal(troopsOf(parse(row.troops)))) return { error: 'garrison-too-many' };
  const sec = Number.isSafeInteger(sector) && sector >= 0 && sector < BLIGHT_SECTORS ? sector : row.sector ?? null;
  if (o.march > 0 && sec == null) return { error: 'garrison-no-front' };
  await db.prepare('UPDATE garrisons SET orders = ?2, sector = ?3 WHERE owner = ?1').bind(c.place.owner, JSON.stringify(o), sec).run();
  return { ok: true };
}

