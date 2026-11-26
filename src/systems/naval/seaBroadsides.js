// @ts-check
import { SEA_SHOT_MAX } from '../../net/wire.js';
import { SEA_REF } from '../../net/sea/seaRef.js';
import { t } from '../../ui/textManager.js';

export const SEA_SHOT_MS = 250;
// Keep under SEA_REF.helmMs: the referee refuses shots from a ship whose last helm word is older.
export const SEA_HELM_SAY_MS = 5_000;
export const SEA_HELM_MIN_MS = 500;
// Keep within SEA_REF.boardM.
export const SEA_BOARD_NEAR_M = 30;
export const SEA_BOARD_RETRY_MS = 2_000;
export const SEA_SAID_MS = 60_000;
// Below the referee's rate, with slack for words that bunch up on the way.
export const SEA_SHOT_HZ = SEA_REF.hz - 2;

/** @param {any} deps */
export function createSeaBroadsides(deps) {
  const now = () => Number(deps.now?.()) || Date.now();
  const pending = new Map();
  const mine = new Map();
  const saidTo = new Map();
  let shotAt = 0, helmAt = -Infinity, helmKey = 'off', open = false, words = SEA_SHOT_HZ, wordsAt = 0;
  const pvp = () => deps.naval?.()?.pvp ?? null;
  const once = (/** @type {string} */ key, /** @type {() => void} */ fn) => { const at = saidTo.get(key) ?? -Infinity; if (now() - at < SEA_SAID_MS) return; saidTo.set(key, now()); if (saidTo.size > 64) saidTo.delete(saidTo.keys().next().value); fn(); };
  const nameOf = (/** @type {string} */ id) => deps.name?.(id) || t('sea.pvp.someone', 'another captain');
  const helm = () => (open ? pvp()?.helm?.() ?? null : null);

  /**
   * @param {string} peer
   * @param {unknown} shooter
   * @param {boolean} byMe
   */
  function openOn(peer, shooter, byMe) {
    if (!open) return false;
    if (byMe) { const h = helm(); return !!h && !h.wrecked && !!deps.stranger?.(peer); }
    return typeof shooter === 'string' && shooter.startsWith('peer:') && shooter.slice(5) !== peer;
  }
  function shot(/** @type {string} */ peer, /** @type {any} */ hurt) {
    if (!open || !hurt) return;
    const acc = pending.get(peer) ?? { d: 0, s: 0, f: false };
    acc.d += Math.max(0, Number(hurt.hull) || 0);
    acc.s += Math.max(0, Number(hurt.sail) || 0);
    acc.f = acc.f || !!hurt.fire;
    pending.set(peer, acc);
  }
  function sayHelm(/** @type {number} */ at) {
    const h = helm();
    // A wrecked ship is said at zero hull, never as left, so the referee still credits the captain who broke her.
    const word = h ? { k: 'helm', hl: h.hl, t: Math.max(100, Math.min(240, Math.round(h.t * 100))), u: h.u, h: h.wrecked ? 0 : Math.max(0, Math.min(1000, Math.round(h.h * 1000))) } : null;
    const key = word ? `${word.hl},${word.u},${word.t},${word.h}` : 'off';
    if (key === helmKey ? at - helmAt < SEA_HELM_SAY_MS || key === 'off' : at - helmAt < SEA_HELM_MIN_MS) return;
    if (deps.send?.(word ?? { k: 'helm', hl: -1, t: 100, u: 0, h: 0 })) { helmKey = key; helmAt = at; }
  }
  const placeOf = (/** @type {unknown} */ p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1]), Number(p[2])] : null);
  const alongside = (/** @type {any} */ h, /** @type {unknown} */ p) => Array.isArray(p) && Math.hypot(h.pos[0] - p[0], h.pos[2] - p[2]) <= SEA_BOARD_NEAR_M;
  // Runs every online frame, paused or not, so the helm is still said while a window is open.
  function step() {
    const at = now();
    const was = open;
    open = !!deps.live?.();
    if (!open) {
      pending.clear();
      if (was && helmKey !== 'off' && deps.send?.({ k: 'helm', hl: -1, t: 100, u: 0, h: 0 })) { helmKey = 'off'; helmAt = at; }
      return;
    }
    sayHelm(at);
    if (at - shotAt >= SEA_SHOT_MS && pending.size) {
      shotAt = at;
      words = Math.min(SEA_SHOT_HZ, words + (Math.max(0, at - wordsAt) / 1000) * SEA_SHOT_HZ); wordsAt = at;
      // A ship that is said leaves the map and rejoins at the back, so the word budget rotates through the ships.
      for (const [to, acc] of pending) {
        const d = Math.min(SEA_SHOT_MAX, Math.round(acc.d)), s = Math.min(SEA_SHOT_MAX, Math.round(acc.s));
        if (!(d > 0 || s > 0 || acc.f)) continue;
        if (words < 1) break;
        if (!deps.send?.({ k: 'shot', to, d, s, f: acc.f ? 1 : 0 })) continue;
        words -= 1; pending.delete(to);
      }
    }
    const h = mine.size ? helm() : null;
    for (const [r, w] of mine) {
      if (at - w.at > SEA_REF.boardMs) { mine.delete(r); continue; }
      const her = placeOf(pvp()?.peerAt?.(w.victim));
      if (her) w.seen = her;
      if (!h?.pos || at - w.sentAt < SEA_BOARD_RETRY_MS || !(alongside(h, w.seen) || alongside(h, w.site))) continue;
      if (deps.send?.({ k: 'board', r }, { room: w.room })) {
        if (!w.sentAt) deps.mid?.(t('sea.pvp.boarded', 'You come alongside {name}\'s wreck and board her. Her hold is open to you.', { name: w.name }), 5);
        w.sentAt = at;
      }
    }
  }
  function hear(/** @type {any} */ g, /** @type {string | null} */ room = null) {
    const me = deps.me?.();
    if (!g || !me) return;
    if (g.k === 'hull') {
      if (g.to === me) {
        pvp()?.struck?.({ frac: g.d / 1000, sail: g.s / 1000, fire: g.f === 1, left: g.h / 1000 });
        once(`on:${g.by}`, () => deps.say?.(t('sea.pvp.underFire', '{name}\'s guns are on you!', { name: nameOf(g.by) }), 4));
      } else if (g.by === me) once(`by:${g.to}`, () => deps.say?.(t('sea.pvp.striking', 'Your broadside strikes {name}\'s ship.', { name: nameOf(g.to) }), 4));
      return;
    }
    if (g.k === 'wreck') {
      if (g.id === me) { pvp()?.wreck?.(); deps.mid?.(t('sea.pvp.wrecked', 'Your ship is wrecked by {name}\'s guns! She lies crippled.', { name: nameOf(g.by) }), 6); return; }
      if (g.by !== me) return;
      const name = nameOf(g.id), site = placeOf(pvp()?.peerAt?.(g.id));
      mine.set(g.r, { victim: g.id, at: now(), sentAt: 0, name, room, site, seen: site });
      if (mine.size > 8) mine.delete(mine.keys().next().value);
      deps.mid?.(t('sea.pvp.wreckedHer', '{name}\'s ship is wrecked! Come alongside and board her for her hold.', { name }), 6);
      return;
    }
    if (g.k === 'wc') { mine.delete(g.r); deps.receipt?.(g.rc); }
  }
  return { open: openOn, shot, step, hear, get live() { return open; } };
}
