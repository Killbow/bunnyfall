// @ts-check
import { createDecoratorsPanel, createTemplateBar } from '../ui/decoratorsPanel.js';
import { decorPieceOf, decorYardPieceOf, DECOR_CAP, DECOR_YARD_CAP } from '../net/decorLaw.js';
import { decoratorPieceOk, templatePrice } from '../net/decoratorLaw.js';
import { walletReserve } from '../net/realmGoldLaw.js';
import { mintDecorTxn } from './decorDraft.js';
import { caravanBaseOf, caravanTemplateApply, caravanTemplateOf } from '../systems/caravanTemplate.js';
import { t } from '../ui/textManager.js';

export const DECORATOR_TEXT = Object.freeze({
  get saved() { return t('decor.template.saved', 'Template saved.'); },
  sent: (name) => t('decor.template.sent', 'Template sent to {name}.', { name }),
  declined: (name) => t('decor.template.declined', '{name} declined your template.', { name }),
  get accepted() { return t('decor.template.accepted', 'The template is in place.'); },
  get declinedOwner() { return t('decor.template.declinedOwner', 'You declined the template and returned it to the decorator.'); },
  short: (gold) => t('decor.template.short', 'You need {gold} gold in your purse and bank to accept this template.', { gold: Number(gold).toLocaleString('en-US') }),
  get full() { return t('decor.template.full', 'This template no longer fits. The room or yard would hold too many pieces.'); },
  get changed() { return t('decor.template.changed', 'The decorator changed this template. Preview it again.'); },
  get stale() { return t('decor.template.stale', 'Your caravan changed after this template was made. Ask for a new one.'); },
  value: (gold) => t('decor.template.value', 'Template value: {gold} gold', { gold: Number(gold).toLocaleString('en-US') }),
  get waiting() { return t('decor.template.waiting', 'A decorator sent you a template. Open Decorators in the decorate panel to preview it.'); },
  added: (name) => t('decor.decorators.added', '{name} can decorate this home now.', { name }),
  addedCaravan: (name) => t('caravan.decorators.added', '{name} can send you templates for your caravan now.', { name }),
  removed: (name) => t('decor.decorators.removed', '{name} can no longer decorate this home.', { name }),
  where: (name) => t('decor.decorators.where', "{name}'s home (template)", { name }),
  whereYard: (name) => t('decor.decorators.whereYard', "{name}'s yard (template)", { name }),
  whereCaravan: (name) => t('caravan.decorators.where', "{name}'s caravan (template)", { name }),
  get unsaved() { return t('decor.template.unsaved', 'Confirm your changes before you send the template.'); },
  get notSent() { return t('decor.template.notSent', 'The template could not be sent.'); },
  get notRead() { return t('decor.template.notRead', 'The template could not be loaded.'); },
  line: (name, pieces) => t('decor.decorators.line', '{name}: {pieces, plural, one {# template piece} other {# template pieces}}', { name, pieces }),
  lineSent: (name, pieces) => t('decor.decorators.lineSent', '{name}: template sent, {pieces, plural, one {# piece} other {# pieces}}', { name, pieces }),
});

/**
 * @param {any[]} pieces
 * @param {{ modelRadius: (id: number) => (number | null), flatRadius: (a: number, r: number) => Promise<number | null> }} scan
 */
export async function radiiOf(pieces, scan) {
  const out = new Map();
  for (const p of pieces ?? []) {
    const r = p.model != null ? scan.modelRadius(p.model) : Array.isArray(p.flat) ? await scan.flatRadius(p.flat[0], p.flat[1]) : null;
    if (Number.isFinite(r) && r > 0) out.set(p.id, r);
  }
  return out;
}

