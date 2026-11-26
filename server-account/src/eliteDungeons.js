// @ts-check
import { ED_SITES_TEXT } from './eliteDungeonSites.js';
import {
  ED_FIGHT_MIN_S, ED_RESUMMON_S, ED_REWARD_NYX, ED_BATCH_MAX, edKey, edKeyOf, edPickSites, edBatchOf, edBatchSlot0, edWantBatch, edSpreadPx,
} from '../../src/net/eliteDungeonLaw.js';
import { contentOn } from '../../src/mods/contentOff.js';

const DAY_S = 86400;
const TOLD_S = DAY_S;

/** @type {Array<{ region: number, location: number, px: number, py: number, name: string }> | null} */
let _sites = null;
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

// Row keys are the batch slots, so a second reader's insert in the same window is ignored.
async function standing(db, nowS) {
  const { batch, day: today, inDay } = edBatchOf(nowS);
  const open = (await db.prepare('SELECT * FROM elite_dungeons WHERE cleared_at IS NULL ORDER BY day, slot').all())?.results ?? [];
  if (!contentOn('eliteDungeons')) return { today, open };
  const lo = edBatchSlot0(inDay), hi = lo + ED_BATCH_MAX;
  if (open.some((r) => Number(r.day) === today && Number(r.slot) >= lo && Number(r.slot) < hi)) return { today, open };
  const done = await db.prepare('SELECT 1 FROM elite_dungeons WHERE day = ? AND slot >= ? AND slot < ? LIMIT 1').bind(today, lo, hi).first();
  if (done) return { today, open };
  const seed = await seedOf(db);
  const want = edWantBatch(batch, seed, open.length);
  if (!want) return { today, open };
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

/** @param {{ db: any, nowS: number }} ctx */
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

/** @param {{ db: any, nowS: number }} ctx */
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

/** @param {{ db: any, nowS: number }} ctx */
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
