// @ts-check
import { keptWorld, dropWorld } from './worldCache.js';
import { guildActorOf } from './guilds.js';
import { displayName } from './accounts.js';
import { mustChange } from './realm.js';
import { heraldryOfRow } from './halls.js';
import { farmInReach } from './territory.js';
import { GUILD_RANK_OFFICER } from '../../src/net/guildLaw.js';
import { FARMS_MAX, FARM_PRICE, FARM_DAYS_MAX, CROP_KEYS, cropMaterial, dayYield } from '../../src/net/farmLaw.js';

const DAY_S = 86400;
const todayOf = (nowS) => Math.floor(nowS / DAY_S);
const STORES_ROW_MAX = 50000;
const mapIdOk = (m) => Number.isSafeInteger(m) && m >= 0 && m <= 0xffffffff;
const nameOk = (n) => typeof n === 'string' && n.length >= 1 && n.length <= 48 && /^[\x20-\x7e]+$/.test(n);
const pixelOf = (p) => (Array.isArray(p) && Number.isSafeInteger(p[0]) && Number.isSafeInteger(p[1]) && p[0] >= 0 && p[0] < 1000 && p[1] >= 0 && p[1] < 500 ? [p[0], p[1]] : [null, null]);
const reachIds = (db, gid) => db.prepare('SELECT (SELECT map_id FROM homes WHERE guild_id = ?1) AS hall, (SELECT map_id FROM city_charter_members WHERE guild_id = ?1) AS cap').bind(gid).first();
// Six nulls unless the farm pixel is valid and the client measured from the hall and Charter capital the service
// holds now.
function pixelsOf(ids, { at, hall, hallMap = null, capital, capMap = null } = {}) {
  const [px, py] = pixelOf(at), [hx, hy] = pixelOf(hall), [cx, cy] = pixelOf(capital);
  const ok = px != null && (hx == null ? null : hallMap) === (ids?.hall ?? null) && (cx == null ? null : capMap) === (ids?.cap ?? null);
  return ok ? [px, py, hx, hy, cx, cy] : Array(6).fill(null);
}

async function reap(db, f, nowS) {
  const today = todayOf(nowS);
  const from = Math.max(Number(f.day), today - FARM_DAYS_MAX);
  if (from >= today) return f;
  // Moving the day first claims the reap, so concurrent reads pay each finished day once.
  const claim = await db.prepare('UPDATE company_farms SET day = ?1 WHERE map_id = ?2 AND day = ?3').bind(today, f.map_id, f.day).run();
  if (!claim?.meta?.changes) return f;
  const { results } = await db.prepare('SELECT day, COUNT(*) AS n FROM company_farm_chores WHERE map_id = ?1 AND day >= ?2 AND day < ?3 GROUP BY day').bind(f.map_id, from, today).all();
  const chores = new Map((results ?? []).map((r) => [Number(r.day), Number(r.n)]));
  /** @type {Map<string, number>} */
  const got = new Map();
  for (let d = from; d < today; d++) {
    const m = cropMaterial(f.crop, d, Number(f.climate), Number(f.region));
    if (m) got.set(m, (got.get(m) ?? 0) + dayYield(f.crop, chores.get(d) ?? 0));
  }
  const stmts = [...got].map(([m, n]) => db.prepare(`INSERT INTO guild_prof_stores (guild_id, material, dep_player, dep_char, qty, moved_by, moved_at) VALUES (?1, ?2, '', '', MIN(?3, ?4), ?5, ?6)
    ON CONFLICT (guild_id, material, dep_player, dep_char) DO UPDATE SET qty = MIN(?4, qty + excluded.qty), moved_by = excluded.moved_by, moved_at = excluded.moved_at`)
    .bind(f.guild_id, m, n, STORES_ROW_MAX, `Farm: ${f.name}`.slice(0, 64), nowS));
  const last = Object.fromEntries(got);
  stmts.push(db.prepare('UPDATE company_farms SET last = ?2 WHERE map_id = ?1').bind(f.map_id, JSON.stringify({ days: today - from, got: last })));
  stmts.push(db.prepare('DELETE FROM company_farm_chores WHERE map_id = ?1 AND day < ?2').bind(f.map_id, today - FARM_DAYS_MAX));
  await db.batch(stmts);
  return { ...f, day: today, last: JSON.stringify({ days: today - from, got: last }) };
}

