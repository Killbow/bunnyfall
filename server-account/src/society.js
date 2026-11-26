// BUNNYFALL (2026-11-26, caverns): THE CARTOGRAPHERS' SOCIETY ON THE ACCOUNT SERVICE - the spec's section 9 (the law is
// src/net/mine/societyLaw.js). A registered account's Survey Seals and its wares live on its row (`society_seals`,
// `society_wares`, migration 0222); each character keeps one open contract (`society_contracts`). Nothing here trusts
// the page: an offer taken is checked against the day's offers, a contract turned in takes its ore from the Stores' own
// units (bought ore never counts), and a ware's price and ladder are checked in the very UPDATE that spends the Seals.
//
//   /v1/society          { character }            the desk: Seals, wares, the open contract, the day's offers, Stores held
//   /v1/society/take     { character, ore }       an offered contract taken (one at a time)
//   /v1/society/turnin   { character }            the open contract's ore taken from the Stores, its Seals paid
//   /v1/society/buy      { ware }                 a ware bought with Seals (its title or aura held for good: titles.js)
import { SOCIETY_CONTRACTS, SOCIETY_WARES, societyOffers, societyWaresHeld, societyBuyRefused, SOCIETY_KIT, SOCIETY_KIT_IDS, SOCIETY_KIT_MAX, societySealsFor } from '../../src/net/mine/societyLaw.js';
import { charOk } from './profShared.js';
import { realmAtOf, prepareRealmRecord, dropIfUnnamed, dropObjects, recordMovedOf, realmSaveTextOf } from './realm.js';
import { goldOf } from './judge.js';
/** The save's slot the Bunny guilds keep their books in (src/guilds/bunnyMembership.js BUNNY_GUILDS_VENDOR - not imported: it reads the page's save). */
const BUNNY_GUILDS_VENDOR = 'BunnyGuilds';

const registered = (/** @type {any} */ player) => typeof player?.handle === 'string' && player.handle.length > 0;
const dayOf = (/** @type {number} */ nowS) => Math.floor(nowS / 86400);
const ownOf = async (/** @type {any} */ db, /** @type {string} */ player, /** @type {string} */ character, /** @type {string} */ ore) =>
  Number((await db.prepare("SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND origin = 'own'").bind(player, character, ore).first())?.qty ?? 0);

/** The desk as a character reads it. */
export async function societyState({ db, nowS }, player, { character } = {}) {
  if (!registered(player)) return { error: 'need-account' };
  if (!charOk(character)) return { error: 'character' };
  const row = await db.prepare('SELECT society_seals, society_wares, society_done FROM players WHERE id = ?1').bind(player.id).first();
  const open = await db.prepare('SELECT ore, n, seals FROM society_contracts WHERE player = ?1 AND char_id = ?2').bind(player.id, character).first();
  return {
    seals: Number(row?.society_seals ?? 0), wares: societyWaresHeld(row?.society_wares), done: Number(row?.society_done ?? 0),
    contract: open ? { ore: open.ore, n: Number(open.n), seals: Number(open.seals), held: await ownOf(db, player.id, character, open.ore) } : null,
    offers: open ? [] : societyOffers(character, dayOf(nowS)),
    kit: await kitOf(db, player.id, character),
  };
}

