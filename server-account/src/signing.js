// @ts-check
// The private key is imported once per isolate, non-extractable and for signing only. IDENTITY_PUBLIC_KEY is
// configured beside it, because WebCrypto cannot derive a public key from an imported private one.
// The reset hook lives here because a module Worker entrypoint may export only handlers.

/* global atob */
import { importPublicKeyB64 } from '../../src/net/identityToken.js';

let _key = null;

export async function signingKey(env, subtle) {
  if (_key) return _key;
  const b64 = String(env.IDENTITY_PRIVATE_KEY ?? '');
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    _key = await subtle.importKey('pkcs8', bytes, { name: 'Ed25519' }, false, ['sign']);
    return _key;
  } catch { return null; }
}

/** @type {CryptoKey|null|undefined} */
let _gateKey;
export async function gatePublicKey(env, subtle) {
  if (_gateKey !== undefined) return _gateKey;
  const raw = String(env.GATE_PUBLIC_KEY ?? '');
  _gateKey = raw ? await importPublicKeyB64(raw, { subtle }) : null;
  return _gateKey;
}

export function _resetKeyForTests() { _key = null; _gateKey = undefined; }
