// @ts-check
// Caravan templates. A caravan's pieces live in the owner's save, so a decorator sends a whole template. It holds
// pieces to add or move, ids to remove, and a hash of the caravan as the decorator saw it. The owner's client checks,
// prices, previews, and pays for it (src/systems/caravanTemplate.js). A decorator has one open template per caravan
// owner.
import { accountKind, displayName, overRate } from './accounts.js';
import { DECOR_CAP, DECOR_ID_RE, decorPieceOf } from '../../src/net/decorLaw.js';
import {
  CARAVAN_DECORATORS_MAX, TEMPLATE_BASE_RE, TEMPLATE_RATE_MAX, TEMPLATE_RATE_WINDOW_S, TEMPLATE_TTL_S, decoratorPieceOk,
} from '../../src/net/decoratorLaw.js';
import { HANDLE_RE } from '../../src/net/handleShape.js';
import { templateLetter } from './decorators.js';

export const caravanTemplateLetter = (/** @type {string} */ name) => `${name} sent you a decorating template for your caravan. Go inside and open Decorators to preview it.`;
export const caravanDeclineLetter = (/** @type {string} */ name) => `${name} did not accept your decorating template for their caravan. Visit the caravan to make a new one.`;

async function accountByName(db, name) {
  const handle = typeof name === 'string' ? name.trim() : '';
  if (!HANDLE_RE.test(handle)) return null;
  const row = await db.prepare('SELECT id, handle FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first();
  return row?.handle ? row : null;
}

const expire = (db, owner, nowS) => db.prepare('DELETE FROM caravan_templates WHERE owner = ? AND sent_at < ?').bind(owner, nowS - TEMPLATE_TTL_S).run();

/** A template's body as the law takes it: `{ put, drop }`, or null. */
export function caravanTemplateOf(/** @type {any} */ raw) {
  const put = Array.isArray(raw?.put) ? raw.put : null;
  const drop = Array.isArray(raw?.drop) ? raw.drop : null;
  if (!put || !drop || put.length + drop.length > DECOR_CAP) return null;
  const seen = new Set();
  const pieces = [];
  for (const r of put) {
    const p = decorPieceOf(r);
    if (!p || !decoratorPieceOk(p) || seen.has(p.id)) return null;
    seen.add(p.id);
    pieces.push(p);
  }
  for (const id of drop) {
    if (typeof id !== 'string' || !DECOR_ID_RE.test(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return { put: pieces, drop: [...drop] };
}

/**
 * `/v1/homes/caravan/decorators { op: list | grant | revoke, name }` and
 * `/v1/homes/caravan/templates { op: may | send | list | read | answer }`.
 * @param {{ db: any, rand: any, nowS: number }} ctx @param {any} player @param {string} path @param {any} body
 */
export async function caravanRoute(ctx, player, path, body = {}) {
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  const op = body?.op;
  if (path === '/v1/homes/caravan/decorators') {
    if (op === 'list') {
      const { results = [] } = await db.prepare(`SELECT p.handle AS name FROM caravan_decorators d LEFT JOIN players p ON p.id = d.player
        WHERE d.owner = ? ORDER BY d.granted_at, d.player`).bind(player.id).all();
      return { ok: true, max: CARAVAN_DECORATORS_MAX, decorators: results.map((r) => ({ name: r.name ?? '' })) };
    }
    const who = await accountByName(db, body.name);
    if (!who) return { error: 'no-reader' };
    if (op === 'grant') {
      if (who.id === player.id) return { error: 'decorator-self' };
      const r = await db.prepare(`INSERT INTO caravan_decorators (owner, player, granted_at) SELECT ?, ?, ?
        WHERE (SELECT COUNT(*) FROM caravan_decorators WHERE owner = ?) < ? ON CONFLICT DO NOTHING`)
        .bind(player.id, who.id, nowS, player.id, CARAVAN_DECORATORS_MAX).run();
      if (r?.meta?.changes) return { ok: true, name: who.handle };
      const had = await db.prepare('SELECT 1 AS y FROM caravan_decorators WHERE owner = ? AND player = ?').bind(player.id, who.id).first();
      return had ? { ok: true, name: who.handle, repeat: true } : { error: 'decorators-full' };
    }
    if (op === 'revoke') {
      const [, r] = await db.batch([
        db.prepare('DELETE FROM caravan_templates WHERE owner = ? AND player = ?').bind(player.id, who.id),
        db.prepare('DELETE FROM caravan_decorators WHERE owner = ? AND player = ?').bind(player.id, who.id),
      ]);
      return r?.meta?.changes ? { ok: true, name: who.handle } : { error: 'no-reader' };
    }
    return { error: 'bad-decor' };
  }
  if (op === 'may' || op === 'send') {
    const owner = await accountByName(db, body.owner);
    const granted = owner ? await db.prepare('SELECT 1 AS y FROM caravan_decorators WHERE owner = ? AND player = ?').bind(owner.id, player.id).first() : null;
    if (!granted) return { error: 'template-none' };
    if (op === 'may') return { ok: true, may: true, owner: owner.handle };
    if (typeof body.base !== 'string' || !TEMPLATE_BASE_RE.test(body.base)) return { error: 'bad-decor' };
    const doc = caravanTemplateOf(body);
    if (!doc) return { error: 'decorator-piece' };
    if (!doc.put.length && !doc.drop.length) return { error: 'draft-empty' };
    if (await overRate({ db, nowS }, `caravan-template:${player.id}`, TEMPLATE_RATE_MAX, TEMPLATE_RATE_WINDOW_S)) return { error: 'template-rate' };
    const r = await db.prepare(`INSERT INTO caravan_templates (owner, player, base, doc, sent_at) SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM caravan_decorators WHERE owner = ? AND player = ?)
      ON CONFLICT (owner, player) DO UPDATE SET base = excluded.base, doc = excluded.doc, sent_at = excluded.sent_at`)
      .bind(owner.id, player.id, body.base, JSON.stringify(doc), nowS, owner.id, player.id).run();
    if (!r?.meta?.changes) return { error: 'template-none' };
    const mailed = await templateLetter(ctx, player, owner.id, caravanTemplateLetter(displayName(player))).catch(() => false);
    return { ok: true, sentAt: nowS, mailed };
  }
  await expire(db, player.id, nowS);
  if (op === 'list') {
    const { results = [] } = await db.prepare(`SELECT p.handle AS name, t.doc, t.sent_at FROM caravan_templates t LEFT JOIN players p ON p.id = t.player
      WHERE t.owner = ? ORDER BY t.sent_at`).bind(player.id).all();
    return {
      ok: true,
      templates: results.map((t) => {
        let d = null;
        try { d = JSON.parse(t.doc); } catch { d = null; }
        return { name: t.name ?? '', puts: Array.isArray(d?.put) ? d.put.length : 0, drops: Array.isArray(d?.drop) ? d.drop.length : 0, sentAt: t.sent_at };
      }),
    };
  }
  const who = await accountByName(db, body.name);
  if (!who) return { error: 'template-none' };
  if (op === 'read') {
    const t = await db.prepare('SELECT base, doc, sent_at FROM caravan_templates WHERE owner = ? AND player = ?').bind(player.id, who.id).first();
    if (!t) return { error: 'template-none' };
    let d = null;
    try { d = caravanTemplateOf(JSON.parse(t.doc)); } catch { d = null; }
    if (!d) return { error: 'template-none' };
    return { ok: true, name: who.handle, base: t.base, put: d.put, drop: d.drop, sentAt: t.sent_at };
  }
  if (op === 'answer') {
    const r = await db.prepare('DELETE FROM caravan_templates WHERE owner = ? AND player = ?').bind(player.id, who.id).run();
    if (!r?.meta?.changes) return { error: 'template-none' };
    if (body.accept !== true) await templateLetter(ctx, player, who.id, caravanDeclineLetter(displayName(player)), 'Your decorating template').catch(() => false);
    return { ok: true, name: who.handle, accepted: body.accept === true };
  }
  return { error: 'bad-decor' };
}
