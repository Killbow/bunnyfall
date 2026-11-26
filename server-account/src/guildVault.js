// @ts-check
// A piece moves between a realm record and a vault slot in one batch. The batch aborts unless every guarded write
// lands, so a piece is never in both places or in neither.
import { displayName, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { GUILD_OPS_MAX, GUILD_OPS_WINDOW_S, GUILD_RANK_MASTER, guildMay, GUILD_MEMBER_RE } from '../../src/net/guildLaw.js';
import { vaultStanding, vaultMayPut, vaultMayTake, vaultGrantOf, guildVaultSlots, GUILD_VAULT_LOG_SHOWN, GUILD_VAULT_SLOTS, GUILD_VAULT_HALL_SLOTS } from '../../src/net/guildVaultLaw.js';
import { takeTradeGoods, giveTradeGoods, recordCount, REALM_TRADE_RECORD_MAX } from '../../src/net/realmTradeLaw.js';
import { wagonItemName } from '../../src/travel/wagonKinds.js';
import { lawfulItem } from '../../src/items/itemLaw.js';

const DAY_S = 86_400;
const spend = (ctx, player) => overRate(ctx, `guild:${player.id}`, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S);
const standingOf = (m) => vaultStanding(Number(m.rank), m.vault_level == null ? null : { level: m.vault_level, limit: Number(m.vault_limit) });
const takenToday = (m, nowS) => (Number(m.vault_day) === Math.floor(nowS / DAY_S) ? Number(m.vault_taken ?? 0) : 0);
const pieceName = (rec) => String(wagonItemName(rec) ?? rec?.name ?? 'an item').slice(0, 64);
const holdsHall = async (db, gid) => !!(await db.prepare('SELECT 1 FROM homes WHERE guild_id = ?').bind(gid).first());
const SHELVES_SQL = `(${GUILD_VAULT_SLOTS} + CASE WHEN EXISTS (SELECT 1 FROM homes WHERE guild_id = ?1) THEN ${GUILD_VAULT_HALL_SLOTS} ELSE 0 END)`;

/** @param {{ db: any, nowS: number }} ctx */
export async function vaultOf({ db, nowS }, player, { character } = {}) {
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  const gid = a.me.guild_id;
  const { results: rows = [] } = await db.prepare('SELECT slot, rec, name, count, dep_name, at FROM guild_vault WHERE guild_id = ? ORDER BY slot').bind(gid).all();
  const { results: log = [] } = await db.prepare('SELECT at, who, kind, name, count FROM guild_vault_log WHERE guild_id = ? ORDER BY seq DESC LIMIT ?').bind(gid, GUILD_VAULT_LOG_SHOWN).all();
  const me = await db.prepare('SELECT * FROM guild_members WHERE rowid = ?').bind(a.me.rid).first();
  const parse = (/** @type {string} */ t) => { try { return JSON.parse(t); } catch { return null; } };
  return {
    ok: true,
    vault: {
      max: guildVaultSlots(await holdsHall(db, gid)),
      items: rows.map((r) => ({ slot: Number(r.slot), rec: parse(r.rec), name: r.name, count: Number(r.count), by: r.dep_name, at: Number(r.at) })),
      log: log.map((l) => ({ at: Number(l.at), who: l.who, kind: l.kind, name: l.name, count: Number(l.count) })),
      me: { ...standingOf(me ?? a.me), taken: takenToday(me ?? a.me, nowS) },
    },
  };
}

/** @param {any} ctx */
export async function vaultPut(ctx, player, { character, realm = null, pick, item, count = null } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  const gid = a.me.guild_id;
  const me = await db.prepare('SELECT * FROM guild_members WHERE rowid = ?').bind(a.me.rid).first();
  if (!vaultMayPut(standingOf(me ?? a.me))) return { error: 'guild-vault-rank' };
  if (!item || typeof item !== 'object' || Array.isArray(item) || !Number.isSafeInteger(pick) || pick < 0) return { error: 'bad-vault-item' };
  const n = count == null ? recordCount(item) : count;
  if (!Number.isSafeInteger(n) || n < 1 || n > recordCount(item)) return { error: 'bad-vault-count' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const max = guildVaultSlots(await holdsHall(db, gid));
  const { results: held = [] } = await db.prepare('SELECT slot FROM guild_vault WHERE guild_id = ?').bind(gid).all();
  const taken = new Set(held.map((r) => Number(r.slot)));
  let slot = -1;
  for (let i = 0; i < max; i++) if (!taken.has(i)) { slot = i; break; }
  if (slot < 0) return { error: 'guild-vault-full' };
  /** @type {any} */
  let piece = null;
  const offered = { ...item, stackCount: n };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => {
    const moved = takeTradeGoods(save, { items: [offered], gold: 0 }, [pick]);
    if (!moved || moved.length !== 1) return 'vault-goods';
    piece = moved[0];
    return JSON.stringify(piece).length > REALM_TRADE_RECORD_MAX ? 'vault-goods' : null;
  }, { outbound: true, escrow: true });
  if ('error' in prep) return prep;
  const who = displayName(player);
  const name = pieceName(piece);
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`INSERT INTO guild_vault (guild_id, slot, rec, name, count, dep_player, dep_char, dep_name, at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
        WHERE EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?10 AND guild_id = ?1 AND rank = ?11 AND vault_level IS ?12)
          AND ?2 < ${SHELVES_SQL} AND (SELECT COUNT(*) FROM guild_vault WHERE guild_id = ?1) < ${SHELVES_SQL}`)
        .bind(gid, slot, JSON.stringify(piece), name, recordCount(piece), player.id, character, who, nowS, a.me.rid, Number(me?.rank ?? a.me.rank), me?.vault_level ?? null),
      mustChange(db),
      db.prepare("INSERT INTO guild_vault_log (guild_id, at, who, kind, name, count) VALUES (?, ?, ?, 'put', ?, ?)").bind(gid, nowS, who, name, recordCount(piece)),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    const again = await db.prepare('SELECT * FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(a.me.rid, gid).first();
    if (!again || !vaultMayPut(standingOf(again))) return { error: 'guild-vault-rank' };
    const used = Number((await db.prepare('SELECT COUNT(*) AS n FROM guild_vault WHERE guild_id = ?').bind(gid).first())?.n ?? 0);
    if (used >= guildVaultSlots(await holdsHall(db, gid))) return { error: 'guild-vault-full' };
    return { error: 'guild-vault-moved' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, slot, item: piece, realm: { seq: prep.seq } };
}

/** @param {any} ctx */
export async function vaultTake(ctx, player, { character, realm = null, slot, count = null, at = null } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  const gid = a.me.guild_id;
  const me = await db.prepare('SELECT * FROM guild_members WHERE rowid = ?').bind(a.me.rid).first();
  const standing = standingOf(me ?? a.me);
  if (standing.level !== 'withdraw') return { error: 'guild-vault-rank' };
  if (!vaultMayTake(standing, takenToday(me ?? a.me, nowS))) return { error: 'guild-vault-limit' };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= 100) return { error: 'bad-vault-slot' };
  const row = await db.prepare('SELECT * FROM guild_vault WHERE guild_id = ? AND slot = ?').bind(gid, slot).first();
  if (!row || (at != null && Number(row.at) !== at)) return { error: row ? 'guild-vault-moved' : 'guild-vault-empty' };
  const have = Number(row.count);
  const n = count == null ? have : count;
  if (!Number.isSafeInteger(n) || n < 1 || n > have) return { error: 'bad-vault-count' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  /** @type {any} */
  let rec = null;
  try { rec = JSON.parse(row.rec); } catch { rec = null; }
  if (!rec || typeof rec !== 'object') return { error: 'guild-vault-empty' };
  if (!lawfulItem(rec)) return { error: 'vault-goods' };
  const give = { ...rec };
  if (rec.stackCount !== undefined || n > 1) give.stackCount = n;
  const left = have - n;
  const rest = left > 0 ? { ...rec, stackCount: left } : null;
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => { giveTradeGoods(save, [give], 0); return null; });
  if ('error' in prep) return prep;
  const who = displayName(player);
  const day = Math.floor(nowS / DAY_S);
  const limit = standing.limit;
  try {
    // The slot and member row must still match what was read, so a refill or a revoke in between aborts the take.
    await db.batch([
      ...prep.steps,
      rest
        ? db.prepare('UPDATE guild_vault SET rec = ?4, count = ?5 WHERE guild_id = ?1 AND slot = ?2 AND at = ?3 AND count = ?6 AND rec = ?7').bind(gid, slot, Number(row.at), JSON.stringify(rest), left, have, row.rec)
        : db.prepare('DELETE FROM guild_vault WHERE guild_id = ?1 AND slot = ?2 AND at = ?3 AND count = ?4 AND rec = ?5').bind(gid, slot, Number(row.at), have, row.rec),
      mustChange(db),
      db.prepare(`UPDATE guild_members SET vault_taken = CASE WHEN vault_day = ?3 THEN vault_taken + 1 ELSE 1 END, vault_day = ?3
        WHERE rowid = ?1 AND guild_id = ?2 AND (?4 = 0 OR (CASE WHEN vault_day = ?3 THEN vault_taken ELSE 0 END) < ?4)
          AND rank = ?5 AND vault_level IS ?6 AND vault_limit = ?7`).bind(a.me.rid, gid, day, limit, Number(me?.rank ?? a.me.rank), me?.vault_level ?? null, Number(me?.vault_limit ?? 0)),
      mustChange(db),
      db.prepare("INSERT INTO guild_vault_log (guild_id, at, who, kind, name, count) VALUES (?, ?, ?, 'take', ?, ?)").bind(gid, nowS, who, pieceName(rec), n),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    const again = await db.prepare('SELECT * FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(a.me.rid, gid).first();
    if (!again || standingOf(again).level !== 'withdraw') return { error: 'guild-vault-rank' };
    if (!vaultMayTake(standingOf(again), takenToday(again, nowS))) return { error: 'guild-vault-limit' };
    return { error: 'guild-vault-moved' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, slot, item: give, left, realm: { seq: prep.seq } };
}

/** @param {any} ctx */
export async function vaultGrant(ctx, player, { character, member, level = null, limit = null } = {}) {
  const { db } = ctx;
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!guildMay(a.me.rank, 'vaultGrant')) return { error: 'guild-rank' };
  const grant = vaultGrantOf({ level, limit });
  if (!grant) return { error: 'bad-vault-grant' };
  const rid = typeof member === 'string' && GUILD_MEMBER_RE.test(member) ? Number(member.slice(1)) : null;
  if (rid == null) return { error: 'no-member' };
  const t = await db.prepare('SELECT rowid AS rid, rank FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(rid, a.me.guild_id).first();
  if (!t || Number(t.rank) === GUILD_RANK_MASTER) return { error: 'no-member' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const r = await db.prepare(`UPDATE guild_members SET vault_level = ?1, vault_limit = ?2 WHERE rowid = ?3 AND guild_id = ?4 AND rank <> ${GUILD_RANK_MASTER}
      AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?5 AND guild_id = ?4 AND rank = ?6)`)
    .bind(grant.level, grant.limit, rid, a.me.guild_id, a.me.rid, Number(a.me.rank)).run();
  if (!r?.meta?.changes) {
    const still = await db.prepare('SELECT rank FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(a.me.rid, a.me.guild_id).first();
    return { error: still && guildMay(Number(still.rank), 'vaultGrant') ? 'no-member' : 'guild-rank' };
  }
  return { ok: true, member, vault: vaultStanding(Number(t.rank), grant.level == null ? null : grant) };
}
