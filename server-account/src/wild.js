// The relay signs a fall, and this service takes the drop off the fallen's judged record and signs a
// `remains` order for the room. Where the room collects, the killer's chosen piece waits in escrow until the
// killer collects it or the fallen reclaims it.
import { verifyWildReceipt, verifyWildCollect, wildFallGraceS, WILD_COLLECT_TTL_S } from '../../src/net/wildReceipt.js';
import { mintRemainsOrder, remainsDigest, ORDER_TTL_S } from '../../src/net/identityToken.js';
import { streamsFoes, WILD_REMAINS_MS } from '../../src/net/wire.js';
import { GUILD_ID_RE } from '../../src/net/guildLaw.js';
import { takeWildDeath, wildDropCandidates, wildTookOf, wildCartRecordOf, wildCartMayBeAway, WILD_FALL_PACKS, WILD_FALL_LETTERS, wildTakesPacks } from '../../src/world/wild/wildDropLaw.js';
import { mintItemId } from '../../src/items/itemIds.js';
import { giveTradeGoods } from '../../src/net/realmTradeLaw.js';
import { prepareRealmRecord, seizeRealmRecord, realmAtOf, realmActFirst, recordMovedOf, mustChange, dropIfUnnamed, dropObjects, realmSaveTextOf, holdRefusal, REALM_ID_RE } from './realm.js';
import { ledgerKeyOf } from './judge.js';
import { piecesBarred, knownCopySteps } from './ledger.js';
import { isFrozen } from './staffFreeze.js';
import { seaKillSteps } from './seaBounty.js';

export const WILD_FALLS_KEEP_S = 2 * 3600;
export const WILD_NONCE_RE = /^[0-9a-f]{16}$/;

export const WILD_ROOM_MAX = 64;
export const WILD_ESCROW_HOLD_S = ORDER_TTL_S + Math.ceil(WILD_REMAINS_MS / 1000);
export const escrowBackAt = (/** @type {number} */ until) => until + WILD_COLLECT_TTL_S;
const parse = (/** @type {any} */ t) => { try { return JSON.parse(t); } catch { return null; } };
const escrowView = (/** @type {any} */ e) => (e ? { r: e.r, until: Number(e.until_s), back: escrowBackAt(Number(e.until_s)), state: e.state, rec: parse(e.rec) } : null);

