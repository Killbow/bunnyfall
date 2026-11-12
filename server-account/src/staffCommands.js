// @ts-check
// BUNNYFALL STAFF COMMANDS (2026-11-12, the owner: "a vanish to disappear from both players and enemies, a spawn command
// to spawn enemies and a greed command to give gold to players or nyx coins") - the account service's half. Staff are the
// accounts staff.js staffRole names (an Admin - DEVELOPER_HANDLES - or a Moderator); /greed is an Admin's alone.
//
//   /vanish   vanishSet: the account's switch (players.vanish_on, migration 0202). While it is on, the game's ordinary
//             token carries the vanish mark (`vn`, index.js /v1/auth/token): the relay passes it on the join and every game
//             leaves the player undrawn and untargeted, while the socket plays on as any other - the monsters' sync and
//             everything else unchanged.
//   /spawn    the game's own (scenes/world.js): staff-only, asked of `vanishSet`'s answer's `staff` - nothing here.
//   /greed    greedGive: gold and Nyx coins kept for a player (staff_gifts) until their game takes them (greedClaim) -
//             the gold into the character's purse, the coins into the pack; the account's Nyx count and the character's
//             wealth allowance move with them, so neither the Nyx titles nor the integrity measure miss them.
import { staffRole } from './staff.js';
import { displayName } from './accounts.js';

export const GREED_GOLD_MAX = 1_000_000;
export const GREED_NYX_MAX = 1_000;
/** The gifts one claim reads at most. */
const OPEN_MAX = 20;

/** Whether this account is staff, and an Admin. */
export function staffOf(player, env) {
  const role = staffRole(player, env);
  return { staff: !!role, admin: role === 'admin', role };
}

/**
 * THE STAFF MEMBER'S OWN STANDING (`{ staff, admin, vanished }`) - and, with `on` a boolean, /vanish turned on or off.
 * @param {{ db: any }} ctx
 */
export async function vanishSet({ db }, player, env, { on } = {}) {
  const s = staffOf(player, env);
  if (!s.staff) return { error: 'staff-only' };
  if (typeof on === 'boolean') await db.prepare('UPDATE players SET vanish_on = ? WHERE id = ?').bind(on ? 1 : 0, player.id).run();
  const r = await db.prepare('SELECT vanish_on FROM players WHERE id = ?').bind(player.id).first();
  return { ok: true, staff: true, admin: s.admin, vanished: Number(r?.vanish_on ?? 0) === 1 };
}

/** The account a name names: a handle first (any case), then a realm character's name - or null. */
async function accountByName(db, name) {
  const n = String(name ?? '').trim();
  if (!n || n.length > 40) return null;
  const byHandle = await db.prepare('SELECT id, handle FROM players WHERE lower(handle) = lower(?)').bind(n).first();
  if (byHandle) return { id: byHandle.id, name: byHandle.handle };
  const byChar = await db.prepare('SELECT player, name FROM realm_characters WHERE lower(name) = lower(?) ORDER BY updated_at DESC LIMIT 1').bind(n).first();
  return byChar ? { id: byChar.player, name: byChar.name } : null;
}

/**
 * /greed: `gold` and `nyx` kept for the player `to` names (a handle or a character's name; `me` the sender). An Admin's.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function greedGive({ db, nowS }, player, env, { to, gold = 0, nyx = 0 } = {}) {
  if (!staffOf(player, env).admin) return { error: 'staff-admin' };
  const g = Number.isSafeInteger(gold) ? gold : -1, c = Number.isSafeInteger(nyx) ? nyx : -1;
  if (g < 0 || c < 0 || g > GREED_GOLD_MAX || c > GREED_NYX_MAX || g + c === 0) return { error: 'greed-amount' };
  const who = String(to ?? '').toLowerCase() === 'me' ? { id: player.id, name: displayName(player) } : await accountByName(db, to);
  if (!who) return { error: 'greed-no-player' };
  await db.prepare('INSERT INTO staff_gifts (to_account, gold, nyx, from_name, at) VALUES (?, ?, ?, ?, ?)').bind(who.id, g, c, displayName(player), nowS).run();
  return { ok: true, to: who.name, gold: g, nyx: c };
}

/**
 * The gifts waiting for this account, oldest first.
 * @param {{ db: any }} ctx
 */
export async function greedMine({ db }, player) {
  const { results } = await db.prepare('SELECT id, gold, nyx, from_name FROM staff_gifts WHERE to_account = ? AND claimed_at IS NULL ORDER BY id LIMIT ?').bind(player.id, OPEN_MAX).all();
  return { ok: true, gifts: (results ?? []).map((r) => ({ id: Number(r.id), gold: Number(r.gold), nyx: Number(r.nyx), from: r.from_name })) };
}

/**
 * TAKE A GIFT (its `id`), once: answers its gold and coins for the game to put in the purse and the pack. The account's Nyx
 * count rises by the coins, and the playing character's wealth allowance by the gold.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function greedClaim({ db, nowS }, player, { id } = {}) {
  if (!Number.isSafeInteger(id)) return { error: 'greed-bad' };
  const g = await db.prepare('SELECT gold, nyx, from_name FROM staff_gifts WHERE id = ? AND to_account = ? AND claimed_at IS NULL').bind(id, player.id).first();
  if (!g) return { error: 'greed-gone' };
  const [took] = await db.batch([
    db.prepare('UPDATE staff_gifts SET claimed_at = ? WHERE id = ? AND to_account = ? AND claimed_at IS NULL').bind(nowS, id, player.id),
    db.prepare('UPDATE players SET nyx_found = nyx_found + ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM staff_gifts WHERE id = ?3 AND claimed_at = ?4)').bind(player.id, Number(g.nyx), id, nowS),
    db.prepare('UPDATE realm_characters SET allowance = allowance + ?2 WHERE player = ?1 AND lease IS NOT NULL AND allowance IS NOT NULL AND dead_at IS NULL AND EXISTS (SELECT 1 FROM staff_gifts WHERE id = ?3 AND claimed_at = ?4)').bind(player.id, Number(g.gold), id, nowS),
  ]);
  if (!took?.meta?.changes) return { error: 'greed-gone' };
  return { ok: true, id, gold: Number(g.gold), nyx: Number(g.nyx), from: g.from_name };
}
