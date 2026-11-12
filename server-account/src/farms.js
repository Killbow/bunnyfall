// @ts-check
// BUNNYFALL COMPANIES (2026-11-12): WHAT THE SERVICE KEEPS OF THE COMPANY FARMS (migration 0201) - who holds which farm,
// its crop, the chores done there, and each finished day's yield put into the Company Stores on the first read after it.
// The law both ends read is src/net/farmLaw.js. The farm's place (inside the territory, the player standing at it for a
// chore) is the client's word: the service knows no map - a friends' server.
import { guildActorOf } from './guilds.js';
import { displayName } from './accounts.js';
import { mustChange } from './realm.js';
import { heraldryOfRow } from './halls.js';
import { GUILD_RANK_OFFICER } from '../../src/net/guild/guildLaw.js';
import { FARMS_MAX, FARM_PRICE, FARM_DAYS_MAX, CROP_KEYS, cropMaterial, dayYield } from '../../src/net/farmLaw.js';

const DAY_S = 86400;
const todayOf = (nowS) => Math.floor(nowS / DAY_S);
const STORES_ROW_MAX = 50000;
const mapIdOk = (m) => Number.isSafeInteger(m) && m >= 0 && m <= 0xffffffff;
const nameOk = (n) => typeof n === 'string' && n.length >= 1 && n.length <= 48 && /^[\x20-\x7e]+$/.test(n);

/**
 * REAP A FARM to today: each finished day since it was last reaped (FARM_DAYS_MAX at most) its yield - more for each
 * chore done there that day - goes into its Company's Stores. Claimed by moving its day first.
 */
