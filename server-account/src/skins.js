// @ts-check
// BUNNYFALL (2026-11-07): CUSTOM PAPERDOLLS, KEPT (src/net/skinLaw.js is the law). An account uploads a skin - a name, a
// height and a front and a back PNG - it waits for staff, and once approved its owner may wear it online; everyone who
// meets the wearer reads it by its id (`get`). The pictures live in the saves bucket under `skins/<id>/front|back`.
import { accountKind } from './accounts.js';
import {
  skinName, skinHeight, skinNote, skinPngSize, skinIdOk, SKIN_MAX_PER_ACCOUNT, SKIN_MAX_PENDING, SKIN_PNG_MAX_BYTES,
} from '../../src/net/skinLaw.js';

export const SKIN_ROUTES = Object.freeze(['/v1/skins/upload', '/v1/skins/mine', '/v1/skins/delete', '/v1/skins/wear', '/v1/skins/get']);
export const STAFF_SKIN_ROUTES = Object.freeze(['/v1/staff/skins/queue', '/v1/staff/skins/review']);

const keyOf = (/** @type {string} */ id, /** @type {'front'|'back'} */ side) => `skins/${id}/${side}`;
const fromB64 = (/** @type {unknown} */ s) => {
  if (typeof s !== 'string' || s.length > Math.ceil(SKIN_PNG_MAX_BYTES * 4 / 3) + 4) return null;
  try { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; } catch { return null; }
};
const toB64 = (/** @type {Uint8Array} */ bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const rowOut = (/** @type {any} */ r) => ({ id: r.id, name: r.name, height: r.height, w: r.w, h: r.h, status: r.status, note: r.note ?? '', createdAt: r.created_at });
async function read(/** @type {any} */ bucket, /** @type {string} */ id, /** @type {'front'|'back'} */ side) {
  const o = await bucket.get(keyOf(id, side));
  if (!o) return null;
  const chunks = []; let n = 0;
  const reader = o.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; }
  const b = new Uint8Array(n); let at = 0;
  for (const c of chunks) { b.set(c, at); at += c.length; }
  return b;
}

