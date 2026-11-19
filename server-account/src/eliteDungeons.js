// @ts-check
// BUNNYFALL (2026-11-18): WHAT THE SERVICE KEEPS OF THE ELITE DUNGEONS - each batch's picks (3 to 5, one every two hours:
// 2026-11-19) out of its pool of sites (eliteDungeonSites.js, generated from MAPS.BSA), made on the first read of each
// batch (migration 0216; a row's key is `day:slot`, a batch's picks taking five slots of their day); who asked for
// each one's summon; its cleanse and the Dusk Tokens it paid. The law both ends read is src/net/eliteDungeonLaw.js.
//
// THE GUARD (the raids' spirit - a receipt, one claim an instance): a summon is asked by a game that felled the dungeon's
// series (its own count - a friends' server takes the game's word for that); the service keeps who asked (the presence
// rows) and names one summoner at a time. A cleanse is taken only from a player who asked, only ED_FIGHT_MIN_S after the
// summon, only while the dungeon still stands - and only the first one pays: one cleanse an instance, ED_REWARD_NYX on
// that account's Dusk Token count (players.nyx_found, the realm's Nyx counter).
import { ED_SITES_TEXT } from './eliteDungeonSites.js';
import {
  ED_FIGHT_MIN_S, ED_RESUMMON_S, ED_REWARD_NYX, ED_BATCH_MAX, edKey, edKeyOf, edPickSites, edBatchOf, edBatchSlot0, edWantBatch, edSpreadPx,
} from '../../src/net/eliteDungeonLaw.js';
import { contentOn } from '../../src/systems/contentOff.js';

const DAY_S = 86400;
/** Cleansed ones are told for this long (s), so every game can say so. */
const TOLD_S = DAY_S;

/** @type {Array<{ region: number, location: number, px: number, py: number, name: string }> | null} */
let _sites = null;
/** The pool, read once. */
export function edSites() {
  if (_sites) return _sites;
  _sites = [];
  for (const line of ED_SITES_TEXT.split('\n')) {
    const [r, l, x, y, ...name] = line.split('|');
    const row = { region: Number(r), location: Number(l), px: Number(x), py: Number(y), name: name.join('|') };
    if ([row.region, row.location, row.px, row.py].every(Number.isSafeInteger)) _sites.push(row);
  }
  return _sites;
}

async function seedOf(db) {
  let row = await db.prepare('SELECT seed FROM elite_dungeon_seed WHERE id = 1').first();
  if (!row) {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) >>> 0;
    await db.prepare('INSERT OR IGNORE INTO elite_dungeon_seed (id, seed) VALUES (1, ?)').bind(seed).run();
    row = await db.prepare('SELECT seed FROM elite_dungeon_seed WHERE id = 1').first();
  }
  return Number(row?.seed) >>> 0;
}

/** This batch's picks made, where they are not yet (two readers in one window: the rows' keys are the batch's slots, so
 *  the second insert is ignored). A batch the cap leaves empty is tried again on the next read, so a cleansing before its
 *  window ends lets it rise. Answers the standing rows. */
