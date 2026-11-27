// @ts-check
// Decides whose search a dungeon `srch:<i>` room word is. Words from my account or party land here, and strangers'
// words are kept unlanded in the room memory so their partymates who arrive later still receive them.
import { searchKinOf, searchAcctOfPeer, searchSelfAcct, searchSelfName, searchToldBy, SEARCH_ACCT_MAX, SEARCH_LOOT_MAX } from './searchables.js';
import { validLootList } from './loot.js';
import { isRoomWord, validRoomWord } from './roomLoot.js';
import { peerHanded } from '../net/peerWord.js';
import { NAME_MAX, sanitizeName } from '../net/wire.js';

// Words stored from strangers travel in the room memory this client publishes, so their count and size are capped.
export const SEARCH_FOREIGN_MAX = 24;
export const SEARCH_FOREIGN_PER_OBJECT = 4;
export const SEARCH_FOREIGN_BYTES = 4096;

/** @param {{ respawnDue: (t: unknown, now: number|null) => boolean, wallNow: () => number|null }} host */
export function createSearchRoom(host) {
  const foreign = new Map();
  // Words from older builds carry no `by`, so the live speaker's account is used instead.
  const searcherOf = (rec, from) => (typeof rec?.by === 'string' && rec.by.length > 0 && rec.by.length <= SEARCH_ACCT_MAX ? rec.by : searchAcctOfPeer(from));
  const nameOf = (rec) => (typeof rec?.bn === 'string' && rec.bn.length > 0 && rec.bn.length <= NAME_MAX && sanitizeName(rec.bn) === rec.bn ? rec.bn : null);
  function whose(rec, from = null) {
    const acct = searcherOf(rec, from);
    const kin = searchKinOf(acct);
    const name = nameOf(rec);
    return kin ? { acct, kin, who: searchToldBy(acct, name), name } : null;
  }
  function prune() {
    const now = host.wallNow();
    for (const [k, e] of [...foreign]) if (host.respawnDue(e.rec.t, now)) foreign.delete(k);
    while (foreign.size > SEARCH_FOREIGN_MAX) foreign.delete(foreign.keys().next().value);
  }
  function ours(canon, rec, from = null) {
    const w = whose(rec, from);
    if (w) return w;
    const acct = searcherOf(rec, from), name = nameOf(rec);
    // Only the birth record of a find (its terms and base items) is stored, since a late partymate needs nothing else.
    // Older builds send the whole list `r`.
    const room = isRoomWord(rec) ? validRoomWord(rec) : null;
    const items = room ? (room.b ? peerHanded(room.b) : null) : peerHanded(validLootList(rec?.r));
    if (!items || items.length > SEARCH_LOOT_MAX || (room && items.length !== room.b?.length)) return null;
    const now = host.wallNow();
    // The stamp is clamped to now, so a forged future time cannot keep the word past the room's hour.
    const t = Number.isFinite(rec.t) ? (Number.isFinite(now) ? Math.min(rec.t, /** @type {number} */ (now)) : rec.t) : now;
    const kept = room
      ? { k: canon, g: room.g, lv: room.lv, ...(room.n > 1 ? { n: room.n } : {}), tm: room.tm, h: room.h, b: items, ...(Number.isFinite(t) ? { t } : {}), ...(acct ? { by: acct } : {}), ...(name ? { bn: name } : {}) }
      : { k: canon, r: items, ...(Number.isFinite(t) ? { t } : {}), ...(acct ? { by: acct } : {}), ...(name ? { bn: name } : {}) };
    if (JSON.stringify(kept).length > SEARCH_FOREIGN_BYTES) return null;
    const k = `${canon}|${acct ?? (typeof from === 'string' ? `peer:${from}` : '?')}`;
    const had = foreign.get(k)?.rec;
    // A repeat of the same birth keeps the first record with its original search stamp.
    if (room && had && /** @type {any} */ (had).h === /** @type {any} */ (kept).h && /** @type {any} */ (had).g === /** @type {any} */ (kept).g) return null;
    foreign.delete(k);
    foreign.set(k, { rec: kept, from });
    const about = [...foreign.keys()].filter((x) => x.startsWith(`${canon}|`));
    for (const x of about.slice(0, Math.max(0, about.length - SEARCH_FOREIGN_PER_OBJECT))) foreign.delete(x);
    prune();
    return null;
  }
  function adopt(i, land) {
    const head = `srch:${i}|`;
    for (const [k, e] of [...foreign]) {
      if (!k.startsWith(head) || !whose(e.rec, e.from)) continue;
      foreign.delete(k);
      land(e.rec, e.from);
    }
  }
  const mine = () => ({ by: searchSelfAcct(), bn: searchSelfName() });
  const fields = (sb) => ({ ...(typeof sb?.by === 'string' && sb.by ? { by: sb.by } : {}), ...(nameOf(sb) && sb.by ? { bn: sb.bn } : {}) });
  function records(/** @type {(canon: string) => boolean} */ judged = () => false) { prune(); return [...foreign.values()].filter((e) => !judged(e.rec.k)).map((e) => ({ ...e.rec })); }
  return { whose, ours, adopt, mine, fields, records };
}