/** An offered contract taken: one of the day's offers, while the character has none open. */
export async function societyTake({ db, nowS }, player, { character, ore } = {}) {
  if (!registered(player)) return { error: 'need-account' };
  if (!charOk(character)) return { error: 'character' };
  const offer = societyOffers(character, dayOf(nowS)).find((o) => o.ore === ore);
  if (!offer) return { error: 'not-offered' };
  const r = await db.prepare('INSERT OR IGNORE INTO society_contracts (player, char_id, ore, n, seals, taken_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(player.id, character, offer.ore, offer.n, offer.seals, nowS).run();
  if (!r?.meta?.changes) return { error: 'has-contract' };
  return { contract: { ore: offer.ore, n: offer.n, seals: offer.seals, held: await ownOf(db, player.id, character, offer.ore) } };
}

/** The open contract turned in: its ore from the Stores' own units, then its Seals. Taken first, so two at once pay once. */
export async function societyTurnIn(ctx, player, { character, realm } = {}) {
  const { db } = ctx;
  if (!registered(player)) return { error: 'need-account' };
  if (!charOk(character)) return { error: 'character' };
  const c = await db.prepare('DELETE FROM society_contracts WHERE player = ?1 AND char_id = ?2 RETURNING ore, n, seals, taken_at').bind(player.id, character).first();
  if (!c) return { error: 'no-contract' };
  const law = SOCIETY_CONTRACTS[/** @type {keyof typeof SOCIETY_CONTRACTS} */ (c.ore)];
  const n = Number(c.n), rank = await societyRankOf(ctx, player.id, realm), seals = societySealsFor(Number(c.seals), rank);   // a member's tenth a rank, read off the record
  const took = law ? await db.prepare("UPDATE prof_stores SET qty = qty - ?4 WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND origin = 'own' AND qty >= ?4")
    .bind(player.id, character, c.ore, n).run() : null;
  if (!took?.meta?.changes) {
    // short: the contract stands again, as it was
    await db.prepare('INSERT OR IGNORE INTO society_contracts (player, char_id, ore, n, seals, taken_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(player.id, character, c.ore, n, Number(c.seals), c.taken_at).run();
    return { error: 'short', held: await ownOf(db, player.id, character, c.ore), n };
  }
  const row = await db.prepare('UPDATE players SET society_seals = society_seals + ?2, society_done = society_done + 1 WHERE id = ?1 RETURNING society_seals').bind(player.id, seals).first();
  return { paid: seals, seals: Number(row?.society_seals ?? 0), ore: c.ore, n, rank };
}

/** A ware bought: its price and its ladder checked against the row, and again in the UPDATE that spends the Seals. */
export async function societyBuy({ db }, player, { ware } = {}) {
  if (!registered(player)) return { error: 'need-account' };
  const row = await db.prepare('SELECT society_seals, society_wares FROM players WHERE id = ?1').bind(player.id).first();
  const held = societyWaresHeld(row?.society_wares), seals = Number(row?.society_seals ?? 0);
  const refused = societyBuyRefused(String(ware ?? ''), held, seals);
  if (refused) return { error: refused };
  const w = SOCIETY_WARES.find((x) => x.id === ware);
  // the row unchanged since it was read (its wares string and enough Seals): two buys at once spend once
  const r = await db.prepare(`UPDATE players SET society_seals = society_seals - ?2, society_wares = TRIM(society_wares || ' ' || ?3)
    WHERE id = ?1 AND society_seals >= ?2 AND society_wares = ?4 RETURNING society_seals, society_wares`).bind(player.id, w.seals, w.id, row?.society_wares ?? '').first();
  if (!r) return { error: 'busy' };
  return { bought: w.id, seals: Number(r.society_seals), wares: societyWaresHeld(r.society_wares) };
}

// ─── THE MINE KIT AND A MEMBER'S RANK (BUNNYFALL 2026-11-26, caverns) ───

/** The character's kit: `{ drill, fuel, lamp, rod }`. */
export async function kitOf(db, player, character) {
  const { results = [] } = await db.prepare('SELECT kit, qty FROM mine_kit WHERE player = ?1 AND char_id = ?2').bind(player, character).all();
  const out = Object.fromEntries(SOCIETY_KIT_IDS.map((k) => [k, 0]));
  for (const r of results) if (SOCIETY_KIT_IDS.includes(r.kit)) out[r.kit] = Number(r.qty);
  return out;
}

/** A member's Society rank, read off its realm record (-1 a visitor, or a record not the caller's). Never written. */
export async function societyRankOf({ db, bucket }, playerId, realmId) {
  if (!bucket || typeof realmId !== 'string' || !realmId) return -1;
  const row = await db.prepare('SELECT obj FROM realm_characters WHERE id = ?1 AND player = ?2').bind(realmId, playerId).first();
  if (!row?.obj) return -1;
  try {
    const save = JSON.parse(await realmSaveTextOf(await bucket.get(row.obj)));
    const rank = save?.modData?.[BUNNY_GUILDS_VENDOR]?.cartographers?.rank;
    return Number.isSafeInteger(rank) && rank >= 0 ? rank : -1;
  } catch { return -1; }
}

/**
 * A kit bought for gold: the realm record's purse paid (the Favor shop's act, tavernFavor.js - the record, the kit and the
 * receipt in one batch), the kit added beside the Stores. `{ txn, kit, ...at }`.
 */
export async function societyKitBuy(ctx, player, body) {
  const { db, bucket, nowS } = ctx;
  const at = realmAtOf(body), kit = SOCIETY_KIT.find((k) => k.id === body?.kit), character = body?.character;
  if (!registered(player)) return { error: 'need-account' };
  if (!at || !kit || !charOk(character) || !/^[A-Za-z0-9_-]{8,80}$/.test(body.txn ?? '')) return { error: 'society-bad' };
  const replay = await db.prepare('SELECT t.result, c.lease, c.seq FROM tavern_service_txns t JOIN realm_characters c ON c.id = t.character WHERE t.character = ? AND t.txn = ? AND c.player = ?')
    .bind(at.id, body.txn, player.id).first();
  if (replay) return replay.lease === at.lease ? { ...JSON.parse(replay.result), realm: { seq: replay.seq }, replayed: true } : { error: 'lease' };
  const held = await kitOf(db, player.id, character);
  if (kit.owned && held[kit.id] > 0) return { error: 'owned' };
  if (!kit.owned && held[kit.id] + kit.per > SOCIETY_KIT_MAX) return { error: 'kit-full' };
  const prep = await prepareRealmRecord(ctx, player.id, at, (record) => {
    const purse = goldOf(record.goldPieces);
    if (purse < kit.gold) return 'gold-short';
    record.goldPieces = purse - kit.gold;
    return null;
  });
  if ('error' in prep) return prep;
  const answer = { ok: true, kit: kit.id, qty: held[kit.id] + kit.per, gold: kit.gold, realm: { seq: prep.seq } };
  try {
    await db.batch([...prep.steps,
      db.prepare('INSERT INTO mine_kit (player, char_id, kit, qty) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (player, char_id, kit) DO UPDATE SET qty = MIN(?5, mine_kit.qty + excluded.qty)')
        .bind(player.id, character, kit.id, kit.per, SOCIETY_KIT_MAX),
      db.prepare('INSERT INTO tavern_service_txns (character, txn, result, at) VALUES (?, ?, ?, ?)').bind(at.id, body.txn, JSON.stringify(answer), nowS)]);
  } catch (error) {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    const changed = await recordMovedOf(db, player.id, at);
    if (changed) return changed;
    throw error;
  }
  await dropObjects(bucket, [prep.prev]);
  return answer;
}

/** One of a spent kit used (a shift's fuel, a lamp): taken only where the character holds one. */
export async function societyKitUse({ db }, player, { character, kit } = {}) {
  if (!registered(player)) return { error: 'need-account' };
  if (!charOk(character) || !SOCIETY_KIT.some((k) => k.id === kit && !k.owned)) return { error: 'society-bad' };
  const r = await db.prepare('UPDATE mine_kit SET qty = qty - 1 WHERE player = ?1 AND char_id = ?2 AND kit = ?3 AND qty >= 1 RETURNING qty').bind(player.id, character, kit).first();
  return r ? { kit, qty: Number(r.qty) } : { error: 'kit-none' };
}
