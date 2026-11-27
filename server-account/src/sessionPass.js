// @ts-check

/* global atob */
import { _b64url } from '../../src/net/identityToken.js';
import { DB_FIRST_PRIMARY } from './service.js';

export const PASS_TTL_S = 300;
// A sign-out, ban, or mute reaches hot-route reads only when the pass renews, up to PASS_TTL_S - PASS_RENEW_S
// seconds later.
export const PASS_RENEW_S = 60;
export const PASS_MAX_CHARS = 1024;
// The key outlives a deploy, so any change to what a pass claims must change PASS_INFO; older passes then fail.
const PASS_INFO = 'dfo-session-pass-v1';

// A hot route may read nothing of the account beyond the fields a pass carries.
export const PASS_PATHS = Object.freeze(['/v1/heartbeat', '/v1/homes/town', '/v1/prof/pixels', '/v1/chapters/list', '/v1/seats/list', '/v1/festival/town']);
const PASS_PATH_SET = new Set(PASS_PATHS);
// Must match the realm checkpoint path that service.js routes.
const CHECKPOINT_RE = /^\/v1\/realm\/r[0-9a-f]{20}\/data$/;

export const passRoute = (/** @type {string} */ path, /** @type {string} */ method) => PASS_PATH_SET.has(path) || (method === 'PUT' && CHECKPOINT_RE.test(path));
// A replica's lookup may predate a sign-out, so only a lookup the primary answered mints a pass.
export const passMintable = (/** @type {any} */ db, /** @type {any} */ binding) => db === binding || db?.[DB_FIRST_PRIMARY] === true;

/** @type {Promise<CryptoKey|null>|null} */
let _passKey = null;
export function passKey(/** @type {any} */ env, /** @type {SubtleCrypto} */ subtle) {
  if (_passKey) return _passKey;
  const b64 = String(env?.IDENTITY_PRIVATE_KEY ?? '');
  if (!b64) return Promise.resolve(null);
  _passKey = (async () => {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const base = await subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
      return await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(PASS_INFO) },
        base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
    } catch { return null; }
  })();
  return _passKey;
}
export function _resetPassKeyForTests() { _passKey = null; }

const macInput = (/** @type {string} */ body, /** @type {string} */ secret) => new TextEncoder().encode(`p1.${body}.${secret}`);
const intOrNull = (/** @type {any} */ v) => (Number.isSafeInteger(v) ? v : null);

/**
 * @param {CryptoKey} key
 * @param {{ player: any, session: any }} who
 * @param {string} secret
 * @param {number} nowS
 * @param {SubtleCrypto} subtle
 */
export async function mintPass(key, who, secret, nowS, subtle) {
  const p = who.player;
  const claims = { p: p.id, s: who.session?.id ?? null, h: typeof p.handle === 'string' ? p.handle : null, r: intOrNull(p.registered_at),
    m: intOrNull(p.muted_until), x: nowS + PASS_TTL_S };
  const body = _b64url.encode(new TextEncoder().encode(JSON.stringify(claims)));
  const mac = new Uint8Array(await subtle.sign('HMAC', key, macInput(body, secret)));
  const pass = `p1.${body}.${_b64url.encode(mac)}`;
  return pass.length > PASS_MAX_CHARS ? null : pass;
}

/**
 * @param {CryptoKey} key
 * @param {any} pass
 * @param {any} secret
 * @param {number} nowS
 * @param {SubtleCrypto} subtle
 */
export async function readPass(key, pass, secret, nowS, subtle) {
  if (typeof pass !== 'string' || pass.length > PASS_MAX_CHARS || typeof secret !== 'string' || !secret) return null;
  const parts = pass.split('.');
  if (parts.length !== 3 || parts[0] !== 'p1') return null;
  const mac = _b64url.decode(parts[2]), body = _b64url.decode(parts[1]);
  if (!mac || !body) return null;
  try {
    if (!(await subtle.verify('HMAC', key, mac, macInput(parts[1], secret)))) return null;
    const c = JSON.parse(new TextDecoder().decode(body));
    if (!c || typeof c.p !== 'string' || !Number.isSafeInteger(c.x) || c.x - nowS <= PASS_RENEW_S) return null;
    return {
      player: { id: c.p, handle: c.h ?? null, registered_at: c.r ?? null, muted_until: c.m ?? null },
      session: { id: c.s ?? null },
      pass: true,
    };
  } catch { return null; }
}