async function foeFallId(/** @type {SubtleCrypto} */ subtle, /** @type {string} */ charId, /** @type {string} */ nonce) {
  const h = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`wild-foe:${charId}:${nonce}`)));
  return [...h.slice(0, 6)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// The fall's order is issued at `oi` for room `wm` and is the same on every asking, so a drop is never laid twice.
async function answerOf(/** @type {any} */ ctx, /** @type {CryptoKey} */ signing, /** @type {any} */ { r, fallen, killer, records, kept, burnt, killerFirst, wm, oi, wg, tk, seq = null, escrow = null }) {
  let order = null;
  if (!burnt && records.length && wm && ctx.nowS < oi + ORDER_TTL_S) {
    const wh = await remainsDigest(records, { subtle: ctx.subtle });
    order = await mintRemainsOrder({ s: fallen, wr: r, wh, wn: records.length, wm, ...(killerFirst && killer ? { wk: killer, wi: 0, ...(escrow ? { we: 1 } : {}) } : {}), ...(wg ? { wg } : {}) }, signing, { subtle: ctx.subtle, nowS: oi });
  }
  const packs = tk?.gold?.packs && typeof tk.gold.packs === 'object' ? { packs: tk.gold.packs } : {};
  const letters = tk?.gold?.letters && typeof tk.gold.letters === 'object' ? { letters: tk.gold.letters } : {};
  return { r, order, items: records, kept, wi: killerFirst ? 0 : -1, took: Array.isArray(tk?.took) ? tk.took : [], gold: { purse: tk?.gold?.purse ?? 0, cart: tk?.gold?.cart ?? 0, ...packs, ...letters }, ...(burnt ? { burnt: true } : {}), ...(seq != null ? { realm: { seq } } : {}), ...(escrow ? { escrow: escrowView(escrow) } : {}) };
}

/**
 * @param {any} ctx @param {any} player @param {any} body
 * @param {{ gateKey: CryptoKey|null, signing: CryptoKey|null }} keys @param {boolean} [again]
 * @returns {Promise<any>}
 */
export async function wildFall(ctx, player, body, { gateKey, signing }, again = false) {
  if (!signing) return { error: 'no-signing-key' };
  let fallen = player.id, killer = null, charId = null, r = null, w = -1, wt = null, seize = false, sea = null;
  if (body?.receipt !== undefined) {
    if (!gateKey) return { error: 'no-gate-key' };
    const v = await verifyWildReceipt(body.receipt, gateKey, { subtle: ctx.subtle, nowS: ctx.nowS });
    if (!v.ok) return { error: 'receipt', why: v.why };
    const c = v.claims;
    if (player.id !== c.f && player.id !== c.k) return { error: 'not-yours' };
    if (!c.c) return { error: 'no-realm-character' };
    ({ f: fallen, k: killer, c: charId, r, w } = c);
    wt = Array.isArray(c.wt) ? c.wt : null;
    sea = c;
    if (player.id === c.k) {
      if (ctx.nowS < c.i + wildFallGraceS(c)) return { error: 'grace' };
      seize = true;
    }
  } else if (typeof body?.n !== 'string' || !WILD_NONCE_RE.test(body.n)) return { error: 'nonce' };
  if (fallen !== player.id && isFrozen(await ctx.db.prepare('SELECT frozen_until FROM players WHERE id = ?1').bind(fallen).first(), ctx.nowS)) return { error: 'fallen-frozen' };
  const room = typeof body?.room === 'string' && body.room.length <= WILD_ROOM_MAX && streamsFoes(body.room) ? body.room : null;
  if (!room) return { error: 'room' };
  const at = seize ? null : realmAtOf(body?.realm);
  if (!seize && !at) return { error: 'no-realm-character' };
  if (!seize && charId && at.id !== charId) return { error: 'not-yours' };
  charId ??= at.id;
  r ??= await foeFallId(ctx.subtle, charId, body.n);
  const had = await ctx.db.prepare('SELECT player, killer, items, kept, burnt, wi, wm, oi, wg, tk FROM wild_falls WHERE r = ?1').bind(r).first();
  if (had) {
    if (had.player !== fallen) return { error: 'not-yours' };
    const escrow = await ctx.db.prepare('SELECT * FROM wild_escrow WHERE r = ?1').bind(r).first();
    const read = (/** @type {any} */ t, /** @type {any} */ none) => { try { return JSON.parse(t) ?? none; } catch { return none; } };
    const list = (/** @type {any} */ t) => { const v = read(t, []); return Array.isArray(v) ? v : []; };
    let seq = null;
    if (at) {
      const now = await ctx.db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(charId, fallen).first();
      if (now && now.lease === at.lease) seq = now.seq;
    }
    return answerOf(ctx, signing, { r, fallen, killer: had.killer, records: list(had.items), kept: list(had.kept), burnt: had.burnt === 1, killerFirst: had.wi === 0, wm: had.wm, oi: had.oi, wg: had.wg, tk: read(had.tk, {}), seq, escrow });
  }
  if (body?.receipt === undefined) return { error: 'foe' };
  const row = await ctx.db.prepare('SELECT obj, held, judged_seq FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(charId, fallen).first();
  if (!row?.obj || !ctx.bucket) return { error: 'no-realm-character' };
  let stored = null;
  try { stored = JSON.parse(/** @type {string} */ (await realmSaveTextOf(await ctx.bucket.get(row.obj)))); } catch { stored = null; }
  if (!stored || typeof stored !== 'object') return { error: 'no-data' };
  const burnt = !!holdRefusal(row);
  if (burnt) { w = -1; wt = null; }
  const away = !seize && body?.cart === 0 && wildCartMayBeAway(wildCartRecordOf(stored));
  const cart = { cart: !away };
  // A take of companion packs is refused, not shrunk, unless the tab says its game reads packs, so no tab
  // keeps its companions' packs by leaving the word out.
  const packsRead = seize || body?.packs === WILD_FALL_PACKS;
  const letters = seize || body?.letters === WILD_FALL_LETTERS;
  const barred = await piecesBarred(ctx.db, charId, wildDropCandidates(stored, w, wt, cart).map(ledgerKeyOf).filter((k) => k != null));
  const keep = (/** @type {any} */ it) => { const k = ledgerKeyOf(it); return k != null && barred.has(k); };
  /** @type {any} */ let drop = null;
  const collect = body?.collect === 1;
  /** @type {Set<string>} */ const escrowKeys = new Set();
  const change = (/** @type {any} */ save) => {
    drop = takeWildDeath(save, w, keep, wt, { ...cart, letters });
    if (!packsRead && wildTakesPacks(drop)) return 'not-found';
    if (collect && drop.killer) { const k = ledgerKeyOf(drop.taken[0]); if (k != null) escrowKeys.add(k); }
    return null;
  };
  const moved = seize ? await seizeRealmRecord(ctx, fallen, charId, change, { escrow: escrowKeys }) : await prepareRealmRecord(ctx, fallen, /** @type {any} */ (at), change, { escrow: escrowKeys });
  if (moved.error) return moved;
  const escrowed = collect && drop.killer;
  // Each dropped valuable except a crafted piece or the escrowed one gets a fresh id in the remains. Every old id
  // but the escrowed one is recorded as a copy held by the fallen, so no route moves that copy.
  const dropped = [];
  const records = drop.records.map((/** @type {any} */ rec, /** @type {number} */ i) => {
    if (escrowed && i === 0) return rec;
    const key = ledgerKeyOf(drop.taken[i]);
    if (key == null) return rec;
    dropped.push(key);
    return key === drop.taken[i].provenance ? rec : { ...rec, uid: mintItemId(ctx.rand) };
  });
  const kept = [...barred], killerFirst = !burnt && drop.killer;
  const gm = await ctx.db.prepare('SELECT guild_id FROM guild_members WHERE player = ?1 AND char_id = ?2').bind(fallen, charId).first();
  const wg = typeof gm?.guild_id === 'string' && GUILD_ID_RE.test(gm.guild_id) ? gm.guild_id : null;
  const tk = { took: wildTookOf(drop.taken, drop.from), gold: drop.gold };
  const escrow = escrowed ? { r, player: fallen, char_id: charId, killer, rec: JSON.stringify(drop.records[0]), at: ctx.nowS, until_s: ctx.nowS + WILD_ESCROW_HOLD_S, state: 'held' } : null;
  const steps = [
    ...moved.steps,
    ...knownCopySteps(ctx.db, charId, dropped, ctx.nowS),
    ctx.db.prepare('INSERT INTO wild_falls (r, char_id, player, killer, at, items, kept, burnt, wi, wm, oi, wg, tk) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?5, ?11, ?12)')
      .bind(r, charId, fallen, killer, ctx.nowS, JSON.stringify(records), JSON.stringify(kept), burnt ? 1 : 0, killerFirst ? 0 : -1, room, wg, JSON.stringify(tk)),
    // The escrow row is written in the batch that takes the piece off the record, so both land or neither does.
    ...(escrow ? [ctx.db.prepare("INSERT INTO wild_escrow (r, player, char_id, killer, rec, at, until_s, state) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'held')")
      .bind(escrow.r, escrow.player, escrow.char_id, escrow.killer, escrow.rec, escrow.at, escrow.until_s)] : []),
    ...seaKillSteps(ctx.db, sea, ctx.nowS),
  ];
  try { await ctx.db.batch(steps); } catch (e) {
    await dropIfUnnamed(ctx.db, ctx.bucket, fallen, charId, moved.key);
    const now = await ctx.db.prepare('SELECT 1 AS x FROM wild_falls WHERE r = ?1').bind(r).first();
    if (now && !again) return wildFall(ctx, player, body, { gateKey, signing }, true);
    throw e;
  }
  await dropObjects(ctx.bucket, [moved.prev]);
  return answerOf(ctx, signing, { r, fallen, killer, records, kept, burnt, killerFirst, wm: room, oi: ctx.nowS, wg, tk, seq: seize ? null : moved.seq, escrow });
}

// The escrow leaves 'held' in the same batch as the record write and matches one row, so no end lands twice.
/**
 * @param {any} ctx @param {string} playerId @param {{ id: string, lease: string, seq: number }} at @param {any} row
 * @param {'collected' | 'returned'} state
 */
async function endEscrow(ctx, playerId, at, row, state) {
  const item = parse(row.rec);
  if (!item || typeof item !== 'object') return { error: 'no-escrow' };
  const prep = await prepareRealmRecord(ctx, playerId, at, (save) => { giveTradeGoods(save, [item], 0); return null; });
  if (prep.error) return prep;
  try {
    await ctx.db.batch([
      ...prep.steps,
      ctx.db.prepare("UPDATE wild_escrow SET state = ?2, to_char = ?3, ended_at = ?4 WHERE r = ?1 AND state = 'held'").bind(row.r, state, at.id, ctx.nowS),
      mustChange(ctx.db),
    ]);
  } catch (e) {
    if (await dropIfUnnamed(ctx.db, ctx.bucket, playerId, at.id, prep.key)) return { r: row.r, item, realm: { seq: prep.seq } };
    const moved = await recordMovedOf(ctx.db, playerId, at);
    if (moved) return moved;
    const now = await ctx.db.prepare('SELECT state FROM wild_escrow WHERE r = ?1').bind(row.r).first();
    if (now && now.state !== 'held') return { error: 'escrow-moved' };
    throw e;
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return { r: row.r, item, realm: { seq: prep.seq } };
}

/** @param {any} ctx @param {any} player @param {any} body @param {{ gateKey: CryptoKey | null }} keys */
export async function wildCollect(ctx, player, body, { gateKey }) {
  if (!gateKey) return { error: 'no-gate-key' };
  const v = await verifyWildCollect(body?.receipt, gateKey, { subtle: ctx.subtle, nowS: ctx.nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.k !== player.id) return { error: 'not-yours' };
  const side = await realmActFirst(ctx.db, player.id, c.c, body?.realm);
  if (side.error) return side;
  if (!side.at) return { error: 'no-realm-character' };
  const row = await ctx.db.prepare('SELECT * FROM wild_escrow WHERE r = ?1').bind(c.r).first();
  if (!row || row.killer !== player.id) return { error: 'no-escrow' };
  if (row.state === 'collected') return row.to_char === side.at.id ? { r: row.r, item: parse(row.rec), again: true } : { error: 'escrow-collected' };
  if (row.state === 'returned') return { error: 'escrow-returned' };
  if (c.i > Number(row.until_s)) return { error: 'escrow-late' };
  return endEscrow(ctx, player.id, side.at, row, 'collected');
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function wildReclaim(ctx, player, body) {
  const r = typeof body?.r === 'string' && /^[0-9a-f]{12}$/.test(body.r) ? body.r : null;
  if (!r) return { error: 'body' };
  const at = realmAtOf(body?.realm);
  if (!at) return { error: 'no-realm-character' };
  const side = await realmActFirst(ctx.db, player.id, at.id, body.realm);
  if (side.error) return side;
  if (!side.at) return { error: 'no-realm-character' };
  const row = await ctx.db.prepare('SELECT * FROM wild_escrow WHERE r = ?1').bind(r).first();
  if (!row || row.player !== player.id || row.char_id !== side.at.id) return { error: 'no-escrow' };
  if (row.state === 'returned') return { r, item: parse(row.rec), again: true };
  if (row.state === 'collected') return { error: 'escrow-collected' };
  const back = escrowBackAt(Number(row.until_s));
  if (ctx.nowS < back) return { error: 'escrow-wait', wait: back - ctx.nowS };
  return endEscrow(ctx, player.id, side.at, row, 'returned');
}

export async function wildEscrows(ctx, player, body) {
  const id = typeof body?.character === 'string' && REALM_ID_RE.test(body.character) ? body.character : null;
  if (!id) return { error: 'body' };
  const { results = [] } = await ctx.db.prepare("SELECT * FROM wild_escrow WHERE char_id = ?1 AND player = ?2 AND state = 'held' ORDER BY at LIMIT 16").bind(id, player.id).all();
  return { escrows: results.map(escrowView) };
}
