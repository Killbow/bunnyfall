// @ts-check
// BUNNYFALL (2026-11-05): THE GREAT CANNON BY WAYREST, KEPT (src/net/cannonLaw.js says the law). One build the realm gives
// ingots and planks to: what this round holds, who gave what, the Nyx coins a gift pays (counted as the reach's coins are,
// players.nyx_found - server-account/src/nyx.js), and the shot when the build is whole: the round moves on and `fired_at`
// says when, so every game can see it fire. A friends' server: a gift is the game's word, bounded (CANNON_GIVE_MAX) and
// held to what the build still needs.
import { CANNON_NYX_BONUS, CANNON_NEED, CANNON_KEYS, CANNON_VALUE, CANNON_GIVE_MAX, cannonCoins, cannonWhole } from '../../src/net/cannonLaw.js';

async function readBuild(db) {
  const row = (await db.prepare('SELECT round, fired_at FROM cannon WHERE id = 1').first()) ?? { round: 1, fired_at: 0 };
  const round = Number(row.round) || 1;
  const rows = (await db.prepare('SELECT material, n FROM cannon_got WHERE round = ?').bind(round).all())?.results ?? [];
  /** @type {Record<string, number>} */
  const got = {};
  for (const k of CANNON_KEYS) got[k] = 0;
  for (const r of rows) if (r.material in got) got[r.material] = Math.min(CANNON_NEED[r.material], Number(r.n) || 0);
  return { round, firedAt: Number(row.fired_at) || 0, got };
}

/** The build as it stands, and this player's own count: `{ ok, round, firedAt, got, need, mine }`. */
export async function cannonStatus({ db: session, primary }, player) {
  const db = primary ?? session;
  const b = await readBuild(db);
  const me = player?.id ? await db.prepare('SELECT cannon_given, cannon_pts FROM players WHERE id = ?').bind(player.id).first() : null;
  return { ok: true, ...b, need: CANNON_NEED, mine: { given: Number(me?.cannon_given) || 0, toward: Number(me?.cannon_pts) || 0 } };
}

/** A gift: `{ material, n }`. Answers the build after it with `taken` (what the build still needed of it), `coins` paid,
 *  and `fired` when this gift made it whole. */
export async function cannonGive({ db: session, primary, nowS }, player, body) {
  const db = primary ?? session;   // a read-then-store: the binding itself, never a session's replica
  const key = String(body?.material ?? '');
  const n = Math.trunc(Number(body?.n));
  if (!player?.id || !CANNON_KEYS.includes(key) || !(n >= 1 && n <= CANNON_GIVE_MAX)) return { error: 'bad-cannon' };
  let taken = 0, round = 0;
  for (let attempt = 0; attempt < 3 && !taken; attempt++) {
    const b = await readBuild(db);
    round = b.round;
    const room = CANNON_NEED[key] - b.got[key];
    if (room <= 0) return { ok: true, ...(await readBuild(db)), need: CANNON_NEED, taken: 0, coins: 0, fired: false };
    const t = Math.min(n, room);
    await db.prepare('INSERT OR IGNORE INTO cannon_got (round, material, n) VALUES (?1, ?2, 0)').bind(round, key).run();
    const res = await db.prepare('UPDATE cannon_got SET n = n + ?3 WHERE round = ?1 AND material = ?2 AND n + ?3 <= ?4')
      .bind(round, key, t, CANNON_NEED[key]).run();
    if ((res?.meta?.changes ?? 0) > 0) taken = t;
  }
  if (!taken) return { error: 'busy' };
  // the coins: the gift's worth and what was kept toward the next, paid as the reach's coins are counted
  const me = await db.prepare('SELECT cannon_pts FROM players WHERE id = ?').bind(player.id).first();
  const pay = cannonCoins((Number(me?.cannon_pts) || 0) + taken * CANNON_VALUE[key]);
  await db.prepare('UPDATE players SET cannon_pts = ?2, cannon_given = cannon_given + ?3, nyx_found = nyx_found + ?4, last_seen = ?5 WHERE id = ?1')
    .bind(player.id, pay.rest, taken, pay.coins, nowS).run();
  // whole: it fires, and the next one begins (one gift wins the move, by the round it read)
  let fired = false;
  const after = await readBuild(db);
  if (after.round === round && cannonWhole(after.got)) {
    const moved = await db.prepare('UPDATE cannon SET round = round + 1, fired_at = ?2, nyx_bonus = nyx_bonus + ?3 WHERE id = 1 AND round = ?1').bind(round, nowS, CANNON_NYX_BONUS).run();   // and the realm's count its 500
    fired = (moved?.meta?.changes ?? 0) > 0;
  }
  return { ok: true, ...(await readBuild(db)), need: CANNON_NEED, taken, coins: pay.coins, fired };
}
