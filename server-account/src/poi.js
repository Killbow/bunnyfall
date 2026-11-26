// @ts-check

import { poiDocProblems, poiShelfProblems, poiAssetProblems, poiAssetsOf, poiDocBytesOf, POI_ID_RE, POI_SHELF_ID_RE, POI_SHA_RE, POI_LIMITS } from '../../src/poi/poiLaw.js';
import { decodePoiMesh, poiMeshFacts, POI_MESH_LIMITS } from '../../src/poi/poiMesh.js';
import { poiImageMetaOf, POI_IMAGE_LIMITS, POI_IMAGE_TYPES } from '../../src/poi/poiImage.js';
import { poiPayProblems } from '../../src/poi/poiTradeLaw.js';
import { developerHandles } from './titles.js';

function handleList(raw) {
  if (typeof raw !== 'string' || !raw) return new Set();
  return new Set(raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

/** @param {any} player @param {any} env */
export function poiRolesOf(player, env) {
  const h = typeof player?.handle === 'string' && player.handle ? player.handle.toLowerCase() : null;
  if (!h) return { builder: false, approver: false };
  const approver = handleList(env?.APPROVER_HANDLES).has(h);
  const builder = approver || developerHandles(env).has(h) || handleList(env?.BUILDER_HANDLES).has(h);
  return { builder, approver };
}

export const poiAssetKey = (/** @type {string} */ sha) => `poi/a/${sha}`;
export const POI_UPLOAD_DAY_BYTES = 1024 * 1024 * 1024;
export const POI_ASSET_MAX = Object.freeze({ mesh: POI_MESH_LIMITS.bytes, texture: POI_IMAGE_LIMITS.bytes });
export const POI_DRAFT_BODY_MAX = Math.max(poiDocBytesOf(1), poiDocBytesOf(2)) + 1024;
export const POI_OPEN_REVS = 200;
export const POI_QUEUE_MAX = 50;
export const POI_LIST_REVS = 20;
export const POI_LIVE_ASSET_MAX_AGE_S = 86400;
// D1 binds at most 100 parameters a statement, so id lists go in chunks under it.
const BOUND_CHUNK = 90;

const hex = (/** @type {ArrayBuffer} */ buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const chunks = (/** @type {any[]} */ list, n = BOUND_CHUNK) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const parsed = (/** @type {any} */ text) => { try { return typeof text === 'string' ? JSON.parse(text) : null; } catch { return null; } };
export const poiDocSha = async (/** @type {any} */ subtle, /** @type {string} */ text) => hex(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
const decisionMark = (/** @type {any} */ ctx) => {
  const b = new Uint8Array(16);
  if (ctx.rand) ctx.rand(b); else globalThis.crypto.getRandomValues(b);
  return hex(b.buffer);
};

/** @param {any} db @param {string[]} shas */
async function assetFactsOf(db, shas) {
  const out = new Map();
  for (const part of chunks([...new Set(shas)])) {
    if (!part.length) continue;
    const rows = (await db.prepare(`SELECT sha, kind, bytes, meta, live FROM poi_assets WHERE sha IN (${part.map(() => '?').join(', ')})`).bind(...part).all()).results ?? [];
    for (const r of rows) out.set(r.sha, { kind: r.kind, live: r.live === 1, bytes: r.bytes, ...(parsed(r.meta) ?? {}) });
  }
  return out;
}

const liveRecomputed = (/** @type {string} */ when) => `UPDATE poi_assets SET live = EXISTS (SELECT 1 FROM poi_rev_assets ra JOIN poi_docs d ON d.id = ra.poi_id AND d.live_rev = ra.rev WHERE ra.sha = poi_assets.sha)
  WHERE sha IN (SELECT sha FROM poi_rev_assets WHERE poi_id = ?1) AND ${when}`;

/** @param {any} ctx @param {any} player @param {any} env
 * @param {{ sha: string, kind: string, bytes: ArrayBuffer }} a */
export async function putPoiAsset(ctx, player, env, { sha, kind, bytes }) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (typeof sha !== 'string' || !POI_SHA_RE.test(sha)) return { error: 'poi-sha' };
  if (kind !== 'mesh' && kind !== 'texture') return { error: 'poi-kind' };
  if (!ctx.bucket) return { error: 'no-storage' };
  const got = hex(await ctx.subtle.digest('SHA-256', bytes));
  if (got !== sha) return { error: 'poi-sha-mismatch' };
  let meta, type = 'application/octet-stream';
  if (kind === 'mesh') {
    const d = decodePoiMesh(bytes);
    if ('error' in d) return { error: 'poi-bad-mesh', why: d.error };
    meta = poiMeshFacts(d.mesh);
  } else {
    const m = poiImageMetaOf(bytes);
    if ('error' in m) return { error: 'poi-bad-texture', why: m.error };
    meta = { format: m.format, w: m.w, h: m.h };
    type = m.type;
  }
  const existed = async () => {
    const had = await ctx.db.prepare('SELECT kind, meta FROM poi_assets WHERE sha = ?').bind(sha).first();
    return had && (had.kind === kind ? { sha, kind, meta: parsed(had.meta), existed: true } : { error: 'poi-kind' });
  };
  const had = await existed();
  if (had) return had;
  const day = Math.floor(ctx.nowS / 86400), n = bytes.byteLength;
  // The day's bytes are reserved in one statement before they are stored, so parallel uploads cannot pass the
  // bound.
  const held = n <= POI_UPLOAD_DAY_BYTES && (await ctx.db.prepare(`INSERT INTO poi_upload_days (by, day, bytes) VALUES (?1, ?2, ?3)
    ON CONFLICT (by, day) DO UPDATE SET bytes = bytes + excluded.bytes WHERE bytes + excluded.bytes <= ?4`).bind(player.id, day, n, POI_UPLOAD_DAY_BYTES).run()).meta?.changes;
  if (!held) return { error: 'poi-quota' };
  const giveBack = () => ctx.db.prepare('UPDATE poi_upload_days SET bytes = MAX(0, bytes - ?) WHERE by = ? AND day = ?').bind(n, player.id, day).run();
  try {
    await ctx.bucket.put(poiAssetKey(sha), bytes, { httpMetadata: { contentType: type } });
  } catch (e) {
    await giveBack();
    throw e;
  }
  const stored = await ctx.db.prepare('INSERT OR IGNORE INTO poi_assets (sha, kind, bytes, meta, by, at, live) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .bind(sha, kind, n, JSON.stringify(meta), player.id, ctx.nowS).run();
  if (!stored.meta?.changes) {
    await giveBack();
    return (await existed()) ?? { error: 'poi-state' };
  }
  return { sha, kind, meta, existed: false };
}

/** @param {any} ctx @param {string} sha @param {{ builder: boolean }} roles */
export async function getPoiAsset(ctx, sha, roles) {
  if (typeof sha !== 'string' || !POI_SHA_RE.test(sha)) return { error: 'not-found' };
  const row = await ctx.db.prepare('SELECT kind, meta, live FROM poi_assets WHERE sha = ?').bind(sha).first();
  if (!row || (row.live !== 1 && !roles.builder)) return { error: 'not-found' };
  if (!ctx.bucket) return { error: 'no-storage' };
  const object = await ctx.bucket.get(poiAssetKey(sha));
  if (!object) return { error: 'not-found' };
  const type = row.kind === 'texture' ? (POI_IMAGE_TYPES[parsed(row.meta)?.format] ?? 'application/octet-stream') : 'application/octet-stream';
  return { object, kind: row.kind, type, live: row.live === 1 };
}

/** @param {any} db @param {any} doc */
async function docProblems(db, doc) {
  const own = poiDocProblems(doc);
  if (own.length) return own;
  const { meshes, textures } = poiAssetsOf(doc);
  const facts = await assetFactsOf(db, [...meshes, ...textures]);
  return poiAssetProblems(doc, (sha) => facts.get(sha) ?? null);
}

// Pay checks stay out of poiDocProblems because the game also runs it over every live POI.
/** @param {any} db @param {any} doc */
async function saveProblems(db, doc) {
  return poiPayProblems(doc, await docProblems(db, doc));
}

/** @param {any} ctx @param {any} player @param {any} env @param {{ doc: any, base?: any }} body */
export async function savePoiDraft(ctx, player, env, { doc, base = null }) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  const problems = await saveProblems(ctx.db, doc);
  if (problems.length) return { error: 'poi-doc', problems };
  const id = doc.id;
  if (base !== null && !(Number.isSafeInteger(base) && base > 0)) return { error: 'body' };
  const poi = await ctx.db.prepare('SELECT id FROM poi_docs WHERE id = ?').bind(id).first();
  if (!poi && base !== null) return { error: 'not-found' };
  if (poi && base !== null && !(await ctx.db.prepare('SELECT 1 FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, base).first())) return { error: 'not-found' };
  const text = JSON.stringify(doc);
  const binds = [id, text, await poiDocSha(ctx.subtle, text), doc.name, doc.place.px, doc.place.py, base, player.id, player.handle, ctx.nowS];
  const room = `(SELECT COUNT(*) FROM poi_revs WHERE author = ?8 AND state IN ('draft', 'submitted')) < ${POI_OPEN_REVS}`;
  for (let pass = 0; pass < 2; pass++) {
    // The save writes over the author's open draft in the statement that finds it, so a draft submitted meanwhile
    // is not found and the save becomes the next revision.
    const over = await ctx.db.prepare(`UPDATE poi_revs SET doc = ?2, doc_sha = ?3, name = ?4, px = ?5, py = ?6, at = ?10, base_rev = COALESCE(?7, base_rev)
      WHERE poi_id = ?1 AND author = ?8 AND state = 'draft' AND kind = 'doc' RETURNING rev`).bind(...binds).first();
    if (over) return { id, rev: over.rev, state: 'draft' };
    const steps = [];
    if (!poi) steps.push(ctx.db.prepare(`INSERT INTO poi_docs (id, created_by, created_at) SELECT ?1, ?8, ?10 WHERE ${room} ON CONFLICT (id) DO NOTHING`).bind(...binds));
    steps.push(ctx.db.prepare(`INSERT INTO poi_revs (poi_id, rev, kind, doc, doc_sha, name, px, py, base_rev, author, author_name, at, state)
      SELECT ?1, n.next, 'doc', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'draft' FROM (SELECT COALESCE(MAX(rev), 0) + 1 AS next FROM poi_revs WHERE poi_id = ?1) n
      WHERE ${room} AND EXISTS (SELECT 1 FROM poi_docs WHERE id = ?1) ON CONFLICT DO NOTHING RETURNING rev`).bind(...binds));
    const made = (await ctx.db.batch(steps)).at(-1)?.results?.[0];
    if (made) return { id, rev: made.rev, state: 'draft' };
    const open = await ctx.db.prepare("SELECT 1 FROM poi_revs WHERE poi_id = ? AND author = ? AND state = 'draft' AND kind = 'doc'").bind(id, player.id).first();
    if (!open) return { error: 'poi-drafts-full', max: POI_OPEN_REVS };
  }
  return { error: 'poi-state' };
}

export async function submitPoi(ctx, player, env, { id, rev }) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (!POI_ID_RE.test(String(id)) || !Number.isSafeInteger(rev)) return { error: 'body' };
  const row = await ctx.db.prepare('SELECT doc, doc_sha, author, state, kind FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
  if (!row) return { error: 'not-found' };
  if (row.author !== player.id) return { error: 'poi-not-author' };
  if (row.state !== 'draft') return { error: 'poi-state', state: row.state };
  const problems = await saveProblems(ctx.db, parsed(row.doc));
  if (problems.length) return { error: 'poi-doc', problems };
  const r = await ctx.db.prepare("UPDATE poi_revs SET state = 'submitted', submitted_at = ? WHERE poi_id = ? AND rev = ? AND state = 'draft' AND doc_sha = ?").bind(ctx.nowS, id, rev, row.doc_sha).run();
  if (!r.meta?.changes) return stateNow(ctx.db, id, rev, 'poi-state');
  return { id, rev, state: 'submitted' };
}

async function stateNow(db, id, rev, error) {
  const now = await db.prepare('SELECT state FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
  return { error, state: now?.state ?? null };
}

export async function withdrawPoi(ctx, player, env, { id, rev }) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (!POI_ID_RE.test(String(id)) || !Number.isSafeInteger(rev)) return { error: 'body' };
  const row = await ctx.db.prepare('SELECT author, state, kind FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
  if (!row) return { error: 'not-found' };
  if (row.author !== player.id) return { error: 'poi-not-author' };
  if (row.state !== 'submitted') return { error: 'poi-state', state: row.state };
  const r = await ctx.db.prepare(`UPDATE poi_revs SET submitted_at = NULL, state = CASE WHEN kind = 'doc' AND NOT EXISTS
    (SELECT 1 FROM poi_revs o WHERE o.poi_id = ?1 AND o.author = ?3 AND o.state = 'draft' AND o.kind = 'doc') THEN 'draft' ELSE 'withdrawn' END
    WHERE poi_id = ?1 AND rev = ?2 AND author = ?3 AND state = 'submitted' RETURNING state`).bind(id, rev, player.id).first();
  if (!r) return stateNow(ctx.db, id, rev, 'poi-state');
  return { id, rev, state: r.state };
}

export async function requestRetire(ctx, player, env, { id }) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (!POI_ID_RE.test(String(id))) return { error: 'body' };
  const made = await ctx.db.prepare(`INSERT INTO poi_revs (poi_id, rev, kind, doc, base_rev, author, author_name, at, state, submitted_at)
    SELECT ?1, n.next, 'retire', NULL, d.live_rev, ?2, ?3, ?4, 'submitted', ?4 FROM (SELECT COALESCE(MAX(rev), 0) + 1 AS next FROM poi_revs WHERE poi_id = ?1) n
    JOIN poi_docs d ON d.id = ?1 WHERE d.live_rev IS NOT NULL ON CONFLICT DO NOTHING RETURNING rev`).bind(id, player.id, player.handle, ctx.nowS).first();
  if (made) return { id, rev: made.rev, state: 'submitted' };
  const poi = await ctx.db.prepare('SELECT live_rev FROM poi_docs WHERE id = ?').bind(id).first();
  if (!poi) return { error: 'not-found' };
  return { error: poi.live_rev == null ? 'poi-not-live' : 'poi-pending' };
}

export async function reviewPoi(ctx, player, env, { id, rev, verdict, note = null, docSha = null }) {
  if (!poiRolesOf(player, env).approver) return { error: 'poi-not-approver' };
  if (!POI_ID_RE.test(String(id)) || !Number.isSafeInteger(rev) || (verdict !== 'approve' && verdict !== 'reject')) return { error: 'body' };
  if (note !== null && !(typeof note === 'string' && note.length <= POI_LIMITS.note)) return { error: 'body' };
  if (docSha !== null && !(typeof docSha === 'string' && POI_SHA_RE.test(docSha))) return { error: 'body' };
  const row = await ctx.db.prepare('SELECT kind, doc, doc_sha, state FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
  if (!row) return { error: 'not-found' };
  if (row.state !== 'submitted') return { error: 'poi-state', state: row.state };
  if (verdict === 'approve' && row.kind === 'doc' && docSha === null) return { error: 'body' };
  if (docSha !== null && docSha !== row.doc_sha) return { error: 'poi-changed' };
  const now = ctx.nowS;
  const state = verdict === 'approve' ? 'approved' : 'rejected';
  const doc = parsed(row.doc);
  if (verdict === 'approve' && row.kind === 'doc') {
    const problems = await saveProblems(ctx.db, doc);
    if (problems.length) return { error: 'poi-doc', problems };
  }
  const mark = decisionMark(ctx);
  const decided = 'EXISTS (SELECT 1 FROM poi_revs WHERE poi_id = ?1 AND rev = ?2 AND decision = ?3)';
  const steps = [
    ctx.db.prepare(`UPDATE poi_revs SET state = ?5, reviewer = ?4, reviewer_name = ?6, reviewed_at = ?7, note = ?8, decision = ?3
      WHERE poi_id = ?1 AND rev = ?2 AND state = 'submitted' AND doc_sha IS ?9`).bind(id, rev, mark, player.id, state, player.handle, now, note, row.doc_sha),
  ];
  if (verdict === 'approve') {
    if (row.kind === 'doc') {
      const { meshes, textures } = poiAssetsOf(doc);
      steps.push(ctx.db.prepare(`INSERT OR IGNORE INTO poi_rev_assets (poi_id, rev, sha) SELECT ?1, ?2, value FROM json_each(?4) WHERE ${decided}`).bind(id, rev, mark, JSON.stringify([...meshes, ...textures])));
    }
    steps.push(ctx.db.prepare(`UPDATE poi_docs SET live_rev = ${row.kind === 'retire' ? 'NULL' : '?2'}, live_at = ?5, live_by = ?4 WHERE id = ?1 AND ${decided}`).bind(id, rev, mark, player.id, now));
    steps.push(ctx.db.prepare(liveRecomputed(decided)).bind(id, rev, mark));
    steps.push(ctx.db.prepare(`UPDATE poi_feed SET v = v + 1, at = ?4 WHERE k = 'feed' AND ${decided}`).bind(id, rev, mark, now));
  }
  const res = await ctx.db.batch(steps);
  if (!res[0]?.meta?.changes) {
    const after = await ctx.db.prepare('SELECT state FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
    return after?.state === 'submitted' ? { error: 'poi-changed' } : { error: 'poi-state', state: after?.state ?? null };
  }
  if (verdict === 'approve') forgetPoiFeed();
  return { id, rev, state };
}

export async function rollbackPoi(ctx, player, env, { id, rev }) {
  if (!poiRolesOf(player, env).approver) return { error: 'poi-not-approver' };
  if (!POI_ID_RE.test(String(id)) || !Number.isSafeInteger(rev)) return { error: 'body' };
  const row = await ctx.db.prepare('SELECT kind, state, doc FROM poi_revs WHERE poi_id = ? AND rev = ?').bind(id, rev).first();
  if (!row) return { error: 'not-found' };
  if (row.state !== 'approved' || row.kind !== 'doc') return { error: 'poi-state', state: row.state };
  const doc = parsed(row.doc);
  const problems = await docProblems(ctx.db, doc);
  if (problems.length) return { error: 'poi-doc', problems };
  const { meshes, textures } = poiAssetsOf(doc);
  const now = ctx.nowS;
  // An approved revision stays approved, so the read above still holds at the batch and its writes need no
  // condition.
  await ctx.db.batch([
    ctx.db.prepare(`INSERT INTO poi_revs (poi_id, rev, kind, doc, base_rev, author, author_name, at, state, reviewer, reviewer_name, reviewed_at)
      SELECT ?1, n.next, 'rollback', NULL, ?2, ?3, ?4, ?5, 'approved', ?3, ?4, ?5 FROM (SELECT COALESCE(MAX(rev), 0) + 1 AS next FROM poi_revs WHERE poi_id = ?1) n`).bind(id, rev, player.id, player.handle, now),
    ctx.db.prepare('INSERT OR IGNORE INTO poi_rev_assets (poi_id, rev, sha) SELECT ?1, ?2, value FROM json_each(?3)').bind(id, rev, JSON.stringify([...meshes, ...textures])),
    ctx.db.prepare('UPDATE poi_docs SET live_rev = ?2, live_at = ?3, live_by = ?4 WHERE id = ?1').bind(id, rev, now, player.id),
    ctx.db.prepare(liveRecomputed('1')).bind(id),
    ctx.db.prepare("UPDATE poi_feed SET v = v + 1, at = ? WHERE k = 'feed'").bind(now),
  ]);
  forgetPoiFeed();
  return { id, rev, live: true };
}

const POI_LIST_MAX = 2000;

export async function listPoi(ctx, player, env) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  const docs = (await ctx.db.prepare(`SELECT d.id, d.created_by, d.created_at, d.live_rev, d.live_at, d.live_by, n.name, n.px, n.py,
    (SELECT MAX(rev) FROM poi_revs WHERE poi_id = d.id) AS newest
    FROM poi_docs d LEFT JOIN poi_revs n ON n.poi_id = d.id AND n.rev = COALESCE(d.live_rev, (SELECT MAX(rev) FROM poi_revs WHERE poi_id = d.id AND kind = 'doc'))
    ORDER BY d.created_at DESC LIMIT ${POI_LIST_MAX}`).all()).results ?? [];
  const revs = (await ctx.db.prepare(`SELECT poi_id, rev, kind, author, author_name, at, state, submitted_at, reviewer_name, reviewed_at, base_rev FROM (
    SELECT poi_id, rev, kind, author, author_name, at, state, submitted_at, reviewer_name, reviewed_at, base_rev, ROW_NUMBER() OVER (PARTITION BY poi_id ORDER BY rev DESC) AS k
    FROM poi_revs WHERE poi_id IN (SELECT id FROM poi_docs ORDER BY created_at DESC LIMIT ${POI_LIST_MAX})) WHERE k <= ${POI_LIST_REVS} ORDER BY poi_id, rev`).all()).results ?? [];
  const byPoi = new Map();
  for (const r of revs) {
    if (!byPoi.has(r.poi_id)) byPoi.set(r.poi_id, []);
    byPoi.get(r.poi_id).push(r);
  }
  return {
    pois: docs.map((d) => {
      const rs = byPoi.get(d.id) ?? [];
      return {
        id: d.id, name: d.name ?? d.id, px: d.px ?? null, py: d.py ?? null, createdBy: d.created_by, createdAt: d.created_at,
        liveRev: d.live_rev, liveAt: d.live_at, newestRev: d.newest ?? null,
        revs: rs.map((r) => ({ rev: r.rev, kind: r.kind, author: r.author_name, authorId: r.author, at: r.at, state: r.state, submittedAt: r.submitted_at, reviewer: r.reviewer_name, reviewedAt: r.reviewed_at, base: r.base_rev })),
      };
    }),
  };
}

export async function poiHistory(ctx, player, env, id) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (!POI_ID_RE.test(String(id))) return { error: 'body' };
  const poi = await ctx.db.prepare('SELECT id, created_by, created_at, live_rev, live_at, live_by FROM poi_docs WHERE id = ?').bind(id).first();
  if (!poi) return { error: 'not-found' };
  const revs = (await ctx.db.prepare('SELECT * FROM poi_revs WHERE poi_id = ? ORDER BY rev').bind(id).all()).results ?? [];
  return {
    id, liveRev: poi.live_rev, liveAt: poi.live_at, createdAt: poi.created_at,
    revs: revs.map((r) => ({ rev: r.rev, kind: r.kind, doc: parsed(r.doc), base: r.base_rev, author: r.author_name, authorId: r.author, at: r.at, state: r.state, submittedAt: r.submitted_at, reviewer: r.reviewer_name, reviewedAt: r.reviewed_at, note: r.note })),
  };
}

export const POI_SHELF_MAX = 2000;
export const POI_SHELF_EVER = 5 * POI_SHELF_MAX;
export const POI_SHELF_LIST = 5000;

export async function listShelf(ctx, player, env) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  const rows = (await ctx.db.prepare(`SELECT id, name, tags, thumb, parts, triangles, by, by_name, at, updated_at, updated_by FROM poi_shelf
    WHERE gone_at IS NULL ORDER BY updated_at DESC, id LIMIT ${POI_SHELF_LIST}`).all()).results ?? [];
  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, tags: parsed(r.tags) ?? [], thumb: r.thumb, parts: r.parts, triangles: r.triangles, by: r.by_name, byId: r.by, at: r.at, updatedAt: r.updated_at, updatedBy: r.updated_by })),
  };
}

export async function shelfEntry(ctx, player, env, id) {
  if (!poiRolesOf(player, env).builder) return { error: 'poi-not-builder' };
  if (!POI_SHELF_ID_RE.test(String(id))) return { error: 'body' };
  const r = await ctx.db.prepare('SELECT item, by, by_name, at, updated_at, gone_at FROM poi_shelf WHERE id = ?').bind(id).first();
  if (!r) return { error: 'not-found' };
  if (r.gone_at != null) return { error: 'poi-gone' };
  return { id, item: parsed(r.item), by: r.by_name, byId: r.by, at: r.at, updatedAt: r.updated_at };
}

/** @param {any} ctx @param {any} player @param {any} env @param {{ item: any }} body */
export async function shelve(ctx, player, env, { item }) {
  const roles = poiRolesOf(player, env);
  if (!roles.builder) return { error: 'poi-not-builder' };
  const own = poiShelfProblems(item);
  if (own.length) return { error: 'poi-doc', problems: own };
  const { meshes, textures } = poiAssetsOf(item);
  const facts = await assetFactsOf(ctx.db, [...meshes, ...textures]);
  const problems = poiAssetProblems(item, (sha) => facts.get(sha) ?? null);
  if (problems.length) return { error: 'poi-doc', problems };
  const triangles = item.parts.reduce((n, part) => n + (Number(facts.get(part.mesh)?.triangles) || 0), 0);
  const text = JSON.stringify(item), tags = JSON.stringify(item.tags ?? []);
  for (let pass = 0; pass < 2; pass++) {
    const had = await ctx.db.prepare('SELECT by, gone_at FROM poi_shelf WHERE id = ?').bind(item.id).first();
    if (had) {
      if (had.gone_at != null) return { error: 'poi-gone' };
      if (had.by !== player.id && !roles.approver) return { error: 'poi-not-author' };
      const r = await ctx.db.prepare('UPDATE poi_shelf SET item = ?, name = ?, tags = ?, thumb = ?, parts = ?, triangles = ?, updated_at = ?, updated_by = ? WHERE id = ? AND gone_at IS NULL')
        .bind(text, item.name, tags, item.thumb, item.parts.length, triangles, ctx.nowS, player.handle, item.id).run();
      if (!r.meta?.changes) return { error: 'poi-gone' };
      return { id: item.id, at: ctx.nowS };
    }
    const made = await ctx.db.prepare(`INSERT INTO poi_shelf (id, item, name, tags, thumb, parts, triangles, by, by_name, at, updated_at, updated_by)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?9
      WHERE (SELECT COUNT(*) FROM poi_shelf WHERE by = ?8 AND gone_at IS NULL) < ${POI_SHELF_MAX} AND (SELECT COUNT(*) FROM poi_shelf WHERE by = ?8) < ${POI_SHELF_EVER}
      ON CONFLICT (id) DO NOTHING`).bind(item.id, text, item.name, tags, item.thumb, item.parts.length, triangles, player.id, player.handle, ctx.nowS).run();
    if (made.meta?.changes) return { id: item.id, at: ctx.nowS };
    if (!(await ctx.db.prepare('SELECT 1 FROM poi_shelf WHERE id = ?').bind(item.id).first())) {
      const kept = await ctx.db.prepare('SELECT COUNT(*) AS n FROM poi_shelf WHERE by = ? AND gone_at IS NULL').bind(player.id).first();
      return Number(kept?.n ?? 0) >= POI_SHELF_MAX ? { error: 'poi-shelf-full', max: POI_SHELF_MAX } : { error: 'poi-shelf-spent', max: POI_SHELF_EVER };
    }
  }
  return { error: 'poi-state' };
}

export async function unshelve(ctx, player, env, { id }) {
  const roles = poiRolesOf(player, env);
  if (!roles.builder) return { error: 'poi-not-builder' };
  if (!POI_SHELF_ID_RE.test(String(id))) return { error: 'body' };
  const r = await ctx.db.prepare('SELECT by, gone_at FROM poi_shelf WHERE id = ?').bind(id).first();
  if (!r) return { error: 'not-found' };
  if (r.gone_at != null) return { error: 'poi-gone' };
  if (r.by !== player.id && !roles.approver) return { error: 'poi-not-author' };
  const w = await ctx.db.prepare('UPDATE poi_shelf SET gone_at = ?, gone_by = ? WHERE id = ? AND gone_at IS NULL').bind(ctx.nowS, player.handle, id).run();
  if (!w.meta?.changes) return { error: 'poi-gone' };
  return { id, gone: true };
}

export async function poiQueue(ctx, player, env) {
  if (!poiRolesOf(player, env).approver) return { error: 'poi-not-approver' };
  const rows = (await ctx.db.prepare(`SELECT r.poi_id, r.rev, r.kind, r.doc, r.doc_sha, r.base_rev, r.author_name, r.at, r.submitted_at, d.live_rev, l.doc AS live_doc
    FROM poi_revs r JOIN poi_docs d ON d.id = r.poi_id LEFT JOIN poi_revs l ON l.poi_id = r.poi_id AND l.rev = d.live_rev
    WHERE r.state = 'submitted' ORDER BY r.submitted_at, r.poi_id, r.rev LIMIT ${POI_QUEUE_MAX + 1}`).all()).results ?? [];
  return {
    queue: rows.slice(0, POI_QUEUE_MAX).map((r) => ({
      id: r.poi_id, rev: r.rev, kind: r.kind, doc: parsed(r.doc), docSha: r.doc_sha ?? null, base: r.base_rev, author: r.author_name, at: r.at, submittedAt: r.submitted_at,
      liveRev: r.live_rev, liveDoc: parsed(r.live_doc),
      stale: (r.base_rev ?? null) !== (r.live_rev ?? null),
    })),
    more: rows.length > POI_QUEUE_MAX,
  };
}

let kept = null;
export const POI_FEED_KEEP_MS = 15_000;
export function forgetPoiFeed() { kept = null; }

/** @param {any} db @param {number} nowMs @param {number} [atLeast] */
export async function poiLiveFeed(db, nowMs, atLeast = 0) {
  if (kept && kept.v >= atLeast && nowMs - kept.checkedMs < POI_FEED_KEEP_MS) return kept;
  const feed = await db.prepare("SELECT v FROM poi_feed WHERE k = 'feed'").first();
  const v = Number(feed?.v ?? 0);
  if (kept && kept.v === v) { kept.checkedMs = nowMs; return kept; }
  const rows = (await db.prepare(`SELECT d.id, d.live_rev AS rev, r.doc FROM poi_docs d JOIN poi_revs r ON r.poi_id = d.id AND r.rev = d.live_rev
    WHERE d.live_rev IS NOT NULL AND r.kind = 'doc' AND r.state = 'approved' ORDER BY d.id`).all()).results ?? [];
  const pois = [];
  const live = new Set();
  for (const r of rows) {
    const doc = parsed(r.doc);
    if (!doc) continue;
    pois.push({ id: r.id, rev: r.rev, doc });
    const { meshes, textures } = poiAssetsOf(doc);
    for (const s of [...meshes, ...textures]) live.add(s);
  }
  kept = { v, body: JSON.stringify({ v, pois }), live, checkedMs: nowMs };
  return kept;
}

export const poiFeedTag = (/** @type {number} */ v) => `"poi-${v}"`;
/** @param {string | null} header */
export function poiHeldVersion(header) {
  let held = -1;
  for (const m of String(header ?? '').matchAll(/(?:^|,)\s*(?:W\/)?"poi-(\d{1,15})"\s*(?=,|$)/g)) held = Math.max(held, Number(m[1]));
  return held;
}
