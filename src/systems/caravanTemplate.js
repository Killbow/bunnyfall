// @ts-check
// A caravan template, as the decorator makes it and the owner checks it. Pieces are in the save's
// (unturned) frame, as caravanVisit.js documents them. Pure: no DOM, no network, no clock.
import { decorGoldMove, decorPieceOf, decorPrice, mintDecorId, DECOR_PRICE_MIN, DECOR_PRICE_MAX } from '../net/decorLaw.js';
import { decoratorPieceOk, templateBaseOf } from '../net/decoratorLaw.js';
import { decorDelta } from '../homes/decorDraft.js';

/** The hash a template is made against: the caravan's pieces as a visitor reads them. @param {any[]} pieces */
export const caravanBaseOf = (pieces) => templateBaseOf(JSON.stringify((pieces ?? []).map(decorPieceOf).filter(Boolean)));

const sameWhat = (a, b) => (a.model ?? null) === (b.model ?? null) && JSON.stringify(a.flat ?? null) === JSON.stringify(b.flat ?? null);

/**
 * The decorator's side: what changed from `base` to `now`, as `{ put, drop }` - only plain pieces, or `{ error }`.
 * @param {any[]} base @param {any[]} now
 */
export function caravanTemplateOf(base, now) {
  const { put, drop } = decorDelta(base, now);
  const was = new Map((base ?? []).map((p) => [p.id, p]));
  for (const id of drop) if (!decoratorPieceOk(was.get(id))) return { error: 'decorator-piece' };
  const out = [];
  for (const p of put) {
    const piece = decorPieceOf({ ...p, paid: 0 });
    if (!piece || !decoratorPieceOk(piece)) return { error: 'decorator-piece' };
    const had = was.get(piece.id);
    if (had && (!decoratorPieceOk(had) || !sameWhat(had, piece))) return { error: 'decorator-piece' };
    out.push(piece);
  }
  if (!out.length && !drop.length) return { error: 'draft-empty' };
  return { put: out, drop };
}

/**
 * The owner's side. `current` is the caravan's pieces, unturned; `radiusOf` gives a piece's radius, or null.
 * The price is the value of new pieces plus the growth of moved ones, less half the value of removed ones.
 * Answers `{ error }` ('stale', 'decorator-piece', 'pricing') or `{ pieces, pay, back, added, moved, removed }`.
 * @param {any[]} current @param {{ base: string, put: any[], drop: string[] }} template
 * @param {(piece: any) => (number | null)} radiusOf @param {() => number} [rand]
 */
export function caravanTemplateApply(current, template, radiusOf, rand = Math.random) {
  if (caravanBaseOf(current) !== template?.base) return { error: 'stale' };
  const have = new Map((current ?? []).map((p) => [p.id, p]));
  const drops = new Set(template.drop ?? []);
  for (const id of drops) if (!have.has(id) || !decoratorPieceOk(have.get(id))) return { error: 'decorator-piece' };
  let delta = 0;
  let added = 0, moved = 0;
  const next = new Map();
  for (const p of current) if (!drops.has(p.id)) next.set(p.id, p);
  for (const id of drops) delta += decorGoldMove(have.get(id), null).delta;
  for (const raw of template.put ?? []) {
    const p = decorPieceOf({ ...raw, paid: 0 });
    if (!p || !decoratorPieceOk(p)) return { error: 'decorator-piece' };
    const price = decorPrice(Number(radiusOf(p)), p.scale);
    if (!(price >= DECOR_PRICE_MIN && price <= DECOR_PRICE_MAX)) return { error: 'pricing' };
    const had = have.get(p.id);
    if (had && !drops.has(p.id)) {
      if (!decoratorPieceOk(had) || !sameWhat(had, p)) return { error: 'decorator-piece' };
      const now = { ...p, paid: p.scale === had.scale ? Number(had.paid) || 0 : price };
      delta += decorGoldMove(had, now).delta;
      next.set(p.id, { ...had, pos: now.pos, rot: now.rot, scale: now.scale, light: now.light, paid: now.paid });
      moved++;
      continue;
    }
    let id = p.id;
    while (next.has(id) || have.has(id)) id = mintDecorId(rand);
    next.set(id, { ...p, id, paid: price });
    delta -= price;
    added++;
  }
  return { pieces: [...next.values()], pay: Math.max(0, -delta), back: Math.max(0, delta), added, moved, removed: drops.size };
}
