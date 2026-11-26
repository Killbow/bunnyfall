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
import { SOCIETY_CONTRACTS, SOCIETY_WARES, societyOffers, societyWaresHeld, societyBuyRefused } from '../../src/net/mine/societyLaw.js';
import { charOk } from './profShared.js';

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
export async function societyTurnIn({ db }, player, { character } = {}) {
  if (!registered(player)) return { error: 'need-account' };
  if (!charOk(character)) return { error: 'character' };
  const c = await db.prepare('DELETE FROM society_contracts WHERE player = ?1 AND char_id = ?2 RETURNING ore, n, seals, taken_at').bind(player.id, character).first();
  if (!c) return { error: 'no-contract' };
  const law = SOCIETY_CONTRACTS[/** @type {keyof typeof SOCIETY_CONTRACTS} */ (c.ore)];
  const n = Number(c.n), seals = Number(c.seals);
  const took = law ? await db.prepare("UPDATE prof_stores SET qty = qty - ?4 WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND origin = 'own' AND qty >= ?4")
    .bind(player.id, character, c.ore, n).run() : null;
  if (!took?.meta?.changes) {
    // short: the contract stands again, as it was
    await db.prepare('INSERT OR IGNORE INTO society_contracts (player, char_id, ore, n, seals, taken_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(player.id, character, c.ore, n, seals, c.taken_at).run();
    return { error: 'short', held: await ownOf(db, player.id, character, c.ore), n };
  }
  const row = await db.prepare('UPDATE players SET society_seals = society_seals + ?2, society_done = society_done + 1 WHERE id = ?1 RETURNING society_seals').bind(player.id, seals).first();
  return { paid: seals, seals: Number(row?.society_seals ?? 0), ore: c.ore, n };
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
