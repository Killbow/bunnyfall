// @ts-check
// BUNNYFALL (2026-11-06): THE STAFF PAGE'S DATA DOORS (staff.html). Three things the upstream panel never had:
//   - /v1/staff/data/saves   { target | name }   an account's saves: its cloud slots (the `saves` rows) and its online
//                                                 characters (realm_characters, their last checkpoint) - Admins'
//   - /v1/staff/data/export  { kind, ... }       one save, whole: the cloud slot's data (or screenshot) blob, or an online
//                                                 character's checkpoint, as text when it opens to text, else the raw bytes
//                                                 in base64 - Admins'
//   - /v1/staff/data/tables, /v1/staff/data/query { sql }   the database, read only: the tables with their rows, and one
//                                                 SELECT at a time (never more than QUERY_ROWS rows; a column that holds a
//                                                 secret, a hash, a token or a key is answered as [hidden]) - OWNERS'
// Every call is an audit row, as every staff act is (staff.js `audit`); an export names what it took, a query its SQL.
import { findAccount } from './sanctions.js';
import { realmSaveTextOf } from './realm.js';
import { saveKey, SAVE_PARTS } from './service.js';

export const DATA_ROUTES = Object.freeze(['/v1/staff/data/saves', '/v1/staff/data/export', '/v1/staff/data/tables', '/v1/staff/data/query']);
/** Rows a query answers, and the longest SQL it takes. */
export const QUERY_ROWS = 500;
export const QUERY_SQL_MAX = 4000;
/** Columns never shown: a secret, a password, a hash, a token, a key. */
const HIDDEN_COLUMN = /pass|secret|token|hash|pub|sig|salt|key/i;
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const base64 = (/** @type {Uint8Array} */ bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const str = (/** @type {unknown} */ v, max = 200) => (typeof v === 'string' && v && v.length <= max ? v : null);

/**
 * @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string, owner: boolean }} who @param {Function} audit staff.js's audit(act, target, detail, how)
 */
export async function staffData(ctx, env, path, body, who, audit) {
  const { db } = ctx;
  const bucket = ctx.bucket ?? env?.SAVES ?? null;
  const denied = async (/** @type {string} */ error) => { await audit('refused', null, { path, need: error === 'staff-admin' ? 'admin' : 'owner' }, { outcome: 'denied' }).run(); return { error }; };

  if (path === '/v1/staff/data/tables' || path === '/v1/staff/data/query') {
    if (!who.owner) return denied('staff-owner');
    if (path === '/v1/staff/data/tables') {
      const names = ((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all())?.results ?? [])
        .map((r) => r.name).filter((n) => TABLE_NAME.test(n));
      const counts = names.length ? await db.batch(names.map((n) => db.prepare(`SELECT COUNT(*) AS n FROM "${n}"`))) : [];
      await audit('data-tables', null, { tables: names.length }, { onceIn: 60 }).run();
      return { tables: names.map((name, i) => ({ name, rows: counts[i]?.results?.[0]?.n ?? null })) };
    }
    const sql = typeof body.sql === 'string' ? body.sql.trim().replace(/;+\s*$/, '') : '';
    if (!sql || sql.length > QUERY_SQL_MAX || sql.includes(';') || !/^select\b/i.test(sql)) return { error: 'bad-query' };
    let rows;
    try {
      rows = (await db.prepare(`SELECT * FROM (${sql}) LIMIT ${QUERY_ROWS}`).all())?.results ?? [];
    } catch (e) {
      await audit('data-query', null, { sql: sql.slice(0, 300) }, { outcome: 'failed' }).run();
      return { error: 'bad-query', message: String(e?.message ?? e).slice(0, 200) };
    }
    await audit('data-query', null, { sql: sql.slice(0, 300), rows: rows.length }).run();
    const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, HIDDEN_COLUMN.test(k) ? '[hidden]' : v])));
    return { rows: clean, columns: clean[0] ? Object.keys(clean[0]) : [], limit: QUERY_ROWS };
  }

  // the saves doors: an Admin's
  if (who.role !== 'admin') return denied('staff-admin');
  // a name first (a handle such as "Sits-With-Drink" is shaped like an id), then the same word as an id
  let p = await findAccount(db, { name: body.name ?? body.target });
  if ('error' in p && p.error === 'no-player') p = await findAccount(db, { target: body.target ?? body.name });
  if ('error' in p) return p;

  if (path === '/v1/staff/data/saves') {
    const [cloud, realm] = await Promise.all([
      db.prepare('SELECT character_id, save_name, character_name, game_time, real_time, dfu_version, save_version, bytes, shot_bytes, created_at, updated_at FROM saves WHERE player_id = ? ORDER BY updated_at DESC LIMIT 200').bind(p.id).all(),
      db.prepare('SELECT id, name, seq, lease, lease_at, dead_at, held, obj, updated_at, created_at FROM realm_characters WHERE player = ? ORDER BY updated_at DESC LIMIT 50').bind(p.id).all(),
    ]);
    await audit('data-saves', p.id, null, { onceIn: 60 }).run();
    return {
      player: { id: p.id, handle: p.handle ?? null, guestName: p.guest_name ?? null },
      cloud: (cloud.results ?? []).map((r) => ({ characterId: r.character_id, saveName: r.save_name, characterName: r.character_name, gameTime: r.game_time, realTime: r.real_time,
        dfuVersion: r.dfu_version, saveVersion: r.save_version, bytes: r.bytes, shotBytes: r.shot_bytes, createdAt: r.created_at, updatedAt: r.updated_at })),
      realm: (realm.results ?? []).map((r) => ({ id: r.id, name: r.name, seq: r.seq, leased: !!r.lease, leaseAt: r.lease_at, deadAt: r.dead_at, held: !!r.held, hasSave: !!r.obj, updatedAt: r.updated_at, createdAt: r.created_at })),
    };
  }

  // /v1/staff/data/export { target|name, kind: 'cloud'|'realm', characterId + saveName + part? | char, as? }
  if (!bucket) return { error: 'no-storage' };
  if (body.kind === 'realm') {
    const id = str(body.char, 80);
    const c = id ? await db.prepare('SELECT id, name, obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, p.id).first() : null;
    if (!c?.obj) return { error: 'no-data' };
    const object = await bucket.get(c.obj);
    if (!object) return { error: 'no-data' };
    const text = await realmSaveTextOf(await bucket.get(c.obj));
    await audit('data-export', p.id, { kind: 'realm', char: c.id, name: c.name }).run();
    if (body.as !== 'raw' && text != null) return { name: `${c.name ?? c.id}.json`, encoding: 'text', data: text };
    return { name: `${c.name ?? c.id}.bin`, encoding: 'base64', data: base64(new Uint8Array(await object.arrayBuffer())) };
  }
  if (body.kind === 'cloud') {
    const characterId = str(body.characterId, 120), saveName = str(body.saveName, 200);
    const part = SAVE_PARTS.includes(body.part) ? body.part : 'data';
    if (!characterId || !saveName) return { error: 'body' };
    const have = await db.prepare('SELECT character_name FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?').bind(p.id, characterId, saveName).first();
    if (!have) return { error: 'no-data' };
    const object = await bucket.get(saveKey(p.id, characterId, saveName, part));
    if (!object) return { error: 'no-data' };
    const bytes = new Uint8Array(await object.arrayBuffer());
    await audit('data-export', p.id, { kind: 'cloud', characterId, saveName, part, bytes: bytes.length }).run();
    const label = `${have.character_name ?? characterId}-${saveName}-${part}`.replace(/[^\w.-]+/g, '_');
    return { name: label, encoding: 'base64', data: base64(bytes) };
  }
  return { error: 'body' };
}
