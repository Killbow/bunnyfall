// @ts-check
import { accountSeaWreck } from '../../net/accountClient.js';
import { appStorage } from '../../platform/appStorage.js';
import { realmGoldAct } from '../../saves/realmSaves.js';
import { readSeaWreck } from '../../net/wildReceipt.js';
import { openSeaHold } from './seaHoldGuard.js';
import { addItem } from '../../items/inventory.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { t } from '../../ui/textManager.js';

// The killer asks this long after the receipt is signed, so the captain's own carry lands first.
export const SEA_WRECK_SLACK_S = 5;
export const SEA_WRECK_RETRY_MS = 15_000;
export const SEA_WRECK_CAPTAIN_RETRY_MS = 2_000;
// Answers that say nothing about the wreck; these are asked again until the receipt expires.
export const SEA_WRECK_TRANSIENT = Object.freeze(['grace', 'busy', 'offline', 'server', 'rate', 'seq', 'no-signing-key', 'no-gate-key']);
export const SEA_WRECK_KEPT_KEY = 'dfo.sea.wrecksDue';
export const SEA_WRECK_KEPT_MAX = 16;

/** @param {{ session: any, checkpoint: () => void, character: () => string, door: any, say?: (text: string, s?: number) => void }} o */
export function collectSeaPrizes({ session, checkpoint, character, door, say }) {
  return realmGoldAct({
    session, checkpoint: () => checkpoint(), needsAnswer: true,
    call: (/** @type {any} */ at) => door.collect({ character: character(), realm: at }),
    apply: (/** @type {any} */ a) => {
      const items = Array.isArray(a?.data?.items) ? a.data.items : [];
      for (const it of items) addItem((playerEntity.items ??= []), it);
      if (items.length) say?.(t('sea.pvp.prizeTaken', 'Plunder from boarded wrecks is now in your pack: {n, plural, one {# piece} other {# pieces}}.', { n: items.length }), 5);
    },
  });
}

/** @param {{ session: any, checkpoint: () => void, character: () => string, door: any, say?: (text: string, s?: number) => void }} o */
export function reclaimSeaPrizes({ session, checkpoint, character, door, say }) {
  return realmGoldAct({
    session, checkpoint: () => checkpoint(), needsAnswer: true,
    call: (/** @type {any} */ at) => door.reclaim({ character: character(), realm: at }),
    apply: (/** @type {any} */ a) => {
      const items = Array.isArray(a?.data?.items) ? a.data.items : [];
      for (const it of items) addItem((playerEntity.items ??= []), it);
      if (items.length) say?.(t('sea.pvp.holdBack', 'Goods the captain who boarded you never collected are back in your pack: {n, plural, one {# piece} other {# pieces}}.', { n: items.length }), 5);
    },
  });
}

