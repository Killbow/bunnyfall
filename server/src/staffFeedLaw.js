// @ts-check
// Each feed signs its own version word plus the body, so one feed's batch is never read as the other's.
// The service skips a batch id it has already read, so the relay resends a failed batch under its own id.
import { _b64url, SIG_BYTES, ID_RE } from '../../src/net/identityToken.js';
import { GRANT_KINDS } from '../../src/net/grantLaw.js';

export const NET_FEED_V = 'staff-net1';
export const REACT_FEED_V = 'staff-react1';
export const STAFF_FEED_SIG_HEADER = 'x-relay-staff-sig';
export const STAFF_FEED_ROWS = 64;
export const STAFF_FEED_MAX_BYTES = 32 * 1024;
export const STAFF_FEED_AGE_MAX_MS = 30 * 60_000;
export const STAFF_FEED_POST_MS = 8_000;
export const NET_KINDS = Object.freeze(['move', 'act', 'hit', 'trade', 'foe', 'chat', 'other']);
export const NET_FEED_MS = 10 * 60_000;
export const NET_HOT = Object.freeze({ frames10: 400, bytes10: 1_500_000 });
export const FOE_HOT = Object.freeze({ own: 32, host: 96 });
export const REACT_KINDS = Object.freeze(['enc', 'encr']);
export const REACT_EPISODE_MS = 60_000;
export const REACT_FIRST_MS = 3_000;
export const FEED_COUNT_MAX = 1_000_000_000;
const ID_HEX_RE = /^[0-9a-f]{16}$/;
const ROOM_RE = /^[A-Za-z0-9_.,:+-]{1,80}$/;
const TIMES = Object.freeze(['p1', 'wd', 'ac', 'hk', 'hu', 'dd']);

const count = (/** @type {any} */ n) => Number.isSafeInteger(n) && n >= 0 && n <= FEED_COUNT_MAX;
const head = (/** @type {any} */ b, /** @type {string} */ v) => !!b && typeof b === 'object' && !Array.isArray(b) && b.v === v && typeof b.id === 'string' && ID_HEX_RE.test(b.id)
  && Number.isSafeInteger(b.at) && b.at > 0 && typeof b.q === 'string' && ROOM_RE.test(b.q);

/** @param {any} r */
export const netRowOk = (r) => !!r && typeof r === 'object' && typeof r.a === 'string' && ID_RE.test(r.a)
  && [r.n, r.b, r.p10, r.pb10, r.p60, r.pb60, r.nr, r.j, r.c].every(count) && r.p10 <= r.p60 && r.p60 <= r.n && r.pb10 <= r.pb60 && r.pb60 <= r.b
  && Array.isArray(r.k) && r.k.length === NET_KINDS.length && r.k.every(count) && r.k.reduce((s, x) => s + x, 0) === r.n
  && (r.w === undefined || (typeof r.w === 'string' && r.w.length <= 40));
/** @param {any} r */
export const foeRowOk = (r) => !!r && typeof r === 'object' && typeof r.a === 'string' && ID_RE.test(r.a)
  && [r.o, r.h, r.r, r.e, r.bo, r.s, r.x].every(count) && r.r + r.e + r.bo + r.s === r.o;

/** @param {any} b */
export function netBatchValid(b) {
  if (!head(b, NET_FEED_V) || !Number.isSafeInteger(b.from) || b.from <= 0 || b.from > b.at || (b.ms !== 0 && b.ms !== 1)) return false;
  if (!Array.isArray(b.net) || !Array.isArray(b.foe) || !(b.net.length + b.foe.length) || b.net.length + b.foe.length > STAFF_FEED_ROWS) return false;
  return b.net.every(netRowOk) && b.foe.every(foeRowOk);
}

/** @param {any} r @param {number} at */
export const reactRowOk = (r, at) => !!r && typeof r === 'object' && typeof r.a === 'string' && ID_RE.test(r.a) && REACT_KINDS.includes(r.k)
  && Number.isSafeInteger(r.n) && r.n >= 1 && r.n <= GRANT_KINDS[/** @type {'enc'|'encr'} */ (r.k)].max
  && Number.isSafeInteger(r.t) && r.t > 0 && r.t <= at && Number.isSafeInteger(r.ms) && r.ms >= 0 && r.ms <= REACT_EPISODE_MS
  && TIMES.every((k) => r[k] === undefined || (Number.isSafeInteger(r[k]) && r[k] >= 0 && r[k] <= r.ms))
  && (r.w0 === 0 || r.w0 === 1) && count(r.ps) && count(r.mv) && count(r.tn);

/** @param {any} b */
export function reactBatchValid(b) {
  return head(b, REACT_FEED_V) && Array.isArray(b.rows) && b.rows.length >= 1 && b.rows.length <= STAFF_FEED_ROWS && b.rows.every((r) => reactRowOk(r, b.at));
}

const enc = new TextEncoder();
/** @param {string} v @param {Uint8Array} body */
const signedBytes = (v, body) => {
  const word = enc.encode(`${v}\n`);
  const out = new Uint8Array(word.length + body.length);
  out.set(word, 0);
  out.set(body, word.length);
  return out;
};

/** @param {any} batch @param {CryptoKey|null} privateKey @param {{ subtle: SubtleCrypto }} env */
export async function sealStaffFeed(batch, privateKey, { subtle }) {
  const valid = batch?.v === NET_FEED_V ? netBatchValid : reactBatchValid;
  if (!privateKey || !valid(batch)) return null;
  const body = enc.encode(JSON.stringify(batch));
  if (body.length > STAFF_FEED_MAX_BYTES) return null;
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, signedBytes(batch.v, body)));
  return { body, sig: _b64url.encode(sig) };
}

/** @param {string} v @param {Uint8Array} body @param {unknown} sig64 @param {CryptoKey|null} publicKey @param {{ subtle: SubtleCrypto, nowMs: number }} env */
export async function openStaffFeed(v, body, sig64, publicKey, { subtle, nowMs }) {
  if (!publicKey) return { error: 'feed-closed' };
  if (!(body instanceof Uint8Array) || !body.length || body.length > STAFF_FEED_MAX_BYTES) return { error: 'feed-shape' };
  const sig = typeof sig64 === 'string' ? _b64url.decode(sig64) : null;
  if (!sig || sig.length !== SIG_BYTES) return { error: 'feed-signature' };
  let good = false;
  try { good = await subtle.verify({ name: 'Ed25519' }, publicKey, sig, signedBytes(v, body)); } catch { good = false; }
  if (!good) return { error: 'feed-signature' };
  let batch;
  try { batch = JSON.parse(new TextDecoder().decode(body)); } catch { return { error: 'feed-shape' }; }
  if (!(v === NET_FEED_V ? netBatchValid : reactBatchValid)(batch)) return { error: 'feed-shape' };
  if (Math.abs(nowMs - batch.at) > STAFF_FEED_AGE_MAX_MS) return { error: 'feed-stale' };
  return { ok: true, batch };
}