export function createDecoratorHome(deps) {
  const yard = !!deps.yard;
  const poolNow = () => deps.poolNow?.() ?? deps.pool;
  let dec = null;
  const drafts = new Map();
  const decNow = () => (yard ? drafts.get(deps.visit?.()) ?? null : dec);
  const areaOf = (data) => (yard ? data.yard ?? [] : data.pieces ?? []).map((p) => (yard ? decorYardPieceOf(p) : decorPieceOf(p))).filter(Boolean);
  let cv = null;
  let prev = null;
  let panel = null, bar = null, slot = null, panelAt = null;
  let toldWaiting = -1;
  const visitNow = () => deps.visit?.() ?? 0;
  const live = (o) => !!o && o.visit === visitNow();
  const refusal = (r, fallback) => deps.refusal?.(r?.error) ?? fallback;

  async function stood(home, mapId, buildingKey, into = null, restood = true) {
    const visit = yard ? `${mapId}:${buildingKey}` : visitNow();
    if (home?.decorator && !home.own) {
      const had = yard ? drafts.get(visit) : null;
      if (had) {
        if (had.ready && into && restood) for (const p of had.pieces.values()) if (!into.pieceOf?.(p.id)) into.put(p);
        return;
      }
      const ask = { visit, mapId, buildingKey, owner: home.owner, ready: false, draftRev: 0, mine: new Set(), pieces: new Map(), sentAt: null, saving: false };
      if (yard) drafts.set(visit, ask); else dec = ask;
      const r = await Promise.resolve(deps.homes?.()?.decorators({ op: 'draft', mapId, buildingKey, character: deps.character?.() })).catch(() => null);
      if (yard ? drafts.get(visit) !== ask : dec !== ask || !live(ask)) return;
      if (!r?.ok) { if (yard) drafts.delete(visit); else dec = null; if (r?.error && !yard) deps.say?.(refusal(r, DECORATOR_TEXT.notRead)); return; }
      const target = into ?? poolNow();
      for (const p of areaOf(r.data)) { if (!target.pieceOf?.(p.id)) target.put(p); ask.mine.add(p.id); ask.pieces.set(p.id, p); }
      ask.draftRev = Number(r.data.draftRev) || 0;
      ask.sentAt = r.data.sentAt ?? null;
      ask.ready = true;
      if (r.data.declined && !yard) deps.say?.(DECORATOR_TEXT.declined(home.owner));
      return;
    }
    if (!yard && home?.own && !home.hall && !home.deed && toldWaiting !== visit) {
      toldWaiting = visit;
      const r = await Promise.resolve(deps.homes?.()?.decorators({ op: 'list', mapId, buildingKey, character: deps.character?.() })).catch(() => null);
      if (visitNow() === visit && r?.ok && (r.data.decorators ?? []).some((d) => d.sentAt != null)) deps.say?.(DECORATOR_TEXT.waiting);
    }
  }

  async function caravanStood(owner, doc, pieces) {
    const visit = visitNow();
    if (!cv || cv.visit !== visit || cv.owner !== owner) {
      cv = { visit, owner, may: false, base: pieces, sent: false };
      const ask = cv;
      const r = await Promise.resolve(deps.homes?.()?.caravanTemplates({ op: 'may', owner })).catch(() => null);
      if (cv === ask && r?.ok && r.data?.may) ask.may = true;
      return;
    }
    cv.base = pieces;
  }

  /**
   * @param {any} home
   * @param {number} mapId
   * @param {number} buildingKey
   * @param {boolean} listed
   */
  function roomHere(home, mapId, buildingKey, listed) {
    if (live(prev)) return null;
    if (home?.decorator && !home.own) {
      const d = decNow();
      if (!listed || !live(d) || !d.ready || d.mapId !== mapId || d.buildingKey !== buildingKey) return null;
      if (yard) return { kind: 'home', yard: true, template: true, free: true, cap: DECOR_YARD_CAP, where: DECORATOR_TEXT.whereYard(home.owner), mapId, buildingKey };
      return { kind: 'home', template: true, free: true, cap: DECOR_CAP, where: DECORATOR_TEXT.where(home.owner), mapId, buildingKey };
    }
    return undefined;
  }
  function caravanRoomHere() {
    if (!live(cv) || !cv.may) return undefined;
    return { kind: 'caravan', template: true, free: true, cap: DECOR_CAP, where: DECORATOR_TEXT.whereCaravan(cv.owner) };
  }
  function editable(piece) {
    const d = decNow();
    if (live(d)) return !!piece && d.mine.has(piece.id);
    if (live(cv) && cv.may) return decoratorPieceOk(piece);
    return true;
  }
  const sendable = () => { const d = decNow(); return (live(d) && d.ready && d.mine.size > 0) || (live(cv) && cv.may); };

  async function save({ put, drop }) {
    const d = decNow();
    if (live(cv) && cv.may && !live(d)) { deps.say?.(DECORATOR_TEXT.saved); return { ok: true }; }
    if (!live(d) || d.saving) return { ok: false };
    d.saving = true;
    try {
      const write = () => Promise.resolve(deps.decor?.()?.draft({ mapId: d.mapId, buildingKey: d.buildingKey, character: deps.character?.(), draftRev: d.draftRev, put, drop, yard })).catch(() => null);
      let r = await write();
      if (r?.error === 'draft-changed') {
        // The room and yard share one draft revision, so a stale save retries only when this area's pieces match.
        const again = await Promise.resolve(deps.homes?.()?.decorators({ op: 'draft', mapId: d.mapId, buildingKey: d.buildingKey, character: deps.character?.() })).catch(() => null);
        const ids = again?.ok ? areaOf(again.data).map((p) => p.id).sort().join(',') : null;
        if (ids != null && ids === [...d.mine].sort().join(',')) { d.draftRev = Number(again.data.draftRev) || 0; r = await write(); }
      }
      if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notSent)); return { ok: false }; }
      d.draftRev = Number(r.data.draftRev) || d.draftRev;
      d.sentAt = null;
      for (const id of drop) { d.mine.delete(id); d.pieces.delete(id); }
      for (const p of put) { d.mine.add(p.id); d.pieces.set(p.id, p); }
      deps.say?.(DECORATOR_TEXT.saved);
      return { ok: true };
    } finally { d.saving = false; }
  }

  async function send(dirty = false) {
    if (dirty) { deps.say?.(DECORATOR_TEXT.unsaved); return false; }
    const d = decNow();
    if (live(d)) {
      const r = await Promise.resolve(deps.homes?.()?.decorators({ op: 'send', mapId: d.mapId, buildingKey: d.buildingKey, character: deps.character?.() })).catch(() => null);
      if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notSent)); return false; }
      d.sentAt = r.data.sentAt ?? Date.now();
      deps.say?.(DECORATOR_TEXT.sent(d.owner));
      return true;
    }
    if (live(cv) && cv.may) {
      const now = deps.caravanSaved?.(poolNow().list()) ?? poolNow().list();
      const tpl = caravanTemplateOf(cv.base, now);
      if ('error' in tpl) { deps.say?.(deps.refusal?.(tpl.error) ?? DECORATOR_TEXT.notSent); return false; }
      const r = await Promise.resolve(deps.homes?.()?.caravanTemplates({ op: 'send', owner: cv.owner, base: caravanBaseOf(cv.base), put: tpl.put, drop: tpl.drop })).catch(() => null);
      if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notSent)); return false; }
      deps.say?.(DECORATOR_TEXT.sent(cv.owner));
      return true;
    }
    return false;
  }

  async function openPanel(at) {
    panel ??= createDecoratorsPanel({
      doc: deps.doc,
      onAdd: (name) => { act('grant', name); },
      onRemove: (name) => { act('revoke', name); },
      onPreview: (name) => { closePanel(); preview(name); },
      onClose: () => { const s = slot; slot = null; if (s) panelAt?.hide?.(s); },
    });
    panelAt = at;
    const model = await readModel(at);
    if (panelAt !== at) return false;
    if (panel.isOpen()) { panel.update(model); return true; }
    slot = panel.open(model);
    at.show?.(slot);
    return true;
  }
  function closePanel() { panel?.close(); }
  async function readModel(at) {
    const api = deps.homes?.();
    if (at.caravan) {
      const [who, sent] = await Promise.all([
        Promise.resolve(api?.caravanDecorators({ op: 'list' })).catch(() => null),
        Promise.resolve(api?.caravanTemplates({ op: 'list' })).catch(() => null),
      ]);
      return {
        caravan: true, inside: !!deps.caravan?.(),
        rows: (who?.data?.decorators ?? []).map((d) => ({ name: d.name, line: d.name })),
        templates: (sent?.data?.templates ?? []).map((s) => ({ name: s.name, line: DECORATOR_TEXT.lineSent(s.name, s.puts + s.drops) })),
        note: who?.ok ? null : refusal(who, DECORATOR_TEXT.notRead),
      };
    }
    const r = await Promise.resolve(api?.decorators({ op: 'list', mapId: at.mapId, buildingKey: at.buildingKey, character: deps.character?.() })).catch(() => null);
    const list = r?.data?.decorators ?? [];
    return {
      caravan: false, inside: !!at.inside,
      rows: list.map((d) => ({ name: d.name, line: d.sentAt != null ? DECORATOR_TEXT.lineSent(d.name, d.pieces + d.yardPieces) : DECORATOR_TEXT.line(d.name, d.pieces + d.yardPieces) })),
      templates: list.filter((d) => d.sentAt != null).map((d) => ({ name: d.name, line: DECORATOR_TEXT.lineSent(d.name, d.pieces + d.yardPieces) })),
      canAdd: list.length < (Number(r?.data?.max) || 4),
      note: r?.ok ? null : refusal(r, DECORATOR_TEXT.notRead),
    };
  }
  async function act(op, name) {
    const at = panelAt;
    if (!at) return;
    const api = deps.homes?.();
    const r = at.caravan
      ? await Promise.resolve(api?.caravanDecorators({ op, name })).catch(() => null)
      : await Promise.resolve(api?.decorators({ op, name, mapId: at.mapId, buildingKey: at.buildingKey, character: deps.character?.() })).catch(() => null);
    const said = r?.ok ? (op === 'grant' ? (at.caravan ? DECORATOR_TEXT.addedCaravan(r.data.name) : DECORATOR_TEXT.added(r.data.name)) : DECORATOR_TEXT.removed(r.data.name)) : refusal(r, DECORATOR_TEXT.notRead);
    deps.say?.(said);
    if (panelAt !== at || !panel?.isOpen()) return;
    panel.update({ ...(await readModel(at)), note: said });
  }

  function ensureBar() {
    bar ??= createTemplateBar({ doc: deps.doc, onAccept: () => { accept(); }, onDecline: () => { decline(); }, onClose: () => { closePreview(); } });
    return bar;
  }
  const showBar = () => { if (live(prev)) ensureBar().show({ name: prev.name, gold: prev.price?.total ?? (prev.caravan ? prev.apply?.pay ?? null : null), busy: prev.busy }); };
  async function preview(name) {
    if (live(prev)) closePreview();
    const at = panelAt;
    const visit = visitNow();
    if (at?.caravan) return previewCaravan(name, visit);
    if (!at?.inside) return false;
    const r = await Promise.resolve(deps.homes?.()?.decorators({ op: 'draft', name, mapId: at.mapId, buildingKey: at.buildingKey, character: deps.character?.() })).catch(() => null);
    if (visitNow() !== visit) return false;
    if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notRead)); return false; }
    const pieces = (r.data.pieces ?? []).map((p) => decorPieceOf(p)).filter(Boolean);
    const outside = (r.data.yard ?? []).map((p) => decorYardPieceOf(p)).filter(Boolean);
    const pool = poolNow();
    const standing = new Set(pool.list().map((p) => p.id));
    prev = { visit, caravan: false, name: r.data.name ?? name, mapId: at.mapId, buildingKey: at.buildingKey, draftRev: Number(r.data.draftRev) || 0, pool, ids: [], price: null, busy: false, txn: mintDecorTxn() };
    for (const p of yard ? outside : pieces) if (!standing.has(p.id)) { pool.put(p); prev.ids.push(p.id); }
    showBar();
    const p0 = prev;
    const radii = await radiiOf([...pieces, ...outside], deps.scan());
    if (prev !== p0) return true;
    prev.price = templatePrice([...pieces, ...outside], (piece) => radii.get(piece.id) ?? null);
    showBar();
    return true;
  }
  async function previewCaravan(name, visit) {
    const current = deps.caravan?.();
    if (!current) return false;
    const r = await Promise.resolve(deps.homes?.()?.caravanTemplates({ op: 'read', name })).catch(() => null);
    if (visitNow() !== visit) return false;
    if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notRead)); return false; }
    const tpl = { base: r.data.base, put: r.data.put ?? [], drop: r.data.drop ?? [] };
    const radii = await radiiOf(tpl.put, deps.scan());
    if (visitNow() !== visit) return false;
    const apply = caravanTemplateApply(current, tpl, (p) => radii.get(p.id) ?? null);
    if ('error' in apply) {
      deps.say?.(apply.error === 'stale' ? DECORATOR_TEXT.stale : deps.refusal?.(apply.error) ?? DECORATOR_TEXT.notRead);
      if (apply.error === 'stale') await Promise.resolve(deps.homes?.()?.caravanTemplates({ op: 'answer', name, accept: false })).catch(() => null);
      return false;
    }
    const pool = poolNow();
    const before = pool.list().map((p) => JSON.parse(JSON.stringify(p)));
    prev = { visit, caravan: true, name: r.data.name ?? name, pool, before, current, apply, price: null, busy: false };
    pool.showSaved?.(() => before);
    pool.set(deps.caravanTurned?.(apply.pieces) ?? apply.pieces);
    showBar();
    return true;
  }
  function closePreview() {
    const p = prev;
    prev = null;
    bar?.hide();
    if (!p || p.visit !== visitNow()) return;
    if (p.caravan) { p.pool.set(p.before); p.pool.showSaved?.(null); return; }
    for (const id of p.ids) p.pool.remove(id);
  }
  async function accept() {
    const p = prev;
    if (!live(p) || p.busy) return false;
    if (p.caravan) return acceptCaravan(p);
    if (!p.price) return false;
    const wallet = deps.wallet();
    if (wallet.gold < p.price.total) { deps.say?.(DECORATOR_TEXT.short(p.price.total)); return false; }
    const act = deps.realm?.();
    if (!act) { deps.say?.(deps.refusal?.('realm-needed') ?? DECORATOR_TEXT.notRead); return false; }
    p.busy = true;
    showBar();
    try {
      const body = { mapId: p.mapId, buildingKey: p.buildingKey, character: deps.character?.(), name: p.name, draftRev: p.draftRev, txn: p.txn, paid: p.price.paid };
      const paid = walletReserve(wallet, p.price.total);
      const res = await act({ reserve: paid.reserve, needsAnswer: false, apply: () => {}, call: (/** @type {any} */ at) => deps.decor?.()?.accept({ ...body, realm: at }) });
      if (!res?.ok) {
        paid.back();
        const e = res?.error;
        deps.say?.(e === 'realm-gold' ? DECORATOR_TEXT.short(p.price.total) : e === 'decor-cap' || e === 'yard-cap' || e === 'yard-town-full' ? DECORATOR_TEXT.full : e === 'draft-changed' || e === 'draft-unsent' ? DECORATOR_TEXT.changed : refusal(res, DECORATOR_TEXT.notRead));
        return false;
      }
      if (prev === p) {
        prev = null;
        bar?.hide();
        for (const id of p.ids) p.pool.remove(id);
        for (const piece of (yard ? res.data?.yard : res.data?.pieces) ?? []) { const q = yard ? decorYardPieceOf(piece) : decorPieceOf(piece); if (q) p.pool.put(q); }
        deps.kept?.(res.data?.rev ?? null);
      }
      deps.say?.(DECORATOR_TEXT.accepted);
      return true;
    } finally { p.busy = false; if (prev === p) showBar(); }
  }
  async function acceptCaravan(p) {
    const wallet = deps.wallet();
    if (wallet.gold < p.apply.pay) { deps.say?.(DECORATOR_TEXT.short(p.apply.pay)); return false; }
    const now = deps.caravan?.();
    if (!now || caravanBaseOf(now) !== caravanBaseOf(p.current)) { deps.say?.(DECORATOR_TEXT.stale); closePreview(); return false; }
    p.busy = true;
    try {
      if (p.apply.pay > 0) wallet.pay(p.apply.pay);
      if (p.apply.back > 0) wallet.credit?.(p.apply.back);
      prev = null;
      bar?.hide();
      p.pool.showSaved?.(null);
      deps.caravanSet?.(p.apply.pieces);
      deps.kept?.(null);
      deps.say?.(DECORATOR_TEXT.accepted);
      await Promise.resolve(deps.homes?.()?.caravanTemplates({ op: 'answer', name: p.name, accept: true })).catch(() => null);
      return true;
    } finally { p.busy = false; }
  }
  async function decline() {
    const p = prev;
    if (!live(p) || p.busy) return false;
    p.busy = true;
    showBar();
    const api = deps.homes?.();
    const r = p.caravan
      ? await Promise.resolve(api?.caravanTemplates({ op: 'answer', name: p.name, accept: false })).catch(() => null)
      : await Promise.resolve(api?.decorators({ op: 'decline', name: p.name, mapId: p.mapId, buildingKey: p.buildingKey, character: deps.character?.() })).catch(() => null);
    p.busy = false;
    if (!r?.ok) { deps.say?.(refusal(r, DECORATOR_TEXT.notRead)); showBar(); return false; }
    closePreview();
    deps.say?.(DECORATOR_TEXT.declinedOwner);
    return true;
  }

  function openerHere() {
    const h = deps.here?.();
    if (!h || live(prev) || !deps.homes?.()) return null;
    if (h.caravan) return () => { openPanel({ caravan: true, show: deps.show, hide: deps.hide }); };
    if (h.home?.own && !h.home.hall && !h.home.deed) return () => { openPanel({ mapId: h.mapId, buildingKey: h.buildingKey, inside: true, show: deps.show, hide: deps.hide }); };
    return null;
  }

  return {
    openerHere, value: (gold) => DECORATOR_TEXT.value(gold),
    stood, caravanStood, roomHere, caravanRoomHere, editable, sendable, save, send,
    openPanel, closePanel, preview, closePreview, accept, decline,
    previewing: () => live(prev),
    state: () => ({ decorator: live(dec) ? { mine: [...dec.mine], draftRev: dec.draftRev, sentAt: dec.sentAt, ready: dec.ready } : null,
      caravan: live(cv) ? { owner: cv.owner, may: cv.may } : null, preview: live(prev) ? { name: prev.name, gold: prev.price?.total ?? prev.apply?.pay ?? null, caravan: prev.caravan } : null }),
    left() { prev = null; bar?.hide(); closePanel(); },
  };
}
