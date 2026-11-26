// @ts-check
import { accountKind, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { seatsOpenFor } from './townSeats.js';
import {
  seatWeekOf, fealtyKingdom, pactUntil, pactBrokenText, SEAT_LEVER_RANKS, SEAT_EDICTS_HOUR, SEAT_RED_S, seasonZeroOf,
} from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const pair = (x, y) => (x < y ? [x, y] : [y, x]);

async function leverActor(db, player, env, character) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  return { gid: a.me.guild_id, me: a.me };
}
const guildByTag = async (db, tag) => (typeof tag === 'string' && tag.length > 0 && tag.length <= 8
  ? (await db.prepare('SELECT id, name, tag FROM guilds WHERE tag = ?').bind(tag).first()) ?? null : null);
async function chartersOf(db, gid) {
  const { results = [] } = await db.prepare('SELECT key, tier, region FROM town_seat_holds WHERE guild_id = ?').bind(gid).all();
  return results.map((h) => ({ key: Number(h.key), tier: h.tier, region: Number(h.region) }));
}
async function pledgedAgainst(db, week, x, y) {
  return !!(await db.prepare(`SELECT 1 FROM town_seat_pledges p JOIN town_seat_holds h ON h.key = p.key
    WHERE p.week = ?1 AND ((p.guild_id = ?2 AND h.guild_id = ?3) OR (p.guild_id = ?3 AND h.guild_id = ?2)) LIMIT 1`).bind(week, x, y).first());
}
const names = async (db, ids) => {
  const { results = [] } = await db.prepare(`SELECT id, name, tag FROM guilds WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
  return new Map(results.map((g) => [g.id, { name: g.name, tag: g.tag }]));
};

/** @param {{db: any, nowS: number}} ctx */
export async function offerFealty({ db, nowS }, player, env, { character, tag, as } = {}) {
  const a = await leverActor(db, player, env, character);
  if ('error' in a) return a;
  if (as !== 'vassal' && as !== 'liege') return { error: 'fealty-unfit' };
  if (await overRate({ db, nowS }, `seat-politics:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const other = await guildByTag(db, tag);
  if (!other) return { error: 'guild-unknown' };
  const [vassal, liege] = as === 'vassal' ? [a.gid, other.id] : [other.id, a.gid];
  if (vassal === liege || !fealtyKingdom(await chartersOf(db, vassal), await chartersOf(db, liege))) return { error: 'fealty-unfit' };
  if (await pledgedAgainst(db, weekAt(nowS), vassal, liege)) return { error: 'fealty-pledged' };
  const r = await db.prepare(`INSERT INTO guild_fealty (vassal, liege, state, offered_by, at) VALUES (?1, ?2, 'offered', ?3, ?4)
    ON CONFLICT (vassal) DO UPDATE SET liege = excluded.liege, offered_by = excluded.offered_by, at = excluded.at WHERE guild_fealty.state = 'offered'`)
    .bind(vassal, liege, a.gid, nowS).run();
  return r?.meta?.changes ? { ok: true } : { error: 'fealty-sworn' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function acceptFealty({ db, nowS }, player, env, { character, tag } = {}) {
  const a = await leverActor(db, player, env, character);
  if ('error' in a) return a;
  const other = await guildByTag(db, tag);
  if (!other) return { error: 'guild-unknown' };
  const row = await db.prepare(`SELECT vassal, liege FROM guild_fealty WHERE state = 'offered' AND offered_by = ?1
    AND ((vassal = ?1 AND liege = ?2) OR (vassal = ?2 AND liege = ?1))`).bind(other.id, a.gid).first();
  if (!row) return { error: 'fealty-none' };
  const liegeHolds = await chartersOf(db, row.liege), vassalHolds = await chartersOf(db, row.vassal);
  if (!fealtyKingdom(vassalHolds, liegeHolds)) return { error: 'fealty-unfit' };
  const week = weekAt(nowS);
  if (await pledgedAgainst(db, week, row.vassal, row.liege)) return { error: 'fealty-pledged' };
  const n = await names(db, [row.vassal, row.liege]);
  const keys = [...liegeHolds.filter((h) => h.tier === 'crown'), ...vassalHolds].map((h) => h.key);
  const r = await db.batch([
    db.prepare("UPDATE guild_fealty SET state = 'sworn', since_week = ?2, at = ?3 WHERE vassal = ?1 AND state = 'offered'").bind(row.vassal, week, nowS),
    // changes() reports the previous statement, so each history row lands only after the one before it wrote.
    ...keys.map((k) => db.prepare("INSERT INTO town_seat_history (key, week, kind, data, at) SELECT ?1, ?2, 'fealty-sworn', ?3, ?4 WHERE changes() > 0")
      .bind(k, week, JSON.stringify({ vassal: n.get(row.vassal), liege: n.get(row.liege) }), nowS)),
  ]);
  return r?.[0]?.meta?.changes ? { ok: true } : { error: 'fealty-none' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function breakFealty({ db, nowS }, player, env, { character, tag = null } = {}) {
  const a = await leverActor(db, player, env, character);
  if ('error' in a) return a;
  const other = tag ? await guildByTag(db, tag) : null;
  if (tag && !other) return { error: 'guild-unknown' };
  const withdrawn = await db.prepare("DELETE FROM guild_fealty WHERE state = 'offered' AND offered_by = ?1 AND (vassal = ?1 OR liege = ?1) AND (?2 IS NULL OR vassal = ?2 OR liege = ?2)")
    .bind(a.gid, other?.id ?? null).run();
  if (withdrawn?.meta?.changes) return { ok: true, withdrawn: true };
  if (other) {
    const declined = await db.prepare(`DELETE FROM guild_fealty WHERE state = 'offered' AND offered_by = ?2
      AND ((vassal = ?1 AND liege = ?2) OR (vassal = ?2 AND liege = ?1))`).bind(a.gid, other.id).run();
    if (declined?.meta?.changes) return { ok: true, declined: true };
  }
  const r = await db.prepare(`UPDATE guild_fealty SET state = 'breaking', broken_by = ?1, at = ?3 WHERE state = 'sworn'
    AND (vassal = ?1 OR (liege = ?1 AND vassal = ?2))`).bind(a.gid, other?.id ?? '', nowS).run();
  return r?.meta?.changes ? { ok: true, breaking: true } : { error: 'fealty-none' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function offerPact({ db, nowS }, player, env, { character, tag } = {}) {
  const a = await leverActor(db, player, env, character);
  if ('error' in a) return a;
  if (await overRate({ db, nowS }, `seat-politics:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const other = await guildByTag(db, tag);
  if (!other) return { error: 'guild-unknown' };
  if (other.id === a.gid) return { error: 'pact-self' };
  const week = weekAt(nowS);
  if (await pledgedAgainst(db, week, a.gid, other.id)) return { error: 'pact-pledged' };
  const until = pactUntil(week, seasonZeroOf(env?.SEASON_ZERO_WEEK));
  const [x, y] = pair(a.gid, other.id);
  const was = await db.prepare('SELECT state, offered_by, until_week FROM guild_pacts WHERE a = ? AND b = ?').bind(x, y).first();
  if (was && was.state === 'signed' && Number(was.until_week) > week) return { error: 'pact-signed' };
  if (was && was.state === 'offered' && was.offered_by === other.id) {
    await db.prepare("UPDATE guild_pacts SET state = 'signed', until_week = ?3, at = ?4 WHERE a = ?1 AND b = ?2 AND state = 'offered'").bind(x, y, until, nowS).run();
    return { ok: true, signed: true, until: until };
  }
  await db.prepare(`INSERT INTO guild_pacts (a, b, state, offered_by, until_week, at) VALUES (?1, ?2, 'offered', ?3, ?4, ?5)
    ON CONFLICT (a, b) DO UPDATE SET state = 'offered', offered_by = excluded.offered_by, until_week = excluded.until_week, at = excluded.at`)
    .bind(x, y, a.gid, until, nowS).run();
  return { ok: true, signed: false };
}

/** @param {{db: any, nowS: number}} ctx */
export async function breakPact({ db, nowS }, player, env, { character, tag } = {}) {
  const a = await leverActor(db, player, env, character);
  if ('error' in a) return a;
  const other = await guildByTag(db, tag);
  if (!other) return { error: 'guild-unknown' };
  const [x, y] = pair(a.gid, other.id);
  const was = await db.prepare('SELECT state, until_week FROM guild_pacts WHERE a = ? AND b = ?').bind(x, y).first();
  if (!was) return { error: 'pact-none' };
  // The rate key is the guild's, so every officer of a guild shares one hour of breaks.
  if (await overRate({ db, nowS }, `seat-pact-break:${a.gid}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const signed = was.state === 'signed' && Number(was.until_week) > weekAt(nowS);
  const n = await names(db, [a.gid, other.id]);
  await db.batch([
    db.prepare('DELETE FROM guild_pacts WHERE a = ? AND b = ?').bind(x, y),
    ...(signed ? [db.prepare('INSERT INTO town_seat_red (text, at) VALUES (?, ?)').bind(pactBrokenText(n.get(a.gid), n.get(other.id)), nowS)] : []),
  ]);
  return { ok: true, announced: signed };
}

export async function politicsOf(db, gid, nowS) {
  const week = weekAt(nowS);
  const { results: f = [] } = await db.prepare(`SELECT f.vassal, f.liege, f.state, f.offered_by, v.tag AS vt, v.name AS vn, l.tag AS lt, l.name AS ln
    FROM guild_fealty f JOIN guilds v ON v.id = f.vassal JOIN guilds l ON l.id = f.liege WHERE f.vassal = ?1 OR f.liege = ?1`).bind(gid).all();
  const { results: p = [] } = await db.prepare(`SELECT p.a, p.b, p.state, p.offered_by, p.until_week, ga.tag AS atag, ga.name AS aname, gb.tag AS btag, gb.name AS bname
    FROM guild_pacts p JOIN guilds ga ON ga.id = p.a JOIN guilds gb ON gb.id = p.b WHERE (p.a = ?1 OR p.b = ?1) AND (p.state = 'offered' OR p.until_week > ?2)`).bind(gid, week).all();
  return {
    fealty: f.map((r) => ({ vassal: { tag: r.vt, name: r.vn }, liege: { tag: r.lt, name: r.ln }, state: r.state, mine: r.offered_by === gid, asVassal: r.vassal === gid })),
    pacts: p.map((r) => ({ with: r.a === gid ? { tag: r.btag, name: r.bname } : { tag: r.atag, name: r.aname }, state: r.state, until: Number(r.until_week), mine: r.offered_by === gid })),
  };
}

export async function bansOf(db, gid, week) {
  const { results: f = [] } = await db.prepare("SELECT vassal, liege FROM guild_fealty WHERE state IN ('sworn', 'breaking') AND (vassal = ?1 OR liege = ?1)").bind(gid).all();
  const { results: p = [] } = await db.prepare("SELECT a, b FROM guild_pacts WHERE state = 'signed' AND until_week > ?2 AND (a = ?1 OR b = ?1)").bind(gid, week).all();
  return {
    liege: f.find((r) => r.vassal === gid)?.liege ?? null,
    vassals: f.filter((r) => r.liege === gid).map((r) => r.vassal),
    pacts: p.map((r) => (r.a === gid ? r.b : r.a)),
  };
}

export const SEAT_RED_MAX = 20;
export async function redOf(db, nowS) {
  return redFrom((await redRead(db, nowS).all()).results);
}
export const redRead = (/** @type {any} */ db, /** @type {number} */ nowS) => db.prepare('SELECT seq, text, at FROM (SELECT seq, text, at FROM town_seat_red WHERE at > ? ORDER BY seq DESC LIMIT ?) ORDER BY seq')
  .bind(nowS - SEAT_RED_S, SEAT_RED_MAX);
export const redFrom = (/** @type {any[]} */ results = []) => results.map((r) => ({ id: Number(r.seq), text: r.text, at: Number(r.at) }));