async function standing(db, nowS) {
  const { batch, day: today, inDay } = edBatchOf(nowS);
  const open = (await db.prepare('SELECT * FROM elite_dungeons WHERE cleared_at IS NULL ORDER BY day, slot').all())?.results ?? [];
  if (!contentOn('eliteDungeons')) return { today, open };
  const lo = edBatchSlot0(inDay), hi = lo + ED_BATCH_MAX;
  if (open.some((r) => Number(r.day) === today && Number(r.slot) >= lo && Number(r.slot) < hi)) return { today, open };
  const done = await db.prepare('SELECT 1 FROM elite_dungeons WHERE day = ? AND slot >= ? AND slot < ? LIMIT 1').bind(today, lo, hi).first();
  if (done) return { today, open };   // this batch is picked and every one already cleansed
  const seed = await seedOf(db);
  const want = edWantBatch(batch, seed, open.length);
  if (!want) return { today, open };   // the map is full: nothing rises until something is cleansed
  const sites = edSites();
  const taken = new Set(open.map((r) => Number(r.site)));
  const picks = edPickSites(batch, seed, sites.length, taken, want);
  for (let i = 0; i < picks.length; i++) {
    const s = sites[picks[i]];
    await db.prepare('INSERT OR IGNORE INTO elite_dungeons (key, day, slot, site, region, location, px, py, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(edKey(today, lo + i), today, lo + i, picks[i], s.region, s.location, s.px, s.py, s.name).run();
  }
  const again = (await db.prepare('SELECT * FROM elite_dungeons WHERE cleared_at IS NULL ORDER BY day, slot').all())?.results ?? [];
  return { today, open: again };
}

const rowOut = (r, today) => ({ key: r.key, region: Number(r.region), location: Number(r.location), px: Number(r.px), py: Number(r.py), name: String(r.name ?? ''), spread: edSpreadPx(Number(r.day), today) });

/**
 * THE BOOK: `{ ok, day, list, cleansed }` - every elite dungeon standing (with its spread today), and those cleansed in
 * the last day (`{ key, name, by }`).
 * @param {{ db: any, nowS: number }} ctx
 */
export async function eliteDungeonsRead({ db, nowS }) {
  const { today, open } = await standing(db, nowS);
  const told = (await db.prepare('SELECT e.key, e.name, COALESCE(p.handle, p.guest_name, \'\') AS by FROM elite_dungeons e LEFT JOIN players p ON p.id = e.cleared_by WHERE e.cleared_at >= ? ORDER BY e.cleared_at DESC LIMIT 32')
    .bind(nowS - TOLD_S).all().catch(() => null))?.results ?? [];
  return { ok: true, day: today, list: open.map((r) => rowOut(r, today)), cleansed: told.map((r) => ({ key: r.key, name: String(r.name ?? ''), by: String(r.by ?? '').slice(0, 32) })) };
}

async function openRow(db, key) {
  if (!edKeyOf(key)) return null;
  return db.prepare('SELECT * FROM elite_dungeons WHERE key = ?').bind(key).first();
}

/**
 * THE SUMMON: a game felled `key`'s series. Kept as this account's presence; answers `{ ok, summon }` - true when this
 * game is to stand her (no summoner yet, or the last one's summon went ED_RESUMMON_S unanswered), false when another's
 * has (or will). Refused for a dungeon not standing.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function eliteDungeonSummon({ db, nowS }, player, { key } = {}) {
  if (!player?.id) return { error: 'ed-need-account' };
  const row = await openRow(db, key);
  if (!row) return { error: 'ed-unknown' };
  if (row.cleared_at != null) return { error: 'ed-cleansed' };
  await db.prepare('INSERT INTO elite_dungeon_presence (key, account, at) VALUES (?, ?, ?) ON CONFLICT (key, account) DO UPDATE SET at = excluded.at').bind(key, player.id, nowS).run();
  const r = await db.prepare('UPDATE elite_dungeons SET summoned_at = ?1, summoner = ?2 WHERE key = ?3 AND cleared_at IS NULL AND (summoned_at IS NULL OR summoned_at <= ?4 OR summoner = ?2)')
    .bind(nowS, player.id, key, nowS - ED_RESUMMON_S).run();
  return { ok: true, summon: !!r?.meta?.changes };
}

/**
 * THE CLEANSE: Sifrit fell in `key`. Taken from a player who asked for the summon, ED_FIGHT_MIN_S after it, the dungeon
 * still standing; the first pays ED_REWARD_NYX onto this account's Dusk Tokens. Answers `{ ok, cleansed, nyx }` (`nyx` the
 * reward, 0 for a repeat - `repeat` true) or a refusal.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function eliteDungeonClear({ db, nowS }, player, { key } = {}) {
  if (!player?.id) return { error: 'ed-need-account' };
  const row = await openRow(db, key);
  if (!row) return { error: 'ed-unknown' };
  if (row.cleared_at != null) return { ok: true, cleansed: true, repeat: true, nyx: 0 };
  const here = await db.prepare('SELECT at FROM elite_dungeon_presence WHERE key = ? AND account = ?').bind(key, player.id).first();
  if (!here) return { error: 'ed-not-present' };
  if (row.summoned_at == null || Number(row.summoned_at) > nowS - ED_FIGHT_MIN_S) return { error: 'ed-too-soon' };
  const r = await db.prepare('UPDATE elite_dungeons SET cleared_at = ?1, cleared_by = ?2 WHERE key = ?3 AND cleared_at IS NULL').bind(nowS, player.id, key).run();
  if (!r?.meta?.changes) return { ok: true, cleansed: true, repeat: true, nyx: 0 };
  await db.prepare('UPDATE players SET nyx_found = nyx_found + ?2 WHERE id = ?1').bind(player.id, ED_REWARD_NYX).run();
  return { ok: true, cleansed: true, nyx: ED_REWARD_NYX, name: String(row.name ?? '') };
}
