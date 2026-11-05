// @ts-check
// BUNNYFALL (2026-11-05, Phase 5): THE ACCOUNT VAULT'S BOOK - the page's half of server-account/src/accountVault.js. The acts
// are the guild vault's (net/guild/guildBook.js vaultPut / vaultTake / deposit / withdraw), one owner: the save is
// checkpointed and held, the piece (or the gold) leaves the pack at once, the service moves it on the realm record, and a
// refusal puts it back. Everything it touches is handed in, so this file asks and never reaches a pack.
import { walletReserve } from './realm/realmGoldLaw.js';

/** The one gold move allowed in an act (the service's own bound). */
export const VAULT_MOVE_MAX = 1_000_000;

/**
 * @param {{
 *   door: ReturnType<typeof import('./accountClient.js').accountVaultDoor>,
 *   character: () => string | null,
 *   realm: { act: (o: any) => Promise<any>, abandon?: (why: string) => void } | null,
 *   pack: { items: () => any[], add: (rec: any) => void, changed: () => void, refuses?: (it: any) => boolean },
 *   wallet: () => { gold: () => number, pay: (n: number) => any, credit: (n: number, o?: any) => void, paper?: (n: number) => boolean, region?: () => number },
 * }} deps
 */
export function createAccountVaultBook(deps) {
  let view = null, error = null, gen = 0, busy = false;
  const book = {
    get view() { return view; },
    get error() { return error; },
    get busy() { return busy; },
    /** The vault as the service holds it: `{ max, gold, items: [{ slot, rec, name, count, by, at }] }`. */
    async read() {
      const my = ++gen;
      const r = await deps.door.read();
      if (my !== gen) return r;
      if (r?.ok) { view = r.data?.vault ?? null; error = null; } else { view = null; error = r?.error ?? 'server'; }
      return r;
    },
    /** A piece in: the pack's own record, `count` of its stack (all where absent). */
    async put(item, count = null) {
      const character = deps.character();
      if (!deps.realm || !character) return { ok: false, error: 'realm-only' };
      const items = deps.pack.items();
      const pick = items.indexOf(item);
      const stack = Number.isSafeInteger(item?.stackCount) && item.stackCount >= 1 ? item.stackCount : 1;
      const n = count == null ? stack : count;
      if (pick < 0 || deps.pack.refuses?.(item)) return { ok: false, error: 'vault-goods' };
      if (!Number.isSafeInteger(n) || n < 1 || n > stack) return { ok: false, error: 'bad-vault-count' };
      const offer = JSON.parse(JSON.stringify(item));
      busy = true;
      try {
        const r = await deps.realm.act({
          reserve: () => {
            const list = deps.pack.items();
            const whole = n === stack;
            const at = list.indexOf(item);
            if (whole) { if (at >= 0) list.splice(at, 1); } else item.stackCount -= n;
            deps.pack.changed();
            return () => { if (whole) { if (!list.includes(item)) list.splice(Math.min(at, list.length), 0, item); } else item.stackCount += n; deps.pack.changed(); };
          },
          call: (/** @type {any} */ at) => deps.door.put({ character, realm: at, pick, item: offer, count: n }),
        });
        if (r?.ok) await book.read().catch(() => {});
        return r;
      } finally { busy = false; }
    },
    /** A piece out: the slot's (as the last read said it), or `count` of its stack. The answer is the piece. */
    async take(slot, count = null) {
      const character = deps.character();
      if (!deps.realm || !character) return { ok: false, error: 'realm-only' };
      const seen = view?.items?.find((/** @type {any} */ x) => x.slot === slot) ?? null;
      if (!seen) return { ok: false, error: 'avault-empty' };
      busy = true;
      try {
        const r = await deps.realm.act({
          needsAnswer: true,
          apply: (/** @type {any} */ a) => {
            const rec = a?.data?.item;
            let held = false;
            if (rec && typeof rec === 'object') {
              try { deps.pack.add(rec); deps.pack.changed(); held = true; } catch (e) { console.warn('[vault] a piece would not go in the pack', e?.message ?? e); }
            }
            if (!held) deps.realm?.abandon?.('unknown');
          },
          call: (/** @type {any} */ at) => deps.door.take({ character, realm: at, slot, count, at: seen.at }),
        });
        await book.read().catch(() => {});
        return r;
      } finally { busy = false; }
    },
    /** Gold in (the purse first; a refusal gives it back). */
    async deposit(gold) {
      const character = deps.character();
      const w = deps.wallet();
      if (!deps.realm || !character) return { ok: false, error: 'realm-only' };
      if (!Number.isSafeInteger(gold) || gold < 1 || gold > VAULT_MOVE_MAX) return { ok: false, error: 'bad-gold' };
      if (w.gold() < gold) return { ok: false, error: 'gold' };
      busy = true;
      try {
        const r = await deps.realm.act({
          reserve: walletReserve(w, gold).reserve,
          call: (/** @type {any} */ at) => deps.door.gold({ character, realm: at, gold, kind: 'deposit', region: w.region?.() ?? null }),
        });
        if (r?.ok) await book.read().catch(() => {});
        return r;
      } finally { busy = false; }
    },
    /** Gold out (a sum the pack cannot carry as coin comes as a letter of credit, as the guild treasury's does). */
    async withdraw(gold) {
      const character = deps.character();
      const w = deps.wallet();
      if (!deps.realm || !character) return { ok: false, error: 'realm-only' };
      if (!Number.isSafeInteger(gold) || gold < 1 || gold > VAULT_MOVE_MAX) return { ok: false, error: 'bad-gold' };
      const letter = w.paper?.(gold) === true;
      busy = true;
      try {
        const r = await deps.realm.act({
          apply: () => w.credit(gold, { letter }),
          call: (/** @type {any} */ at) => deps.door.gold({ character, realm: at, gold, kind: 'withdraw', letter }),
        });
        if (r?.ok) await book.read().catch(() => {});
        return r;
      } finally { busy = false; }
    },
  };
  return book;
}

/** The refusals in the player's words. */
export const vaultWords = (/** @type {string|undefined} */ code) => ({
  'avault-full': 'The vault is full. Take something out first.',
  'avault-empty': 'That piece is no longer in the vault.',
  'avault-moved': 'The vault or your pack changed while you were using it. Nothing moved. Look again.',
  'avault-gold-full': 'The vault\'s purse cannot hold that much more.',
  'avault-gold-short': 'The vault\'s purse holds less than that.',
  'vault-goods': 'That piece cannot go in the vault. It is bound to its character, worn, a quest item, summoned, or the Materials Bag.',
  'realm-only': 'The vault is for characters kept on the realm. Sign in online.',
  'gold': 'You do not carry that much gold.',
  'bad-gold': 'Name an amount from 1 to 1,000,000.',
  'bad-vault-count': 'That is more than the stack holds.',
}[code ?? ''] ?? 'The vault could not do that now.');
