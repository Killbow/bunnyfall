// @ts-check
// How the player fought an enemy that may become a revenant, folded into its scars at the deed. A zero-import leaf:
// the brain, the magic rounds, and the hosts write to it, and none of them may pull in the revenant system.

export const FEUD_CLASSES = Object.freeze(['blade', 'blunt', 'axe', 'h2h', 'arrow', 'fire', 'frost', 'shock', 'poison', 'magic', 'other']);
// Indexed by the spell element number, 0 to 4: fire, cold, poison, shock, and magic.
const ELEMENT_CLASS = Object.freeze(['fire', 'frost', 'poison', 'shock', 'magic']);
export const elementFeudClass = (element) => ELEMENT_CLASS[element] ?? 'magic';
const COUNTS = Object.freeze(['staggers', 'dodged', 'perfect', 'backHits', 'weak']);

/** @type {null | ((entity: any) => boolean)} */
let _gate = null;
/** @type {null | ((entity: any, info: any) => boolean)} */
let _weak = null;
/** @type {null | ((entity: any, opts?: { peer?: boolean }) => void)} */
let _onWeak = null;
/** @type {null | (() => { now?: number, night?: boolean })} */
let _clock = null;
export function setFeudGate(fn) { _gate = typeof fn === 'function' ? fn : null; }
export function setFeudClock(fn) { _clock = typeof fn === 'function' ? fn : null; }
export function setFeudWeakTest(fn, onWeak = null) { _weak = typeof fn === 'function' ? fn : null; _onWeak = typeof onWeak === 'function' ? onWeak : null; }
export function feudRevealWeak(entity) {
  if (!entity?.revenant || !_onWeak) return;
  try { _onWeak(entity, { peer: true }); } catch { }
}
export function feudWeakBlow(entity, info = {}) {
  if (!_weak || !entity?.revenant) return false;
  try { return !!_weak(entity, info ?? {}); } catch { return false; }
}

export function feudOf(entity, open = true) {
  if (!entity || typeof entity !== 'object' || entity.isPlayer) return null;
  // The ledger lives on the entity, not its pool record, because every writer holds the entity.
  if (entity._feud) return entity._feud;
  if (!open || !_gate) return null;
  let ok = false;
  try { ok = !!_gate(entity); } catch { ok = false; }
  if (!ok) return null;
  let c = null;
  try { c = _clock?.() ?? null; } catch { c = null; }
  /** @type {Record<string, number>} */
  const dmg = {};
  for (const k of FEUD_CLASSES) dmg[k] = 0;
  const place = entity._feudPlace === 'building' || entity._feudPlace === 'dungeon' ? entity._feudPlace : 'street';
  entity._feud = { dmg, silver: 0, staggers: 0, dodged: 0, perfect: 0, backHits: 0, backstab: false, weak: 0, night: !!c?.night, place, start: Number.isFinite(c?.now) ? c.now : 0, last: null };
  return entity._feud;
}

export function noteFeudHarm(entity, cls, n, { silver = false, metal = null } = {}) {
  if (!(n > 0)) return;
  const l = feudOf(entity);
  if (!l) return;
  l.dmg[FEUD_CLASSES.includes(cls) ? cls : 'other'] += n;
  l.last = FEUD_CLASSES.includes(cls) ? cls : 'other';
  if (silver) l.silver += n;
  if (feudWeakBlow(entity, { cls, metal })) {
    l.weak++;
    try { _onWeak?.(entity); } catch { }
  }
}
export function noteFeud(entity, what) {
  if (!COUNTS.includes(what)) return;
  const l = feudOf(entity);
  if (l) l[what]++;
}
export function noteFeudBackstab(entity) {
  const l = feudOf(entity);
  if (l) l.backstab = true;
}
export function takeFeud(entity) {
  const l = entity?._feud ?? null;
  if (entity && typeof entity === 'object') entity._feud = null;
  return l;
}