/** @param {any} deps */
export function createSeaWreckHost(deps) {
  const now = () => Number(deps.now?.()) || Date.now();
  let door = deps.door ?? null;
  const doorNow = () => (door ??= accountSeaWreck({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }));
  const storage = () => { try { return deps.storage ?? appStorage(); } catch { return null; } };
  const seen = new Set();
  const due = new Map();
  let restoredFor = null;
  const say = (/** @type {string} */ text, s = 5) => deps.say?.(text, s);

  // Owed carries are saved in page storage so a reload does not lose them.
  const keep = () => { try { storage()?.setItem(SEA_WRECK_KEPT_KEY, JSON.stringify([...due.values()].map((w) => w.rc))); } catch { } };
  function owe(/** @type {string} */ rc, /** @type {any} */ c, /** @type {string} */ me, live = false) {
    const role = c.f === me ? 'captain' : c.k === me ? 'killer' : null;
    if (!role || seen.has(c.r) || now() / 1000 >= c.e) return false;
    seen.add(c.r);
    if (seen.size > 64) seen.delete(seen.values().next().value);
    due.set(c.r, { rc, c, role, at: role === 'killer' && live ? now() + SEA_WRECK_SLACK_S * 1000 : now(), busy: false });
    while (due.size > SEA_WRECK_KEPT_MAX) due.delete(due.keys().next().value);
    return true;
  }
  function restore(/** @type {string} */ me) {
    if (restoredFor === me) return;
    restoredFor = me;
    let list = [];
    try { list = JSON.parse(storage()?.getItem(SEA_WRECK_KEPT_KEY) ?? '[]'); } catch { list = []; }
    for (const rc of Array.isArray(list) ? list : []) { const c = typeof rc === 'string' ? readSeaWreck(rc) : null; if (c) owe(rc, c, me); }
  }
  function asCaptain(/** @type {any} */ w) {
    let stood = false;
    return realmGoldAct({
      session: deps.session, needsAnswer: true,
      checkpoint: () => { stood = deps.checkpoint?.() !== false; },
      // Only over a checkpoint that went; after a refused one, the prize is taken from a hold already emptied.
      call: (/** @type {any} */ at) => (stood ? doorNow().wreck({ receipt: w.rc, realm: at }) : Promise.resolve({ ok: false, error: 'busy' })),
      apply: (/** @type {any} */ a) => {
        const d = a?.data ?? {};
        const took = Array.isArray(d.took) ? d.took : [];
        const out = took.length ? deps.naval?.()?.pvp?.takeHold?.(w.c.u, took) ?? [] : [];
        const n = out.length || Math.max(0, Math.floor(Number(d.n) || 0));
        if (n) say(t('sea.pvp.holdTaken', 'Your wreck was boarded and her hold plundered: {n, plural, one {# piece} other {# pieces}} taken.', { n }), 6);
        else if (w.c.b === 1) say(t('sea.pvp.holdSpared', 'Your wreck was boarded, but nothing in the hold was worth taking.'), 5);
      },
    });
  }
  async function asKiller(/** @type {any} */ w) {
    const res = await doorNow().wreck({ receipt: w.rc });
    if (res?.ok && w.c.b === 1) await collectSeaPrizes({ session: deps.session, checkpoint: () => deps.checkpoint?.(), character: () => deps.character?.(), door: doorNow(), say: (x, s) => say(x, s) });
    return res;
  }
  function settled(/** @type {string} */ r, /** @type {any} */ w) {
    due.delete(r);
    keep();
    if (w.role === 'captain') openSeaHold(w.c.u);
  }
  function receipt(/** @type {unknown} */ rc) {
    const c = readSeaWreck(rc), me = deps.me?.() ?? null;
    if (!c || !me) return;
    restore(me);
    if (!owe(/** @type {string} */ (rc), c, me, true)) return;
    if (c.k === me && c.b !== 1) say(t('sea.pvp.notBoarded', 'You did not board the wreck in time. Her cargo remains with her captain.'), 5);
    keep();
  }
  function frame() {
    const me = deps.me?.() ?? null;
    if (me) restore(me);
    if (!due.size || !deps.session || deps.session.lost) return;
    const at = now();
    for (const [r, w] of due) {
      if (w.busy || at < w.at) continue;
      if (at / 1000 >= w.c.e) { settled(r, w); continue; }
      w.busy = true;
      (w.role === 'captain' ? asCaptain(w) : asKiller(w)).then((/** @type {any} */ res) => {
        if (res?.ok || res?.unknown || !SEA_WRECK_TRANSIENT.includes(res?.error)) { settled(r, w); return; }
        w.at = now() + (w.role === 'captain' ? SEA_WRECK_CAPTAIN_RETRY_MS : SEA_WRECK_RETRY_MS);
      }).catch((e) => { console.warn('[sea] the wreck failed', e?.message ?? e); w.at = now() + SEA_WRECK_RETRY_MS; }).finally(() => { w.busy = false; });
    }
  }
  return { receipt, frame };
}