async function actorOf(db, player, character) {
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  return { gid: a.me.guild_id, rank: a.me.rank, name: String(a.me.name ?? '') };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function farmsRead({ db, nowS }, player, { character, places } = {}) {
  const farmRows = 'SELECT f.*, g.tag, g.heraldry, r.px IS NOT NULL AS placed FROM company_farms f JOIN guilds g ON g.id = f.guild_id LEFT JOIN company_farm_reach r ON r.map_id = f.map_id';
  let read = /** @type {any[]|null} */ (null);
  const all = await keptWorld(db, 'farms', async () => {
    const { results } = await db.prepare(farmRows).all();
    const farms = [];
    for (const f of results ?? []) farms.push(await reap(db, f, nowS));
    read = farms;
    return farms.map((f) => { const arms = heraldryOfRow(f.heraldry); return { mapId: Number(f.map_id), guildId: f.guild_id, tag: f.tag, field: arms?.field ?? null, border: arms?.border ?? null, crop: f.crop }; });
  });
  let mine = null;
  if (typeof character === 'string' && character) {
    const a = await actorOf(db, player, character).catch(() => null);
    if (a && !('error' in a)) {
      const sent = Array.isArray(places) ? places.slice(0, FARMS_MAX).filter((p) => mapIdOk(p?.mapId)) : [];
      try {
        const ids = sent.length ? await reachIds(db, a.gid) : null;
        for (const p of sent) {
          const row = pixelsOf(ids, p);
          if (row[0] == null) continue;
          await db.prepare(`UPDATE company_farm_reach SET px = ?2, py = ?3, hall_px = ?4, hall_py = ?5, cap_px = ?6, cap_py = ?7, reported = 1
            WHERE map_id = ?1 AND px IS NULL AND hall_map IS ?8 AND cap_map IS ?9 AND map_id IN (SELECT map_id FROM company_farms WHERE guild_id = ?10)`)
            .bind(p.mapId, ...row, ids.hall, ids.cap, a.gid).run();
        }
      } catch { }
      const today = todayOf(nowS);
      let own;
      if (read) own = read.filter((f) => f.guild_id === a.gid);
      else {
        const { results: held } = await db.prepare(`${farmRows} WHERE f.guild_id = ?`).bind(a.gid).all();
        own = [];
        for (const f of held ?? []) own.push(await reap(db, f, nowS));
      }
      const { results: done } = own.length ? await db.prepare(`SELECT map_id, account, name FROM company_farm_chores WHERE day = ? AND map_id IN (${own.map(() => '?').join(',')})`).bind(today, ...own.map((f) => f.map_id)).all() : { results: [] };
      mine = {
        command: a.rank <= GUILD_RANK_OFFICER, max: FARMS_MAX, price: FARM_PRICE,
        farms: own.map((f) => {
          const chores = (done ?? []).filter((c) => Number(c.map_id) === Number(f.map_id));
          let last = null;
          try { last = f.last ? JSON.parse(f.last) : null; } catch { last = null; }
          return { mapId: Number(f.map_id), name: f.name, crop: f.crop, region: Number(f.region), chores: chores.map((c) => c.name), choreDone: chores.some((c) => c.account === player.id), today: dayYield(f.crop, chores.length), last, placed: !!f.placed };
        }),
      };
    }
  }
  return { ok: true, all, mine };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function farmBuy({ db, nowS }, player, { character, mapId, name, climate, region, crop = 'food', ...placed } = {}) {
  if (!mapIdOk(mapId) || !nameOk(name) || !Number.isSafeInteger(climate) || !Number.isSafeInteger(region) || region < 0 || region > 61 || !CROP_KEYS.includes(crop)) return { error: 'farm-bad' };
  const a = await actorOf(db, player, character);
  if ('error' in a) return a;
  if (a.rank > GUILD_RANK_OFFICER) return { error: 'farm-rank' };
  if (await db.prepare('SELECT 1 FROM company_farms WHERE map_id = ?').bind(mapId).first()) return { error: 'farm-taken' };
  const n = await db.prepare('SELECT COUNT(*) AS n FROM company_farms WHERE guild_id = ?').bind(a.gid).first();
  if (Number(n?.n ?? 0) >= FARMS_MAX) return { error: 'farm-full' };
  try {
    const ids = await reachIds(db, a.gid);
    await db.batch([
      db.prepare(`UPDATE guilds SET treasury = treasury - ?1, realm_gold = MIN(realm_gold, treasury - ?1), moved_by = ?2, moved_at = ?3, moved_kind = 'farm'
        WHERE id = ?4 AND treasury >= ?1`).bind(FARM_PRICE, displayName(player), nowS, a.gid),
      mustChange(db),
      db.prepare(`INSERT INTO company_farms (map_id, guild_id, name, crop, climate, region, day, bought_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM company_farms WHERE guild_id = ?2) < ?9`)
        .bind(mapId, a.gid, name, crop, climate, region, todayOf(nowS), nowS, FARMS_MAX),
      mustChange(db),
      db.prepare(`INSERT OR REPLACE INTO company_farm_reach (map_id, px, py, hall_px, hall_py, cap_px, cap_py, hall_map, cap_map)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(mapId, ...pixelsOf(ids, placed), ids?.hall ?? null, ids?.cap ?? null),
    ]);
  } catch {
    if (await db.prepare('SELECT 1 FROM company_farms WHERE map_id = ?').bind(mapId).first()) return { error: 'farm-taken' };
    return { error: 'farm-gold' };
  }
  dropWorld(db, 'farms');
  return { ok: true };
}

async function ownFarm(db, player, character, mapId, nowS, command = true) {
  if (!mapIdOk(mapId)) return { error: 'farm-bad' };
  const a = await actorOf(db, player, character);
  if ('error' in a) return a;
  if (command && a.rank > GUILD_RANK_OFFICER) return { error: 'farm-rank' };
  const f = await db.prepare('SELECT * FROM company_farms WHERE map_id = ?').bind(mapId).first();
  if (!f || f.guild_id !== a.gid) return { error: 'farm-not-ours' };
  return { a, f: await reap(db, f, nowS) };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function farmCrop({ db, nowS }, player, { character, mapId, crop } = {}) {
  if (!CROP_KEYS.includes(crop)) return { error: 'farm-bad' };
  const o = await ownFarm(db, player, character, mapId, nowS);
  if ('error' in o) return o;
  // ownFarm reaps first, so the new crop applies from the next day's yield.
  await db.prepare('UPDATE company_farms SET crop = ?2 WHERE map_id = ?1').bind(mapId, crop).run();
  dropWorld(db, 'farms');
  return { ok: true };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function farmRelease({ db, nowS }, player, { character, mapId, lapsed = false } = {}) {
  const o = await ownFarm(db, player, character, mapId, nowS, lapsed !== true);
  if ('error' in o) return o;
  // A lapsed release is refused while the farm is still in reach, or when the reach check fails.
  if (lapsed === true && await farmInReach(db, o.a.gid, mapId, nowS).catch(() => true)) return { error: 'farm-in-reach' };
  await db.batch([
    db.prepare('DELETE FROM company_farms WHERE map_id = ?').bind(mapId),
    db.prepare('DELETE FROM company_farm_chores WHERE map_id = ?').bind(mapId),
    db.prepare('DELETE FROM company_farm_gardens WHERE map_id = ?').bind(mapId),
    db.prepare('DELETE FROM company_farm_garden_work WHERE map_id = ?').bind(mapId),
    db.prepare('DELETE FROM company_farm_reach WHERE map_id = ?').bind(mapId),
  ]);
  dropWorld(db, 'farms');
  return { ok: true };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function farmChore({ db, nowS }, player, { character, mapId } = {}) {
  const o = await ownFarm(db, player, character, mapId, nowS, false);
  if ('error' in o) return o;
  const r = await db.prepare('INSERT OR IGNORE INTO company_farm_chores (map_id, day, account, name) VALUES (?, ?, ?, ?)').bind(mapId, todayOf(nowS), player.id, o.a.name || displayName(player)).run();
  if (!r?.meta?.changes) return { error: 'farm-chore-done' };
  return { ok: true };
}