async function reap(db, f, nowS) {
  const today = todayOf(nowS);
  const from = Math.max(Number(f.day), today - FARM_DAYS_MAX);
  if (from >= today) return f;
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

/** The acting character's Company and rank, or a refusal. */
async function actorOf(db, player, character) {
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  return { gid: a.me.guild_id, rank: a.me.rank, name: String(a.me.name ?? '') };
}

/**
 * EVERY FARM, reaped to today, as the maps show them (`all`: each farm's place and its Company's colours) - and for a
 * member their Company's farms in full (`mine`: crop, today's chores, the last harvest).
 * @param {{ db: any, nowS: number }} ctx
 */
export async function farmsRead({ db, nowS }, player, { character } = {}) {
  const { results } = await db.prepare('SELECT f.*, g.tag, g.heraldry FROM company_farms f JOIN guilds g ON g.id = f.guild_id').all();
  const farms = [];
  for (const f of results ?? []) farms.push(await reap(db, f, nowS));
  const all = farms.map((f) => { const arms = heraldryOfRow(f.heraldry); return { mapId: Number(f.map_id), guildId: f.guild_id, tag: f.tag, field: arms?.field ?? null, border: arms?.border ?? null, crop: f.crop }; });
  let mine = null;
  if (typeof character === 'string' && character) {
    const a = await actorOf(db, player, character).catch(() => null);
    if (a && !('error' in a)) {
      const today = todayOf(nowS);
      const own = farms.filter((f) => f.guild_id === a.gid);
      const { results: done } = own.length ? await db.prepare(`SELECT map_id, account, name FROM company_farm_chores WHERE day = ? AND map_id IN (${own.map(() => '?').join(',')})`).bind(today, ...own.map((f) => f.map_id)).all() : { results: [] };
      mine = {
        command: a.rank <= GUILD_RANK_OFFICER, max: FARMS_MAX, price: FARM_PRICE,
        farms: own.map((f) => {
          const chores = (done ?? []).filter((c) => Number(c.map_id) === Number(f.map_id));
          let last = null;
          try { last = f.last ? JSON.parse(f.last) : null; } catch { last = null; }
          return { mapId: Number(f.map_id), name: f.name, crop: f.crop, region: Number(f.region), chores: chores.map((c) => c.name), choreDone: chores.some((c) => c.account === player.id), today: dayYield(f.crop, chores.length), last };
        }),
      };
    }
  }
  return { ok: true, all, mine };
}

/**
 * BUY A FARM at `mapId` (its `name`, `climate`, `region` - the map's, as the client reads them) for the Company, with
 * treasury gold, growing `crop`.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function farmBuy({ db, nowS }, player, { character, mapId, name, climate, region, crop = 'food' } = {}) {
  if (!mapIdOk(mapId) || !nameOk(name) || !Number.isSafeInteger(climate) || !Number.isSafeInteger(region) || region < 0 || region > 61 || !CROP_KEYS.includes(crop)) return { error: 'farm-bad' };
  const a = await actorOf(db, player, character);
  if ('error' in a) return a;
  if (a.rank > GUILD_RANK_OFFICER) return { error: 'farm-rank' };
  if (await db.prepare('SELECT 1 FROM company_farms WHERE map_id = ?').bind(mapId).first()) return { error: 'farm-taken' };
  const n = await db.prepare('SELECT COUNT(*) AS n FROM company_farms WHERE guild_id = ?').bind(a.gid).first();
  if (Number(n?.n ?? 0) >= FARMS_MAX) return { error: 'farm-full' };
  try {
    await db.batch([
      db.prepare(`UPDATE guilds SET treasury = treasury - ?1, realm_gold = MIN(realm_gold, treasury - ?1), moved_by = ?2, moved_at = ?3, moved_kind = 'farm'
        WHERE id = ?4 AND treasury >= ?1`).bind(FARM_PRICE, displayName(player), nowS, a.gid),
      mustChange(db),
      db.prepare(`INSERT INTO company_farms (map_id, guild_id, name, crop, climate, region, day, bought_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM company_farms WHERE guild_id = ?2) < ?9`)
        .bind(mapId, a.gid, name, crop, climate, region, todayOf(nowS), nowS, FARMS_MAX),
      mustChange(db),
    ]);
  } catch {
    if (await db.prepare('SELECT 1 FROM company_farms WHERE map_id = ?').bind(mapId).first()) return { error: 'farm-taken' };
    return { error: 'farm-gold' };
  }
  return { ok: true };
}

/** The acting Captain's or Officer's farm at `mapId`, reaped - or a refusal. */
async function ownFarm(db, player, character, mapId, nowS, command = true) {
  if (!mapIdOk(mapId)) return { error: 'farm-bad' };
  const a = await actorOf(db, player, character);
  if ('error' in a) return a;
  if (command && a.rank > GUILD_RANK_OFFICER) return { error: 'farm-rank' };
  const f = await db.prepare('SELECT * FROM company_farms WHERE map_id = ?').bind(mapId).first();
  if (!f || f.guild_id !== a.gid) return { error: 'farm-not-ours' };
  return { a, f: await reap(db, f, nowS) };
}

/**
 * CHANGE A FARM'S CROP (from tomorrow's yield on - today's is reaped as it was).
 * @param {{ db: any, nowS: number }} ctx
 */
export async function farmCrop({ db, nowS }, player, { character, mapId, crop } = {}) {
  if (!CROP_KEYS.includes(crop)) return { error: 'farm-bad' };
  const o = await ownFarm(db, player, character, mapId, nowS);
  if ('error' in o) return o;
  await db.prepare('UPDATE company_farms SET crop = ?2 WHERE map_id = ?1').bind(mapId, crop).run();
  return { ok: true };
}

/**
 * LET A FARM GO (no gold back) - a Captain's or an Officer's choice, or (`lapsed`) any member's client finding that the
 * territory no longer reaches it.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function farmRelease({ db, nowS }, player, { character, mapId, lapsed = false } = {}) {
  const o = await ownFarm(db, player, character, mapId, nowS, lapsed !== true);
  if ('error' in o) return o;
  await db.batch([
    db.prepare('DELETE FROM company_farms WHERE map_id = ?').bind(mapId),
    db.prepare('DELETE FROM company_farm_chores WHERE map_id = ?').bind(mapId),
  ]);
  return { ok: true };
}

/**
 * TODAY'S CHORE at a farm of the member's Company - once an account a farm a day (the client asks it only of a player
 * standing at the farm).
 * @param {{ db: any, nowS: number }} ctx
 */
export async function farmChore({ db, nowS }, player, { character, mapId } = {}) {
  const o = await ownFarm(db, player, character, mapId, nowS, false);
  if ('error' in o) return o;
  const r = await db.prepare('INSERT OR IGNORE INTO company_farm_chores (map_id, day, account, name) VALUES (?, ?, ?, ?)').bind(mapId, todayOf(nowS), player.id, o.a.name || displayName(player)).run();
  if (!r?.meta?.changes) return { error: 'farm-chore-done' };
  return { ok: true };
}
