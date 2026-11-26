// @ts-check
// A paid share is written to `KT_OWED_KEY` at once and removed only after the spoils pool takes it. A crash in
// between grants it again, and the pool's per-receipt spent mark turns that into a no-op.
import { ketchSpoilsDay, ketchSpoilsList, KT_SPOILS_TEXT } from './ketchSpoils.js';
import { spoilsLevel, spoilsLock } from '../../worldEvents/spoilsPool.js';
import { deckToDungeon, KT_VAULT } from '../../net/ketch/ketchDeck.js';

// The mouth sits in front of and above the chest's solid box (0 to 0.8 m high in world/ketch/ketchModel.js); a
// spawn point inside that box traps every thrown piece.
export const KT_CHEST_MOUTH = Object.freeze({ out: 1.0, y: 1.2 });
export const ketchChestMouth = () => deckToDungeon(KT_VAULT.x, KT_CHEST_MOUTH.y, KT_VAULT.z - KT_CHEST_MOUTH.out);
export const KT_SPOILS_KEEP = Object.freeze({ centre: Object.freeze(deckToDungeon(1.5, 0, 228)), r: 2.6, floorY: deckToDungeon(0, 0, 0)[1] });

export const KT_OWED_KEY = 'kt.owed';
export const KT_SHARES_OWED_MAX = 8;

const owedOk = (e) => !!e && typeof e === 'object' && Number.isSafeInteger(e.d) && typeof e.o === 'string' && typeof e.s === 'string' && Number.isSafeInteger(e.c) && Number.isFinite(e.l);
const same = (a, b) => a.d === b.d && a.o === b.o && a.s === b.s;

/** @param {{ store?: { get: (k: string) => any, set: (k: string, v: any) => void }|null, pool: { grant: (o: any) => any, spew: (o: any) => boolean }, level: () => number, me: () => (string|null), aboard: () => boolean, say?: (text: string) => void, changed?: () => void, }} deps */
export function createKetchShares({ store = null, pool, level, me, aboard, say = () => {}, changed = () => {} }) {
  let memory = [];
  /** @returns {Array<{ d: number, o: string, s: string, c: number, l: number }>} */
  function owed() {
    let v;
    try { v = store ? store.get(KT_OWED_KEY) : undefined; } catch { v = undefined; }
    return (Array.isArray(v) ? v : v === undefined || v === null ? memory : []).filter(owedOk);
  }
  const keep = (list) => { memory = list; try { store?.set(KT_OWED_KEY, list); } catch { } };
  const drop = (e) => keep(owed().filter((k) => !same(k, e)));
  const lv = (e) => spoilsLevel(level() ?? 1, e.l);
  const mine = () => { const m = me(); return owed().filter((e) => !m || e.s === m); };
  function grant(e) {
    return spoilsLock(() => pool.grant({ day: ketchSpoilsDay(e.d, e.o), acct: e.s, roll: () => ketchSpoilsList(e.c, lv(e)), text: KT_SPOILS_TEXT.granted }))
      .then((given) => { drop(e); if (given) changed(); return !!given; })
      .catch((err) => { console.warn('[kt] spoils', err?.message ?? err); return false; });
  }
  return {
    paid(c) {
      const e = { d: c.d, o: c.o, s: c.s, c: c.c, l: c.l };
      if (!owedOk(e)) return false;
      if (!owed().some((k) => same(k, e))) keep([...owed().filter((k) => !same(k, e)), e].slice(-KT_SHARES_OWED_MAX));
      if (!aboard()) void grant(e);
      return true;
    },
    chest(at, bearing) {
      const e = mine()[0];
      if (!e) return false;
      const ok = pool.spew({ day: ketchSpoilsDay(e.d, e.o), seed: e.c, level: lv(e), at, bearing, acct: e.s, keep: KT_SPOILS_KEEP, roll: () => ketchSpoilsList(e.c, lv(e)) });
      if (ok) { drop(e); say(KT_SPOILS_TEXT.spilled); } else void grant(e);
      return true;
    },
    give() { return Promise.all(mine().map((e) => grant(e))); },
    owed,
  };
}
