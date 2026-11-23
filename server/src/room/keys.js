// Keys and door paths the relay's rooms use. They cover status and arena doors, bout ids, look
// and stake keys, owed result keys and their caps, world chunk keys, and account and party records.
import { CARD_RECEIPT_TTL_S } from '../../../src/net/cardReceipt.js';

export const STATUS_INTERNAL = '/internal/status';
export const STATUS_NAMES_MAX = 60;
export const ARENA_INTERNAL_OPEN = '/internal/arena/open';
export const ARENA_INTERNAL_LIVE = '/internal/arena/live';
export const ARENA_SAY_BAND_MS = 5000;
export const ARENA_SAVE_MS = 1000;
export const ARENA_LIVE_TELL_MS = 2000;
export const arenaId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
export const lookKey = (id) => `look:${id}`;
export const keyMove = (m, ws, from, to) => {
  if (!m || from === to) return;
  if (from != null) { const s = m.get(from); if (s) { s.delete(ws); if (!s.size) m.delete(from); } }
  if (to != null) { let s = m.get(to); if (!s) m.set(to, s = new Set()); s.add(ws); }
};
export const stakeKeyOf = (j) => `cstake:${j}`;
export const cashoutKeyOf = (sub) => `cashout:${sub}`;
export const iliacOwedKeyOf = (sub) => `iowed:${sub}`;
export const ILIAC_OWED_MAX = 32;
export const gambitOwedKeyOf = (sub) => `gowed:${sub}`;
export const HOLDEM_STAKE_VOID_S = CARD_RECEIPT_TTL_S;
export const HOLDEM_STAKE_KEEP_S = HOLDEM_STAKE_VOID_S + 24 * 3600;
export const HOLDEM_INTERNAL_VOID = '/internal/holdem/void';
export const HOLDEM_OWED_MAX = 64;
export const WORLD_META = 'world:meta';
export const worldChunkKey = (i) => `world:${i}`;
export const acctKey = (id) => `acct:${id}`;
export const acctSecretKey = (id) => `asecret:${id}`;
export const partyKey = (id) => `party:${id}`;
export const newAcct = (name, now) => ({ name, seen: now, friends: [], in: [], out: [], invites: [], party: null });
export const without = (list, acct) => (Array.isArray(list) ? list : []).filter((e) => (typeof e === 'string' ? e : e?.acct) !== acct);
export const hasEntry = (list, acct) => (Array.isArray(list) ? list : []).some((e) => (typeof e === 'string' ? e : e?.acct) === acct);