/** UPLOAD `{ name, height, front, back }` (the pictures in base64): `{ ok, skin }` or `{ error }`. */
export async function skinsUpload(/** @type {any} */ ctx, /** @type {any} */ player, /** @type {any} */ body) {
  const { db, nowS, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'skin-need-account' };
  if (!bucket) return { error: 'no-storage' };
  const name = skinName(body?.name), height = skinHeight(body?.height);
  if (!name || height == null) return { error: 'skin-bad' };
  const front = fromB64(body?.front), back = fromB64(body?.back);
  const fs = front && skinPngSize(front), bs = back && skinPngSize(back);
  if (!front || !back || !fs || !bs) return { error: 'skin-png' };
  if (fs.w !== bs.w || fs.h !== bs.h) return { error: 'skin-same-size' };
  const have = await db.prepare("SELECT COUNT(*) AS n, SUM(status = 'pending') AS p FROM skins WHERE player = ?").bind(player.id).first();
  if (Number(have?.n ?? 0) >= SKIN_MAX_PER_ACCOUNT) return { error: 'skin-full' };
  if (Number(have?.p ?? 0) >= SKIN_MAX_PENDING) return { error: 'skin-pending-full' };
  const id = `sk-${[...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  await bucket.put(keyOf(id, 'front'), front);
  await bucket.put(keyOf(id, 'back'), back);
  await db.prepare('INSERT INTO skins (id, player, name, height, w, h, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, player.id, name, height, fs.w, fs.h, 'pending', nowS).run();
  return { ok: true, skin: { id, name, height, w: fs.w, h: fs.h, status: 'pending', note: '', createdAt: nowS } };
}

/** MINE `{}`: `{ skins, worn }` - the account's skins with their status and the id worn (or null). */
export async function skinsMine({ db }, /** @type {any} */ player) {
  const [rows, worn] = await Promise.all([
    db.prepare('SELECT id, name, height, w, h, status, note, created_at FROM skins WHERE player = ? ORDER BY created_at DESC').bind(player.id).all(),
    db.prepare('SELECT skin_id FROM skin_worn WHERE player = ?').bind(player.id).first(),
  ]);
  return { skins: (rows.results ?? []).map(rowOut), worn: worn?.skin_id ?? null };
}

/** DELETE `{ id }`: one of the account's own, whatever its status. */
export async function skinsDelete({ db, bucket }, /** @type {any} */ player, /** @type {any} */ body) {
  if (!skinIdOk(body?.id)) return { error: 'skin-gone' };
  const r = await db.prepare('DELETE FROM skins WHERE id = ? AND player = ?').bind(body.id, player.id).run();
  if (!r?.meta?.changes) return { error: 'skin-gone' };
  await db.prepare('DELETE FROM skin_worn WHERE player = ? AND skin_id = ?').bind(player.id, body.id).run();
  try { await bucket?.delete([keyOf(body.id, 'front'), keyOf(body.id, 'back')]); } catch { /* the row is gone; a stray picture is no harm */ }
  return { ok: true };
}

/** WEAR `{ id }` (or `{ id: null }` for none): an approved skin of the account's own. */
export async function skinsWear({ db }, /** @type {any} */ player, /** @type {any} */ body) {
  if (body?.id == null) { await db.prepare('DELETE FROM skin_worn WHERE player = ?').bind(player.id).run(); return { ok: true, worn: null }; }
  if (!skinIdOk(body.id)) return { error: 'skin-gone' };
  const s = await db.prepare('SELECT status FROM skins WHERE id = ? AND player = ?').bind(body.id, player.id).first();
  if (!s) return { error: 'skin-gone' };
  if (s.status !== 'approved') return { error: 'skin-not-approved' };
  await db.prepare('INSERT INTO skin_worn (player, skin_id) VALUES (?, ?) ON CONFLICT(player) DO UPDATE SET skin_id = excluded.skin_id').bind(player.id, body.id).run();
  return { ok: true, worn: body.id };
}

/** GET `{ id }`: an approved skin (or the asker's own, whatever its status) with its pictures, for whoever meets its wearer. */
export async function skinsGet({ db, bucket }, /** @type {any} */ player, /** @type {any} */ body) {
  if (!skinIdOk(body?.id) || !bucket) return { error: 'skin-gone' };
  const s = await db.prepare('SELECT id, player, name, height, w, h, status FROM skins WHERE id = ?').bind(body.id).first();
  if (!s || (s.status !== 'approved' && s.player !== player.id)) return { error: 'skin-gone' };
  const [front, back] = await Promise.all([read(bucket, s.id, 'front'), read(bucket, s.id, 'back')]);
  if (!front || !back) return { error: 'skin-gone' };
  return { id: s.id, name: s.name, height: s.height, w: s.w, h: s.h, front: toB64(front), back: toB64(back) };
}

/**
 * STAFF: `/v1/staff/skins/queue { status? }` the skins waiting (or `status`), oldest first, each with its pictures and its
 * owner; `/v1/staff/skins/review { id, verdict: 'approve'|'reject', note }`. Any staff account decides; each is an audit row.
 */
export async function staffSkins(/** @type {any} */ ctx, /** @type {any} */ env, /** @type {string} */ path, /** @type {any} */ body, /** @type {any} */ who, /** @type {Function} */ audit) {
  const { db, nowS } = ctx;
  const bucket = ctx.bucket ?? env?.SAVES ?? null;
  if (path === '/v1/staff/skins/queue') {
    const status = ['pending', 'approved', 'rejected'].includes(body?.status) ? body.status : 'pending';
    const rows = (await db.prepare('SELECT s.id, s.player, s.name, s.height, s.w, s.h, s.status, s.note, s.created_at, p.handle, p.guest_name FROM skins s LEFT JOIN players p ON p.id = s.player WHERE s.status = ? ORDER BY s.created_at LIMIT 20').bind(status).all())?.results ?? [];
    const out = [];
    for (const r of rows) {
      const [front, back] = bucket ? await Promise.all([read(bucket, r.id, 'front'), read(bucket, r.id, 'back')]) : [null, null];
      out.push({ ...rowOut(r), player: r.player, owner: r.handle ?? r.guest_name ?? r.player, front: front ? toB64(front) : null, back: back ? toB64(back) : null });
    }
    return { skins: out };
  }
  // review
  if (!skinIdOk(body?.id) || !['approve', 'reject'].includes(body?.verdict)) return { error: 'skin-bad' };
  const note = skinNote(body.note);
  if (body.verdict === 'reject' && !note) return { error: 'staff-note' };
  const s = await db.prepare('SELECT id, player, status FROM skins WHERE id = ?').bind(body.id).first();
  if (!s) return { error: 'skin-gone' };
  const status = body.verdict === 'approve' ? 'approved' : 'rejected';
  await db.prepare('UPDATE skins SET status = ?, note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?').bind(status, note, nowS, who?.player?.id ?? null, s.id).run();
  if (status === 'rejected') await db.prepare('DELETE FROM skin_worn WHERE player = ? AND skin_id = ?').bind(s.player, s.id).run();
  await audit(`skin-${body.verdict}`, s.player, { id: s.id, was: s.status, note }).run();
  return { ok: true, status };
}
