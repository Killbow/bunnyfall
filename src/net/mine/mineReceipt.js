// @ts-check
// The relay signs each drill haul. The account service verifies it before paying it once.
// Wire format: m1.<base64url claims>.<base64url Ed25519 signature>
// Claims identify the mine, reset, hole, ore, player, haul sequence, and validity window.
import { _b64url, SIG_BYTES, SKEW_S, ID_RE } from '../identityToken.js';
import { MINE_DRILL } from './mineDrill.js';

export const MINE_RECEIPT_V = 'm1';
/** How long a haul may be carried to the account service: a day. */
export const MINE_RECEIPT_TTL_S = 24 * 3600;
export const MINE_RECEIPT_MAX = 480;
/** The ores a haul may name (net/mine/mineLayout.js's holes). */
export const MINE_HAUL_ORES = Object.freeze(['metal:iron', 'metal:copper', 'metal:tin', 'metal:silver', 'metal:gold', 'metal:platinum', 'ore:mithril', 'ore:ebony', 'ore:orichalcum', 'ore:adamantium']);
/** The fields another signed shape carries - none is admitted on a haul's. */
const FOREIGN = Object.freeze(['a', 'j', 'h', 'f', 'r', 't', 'g', 'd', 'b', 'x', 'w', 'y', 'l']);

const enc = new TextEncoder();
const dec = new TextDecoder();
const int = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;

/** Everything a haul's claims must be, before any signature is considered. */
export function mineReceiptValid(/** @type {any} */ c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  for (const k of FOREIGN) if (c[k] !== undefined) return false;
  if (!int(c.m, 1, 999999) || !int(c.z, 0, 99999) || !int(c.s, 0, 7) || !int(c.c, 0, 5) || !int(c.k, 0, 9)) return false;
  if (typeof c.o !== 'string' || !MINE_HAUL_ORES.includes(c.o)) return false;
  if (!int(c.n, 1, MINE_DRILL.hopperMax)) return false;
  if (typeof c.u !== 'string' || !ID_RE.test(c.u)) return false;
  if (!int(c.q, 1, 1e9)) return false;
  if (!Number.isSafeInteger(c.i) || !Number.isSafeInteger(c.e) || c.e <= c.i || c.e - c.i > MINE_RECEIPT_TTL_S) return false;
  return true;
}

/** A receipt's one id: its mine, reset and haul count (one haul a count, whoever carries it). */
export const mineReceiptId = (/** @type {any} */ c) => `${c.m}:${c.z}:${c.q}`;

/**
 * MINT - the relay's half. With no key the receipt goes out unsigned (`m1.<body>.`), which no account service pays.
 * @param {{ mine: number, reset: number, s: number, c: number, k: number, ore: string, n: number, by: string, seq: number }} h
 * @param {CryptoKey|null} privateKey
 * @param {{ subtle: SubtleCrypto, nowS: number }} env
 */
export async function mintMineReceipt(h, privateKey, { subtle, nowS }) {
  const claims = { m: h.mine, z: h.reset, s: h.s, c: h.c, k: h.k, o: h.ore, n: h.n, u: h.by, q: h.seq, i: nowS, e: nowS + MINE_RECEIPT_TTL_S };
  if (!mineReceiptValid(claims)) throw new TypeError('mintMineReceipt refused a claim set it could not verify');
  const body = _b64url.encode(enc.encode(JSON.stringify(claims)));
  if (!privateKey) return `${MINE_RECEIPT_V}.${body}.`;
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, enc.encode(`${MINE_RECEIPT_V}.${body}`)));
  return `${MINE_RECEIPT_V}.${body}.${_b64url.encode(sig)}`;
}

/** READ - the page's half: a receipt's claims, never a verdict. Null for anything not a well-formed haul. */
export function readMineReceipt(/** @type {unknown} */ r) {
  if (typeof r !== 'string' || r.length > MINE_RECEIPT_MAX) return null;
  const parts = r.split('.');
  if (parts.length !== 3 || parts[0] !== MINE_RECEIPT_V) return null;
  const raw = _b64url.decode(parts[1]);
  if (!raw) return null;
  let c;
  try { c = JSON.parse(dec.decode(raw)); } catch { return null; }
  return mineReceiptValid(c) ? { ...c, signed: parts[2].length > 0 } : null;
}

/**
 * VERIFY - the account service's half: `{ ok: true, claims }` or `{ ok: false, why }`, never a throw.
 * @param {unknown} r
 * @param {CryptoKey} publicKey the relay's Ed25519 public half
 * @param {{ subtle: SubtleCrypto, nowS: number, skewS?: number }} env
 * @returns {Promise<{ ok: true, claims: any } | { ok: false, why: string }>}
 */
export async function verifyMineReceipt(r, publicKey, { subtle, nowS, skewS = SKEW_S }) {
  if (typeof r !== 'string' || r.length > MINE_RECEIPT_MAX) return { ok: false, why: 'shape' };
  const parts = r.split('.');
  if (parts.length !== 3) return { ok: false, why: 'shape' };
  const [v, body, sig64] = parts;
  if (v !== MINE_RECEIPT_V) return { ok: false, why: 'version' };
  if (!sig64) return { ok: false, why: 'unsigned' };
  const sig = _b64url.decode(sig64);
  if (!sig || sig.length !== SIG_BYTES) return { ok: false, why: 'sig-shape' };
  const raw = _b64url.decode(body);
  if (!raw) return { ok: false, why: 'body-shape' };
  let good = false;
  try { good = await subtle.verify({ name: 'Ed25519' }, publicKey, sig, enc.encode(`${v}.${body}`)); } catch { return { ok: false, why: 'verify-threw' }; }
  if (!good) return { ok: false, why: 'signature' };
  let claims;
  try { claims = JSON.parse(dec.decode(raw)); } catch { return { ok: false, why: 'json' }; }
  if (!mineReceiptValid(claims)) return { ok: false, why: 'claims' };
  if (!Number.isSafeInteger(nowS)) return { ok: false, why: 'clock' };
  if (nowS >= claims.e) return { ok: false, why: 'expired' };
  if (claims.i > nowS + skewS) return { ok: false, why: 'future' };
  return { ok: true, claims };
}
