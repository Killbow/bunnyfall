// @ts-check

/* global atob, btoa */

// Cloudflare Workers refuses PBKDF2 above 100,000 iterations in production, and local node and
// workerd do not enforce that limit.
export const PBKDF2_CAP = 100_000;
export const PBKDF2_ITERS = PBKDF2_CAP;
export const SALT_BYTES = 16;
export const DERIVED_BITS = 256;
// Stored as alg$iterations$salt$hash, so a row verifies under its own count and is rehashed at the
// current count on the next correct login.
export const ALG = 'pbkdf2-sha256';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

const enc = new TextEncoder();
const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
};

// Leading and trailing spaces stay: a space is part of the password the player chose.
export const normalise = (pw) => (typeof pw === 'string' ? pw.normalize('NFKC') : '');

export function passwordRefusal(pw) {
  if (typeof pw !== 'string') return 'shape';
  const n = normalise(pw);
  const len = [...n].length;
  if (len < PASSWORD_MIN) return 'short';
  if (len > PASSWORD_MAX) return 'long';
  return null;
}

// Written out because node has no crypto.subtle.timingSafeEqual. Anything that is not two byte
// arrays compares unequal.
export function timingSafeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  const x = a; const y = b;
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
}

async function derive(pw, salt, iters, subtle) {
  const key = await subtle.importKey('raw', enc.encode(normalise(pw)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, DERIVED_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(pw, { subtle, rand }, iters = PBKDF2_ITERS) {
  // Refuses empty input, so a code that fails to canonicalize is never stored as the empty string's hash.
  if (!normalise(pw)) throw new Error('refusing to hash an empty credential - a caller handed this null or ""');
  const salt = new Uint8Array(SALT_BYTES);
  rand(salt);
  const out = await derive(pw, salt, iters, subtle);
  return `${ALG}$${iters}$${b64(salt)}$${b64(out)}`;
}

export function parseStored(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 4) return null;
  const [alg, itersS, saltS, hashS] = parts;
  if (alg !== ALG) return null;
  const iters = Number(itersS);
  if (!Number.isSafeInteger(iters) || iters < 1000 || iters > 10_000_000) return null;
  const salt = unb64(saltS); const hash = unb64(hashS);
  if (!salt || !hash || salt.length !== SALT_BYTES || hash.length !== DERIVED_BITS / 8) return null;
  return { alg, iters, salt, hash };
}

export async function verifyPassword(pw, stored, { subtle }, throwawayIters = PBKDF2_ITERS) {
  const parsed = parseStored(stored);
  // An unparsable row still costs one derivation, so a missing password and a wrong one take the same time.
  const salt = parsed?.salt ?? new Uint8Array(SALT_BYTES);
  const iters = parsed?.iters ?? throwawayIters;
  const got = await derive(pw, salt, iters, subtle);
  if (!parsed) return false;
  return timingSafeEqual(got, parsed.hash);
}

export function needsRehash(stored, iters = PBKDF2_ITERS) {
  const parsed = parseStored(stored);
  return !parsed || parsed.iters < iters;
}

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_GROUPS = 4;
export const CODE_GROUP_LEN = 5;

export function mintRecoveryCode(rand) {
  const n = CODE_GROUPS * CODE_GROUP_LEN;
  const bytes = new Uint8Array(n * 2);
  rand(bytes);
  const chars = [];
  const bits = Math.log2(CODE_ALPHABET.length);
  if (!Number.isInteger(bits)) throw new Error('the code alphabet must be a power of two, or the draw is biased');
  const mask = CODE_ALPHABET.length - 1;
  for (let i = 0; i < n; i++) chars.push(CODE_ALPHABET[bytes[i] & mask]);
  const out = [];
  for (let g = 0; g < CODE_GROUPS; g++) out.push(chars.slice(g * CODE_GROUP_LEN, (g + 1) * CODE_GROUP_LEN).join(''));
  return out.join('-');
}

export function canonicalCode(input) {
  if (typeof input !== 'string') return null;
  // Only the look-alikes O, I, and L fold; Q is in the alphabet, so folding it would change a minted code.
  const s = input.toUpperCase().replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== CODE_GROUPS * CODE_GROUP_LEN) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}

export const codeForHashing = (code) => canonicalCode(code);

export const RECOVERY_SET_SIZE = 8;
// A minted code is 100 random bits, so the NIST look-up secret floor of 10,000 iterations is enough.
export const RECOVERY_CODE_ITERS = 10_000;
// recovery_hash holds one stored hash, or codes,<hash>,<hash>,... for a set; a stored hash never
// contains a comma.
const SET_TAG = 'codes';

export function mintRecoverySet(rand, n = RECOVERY_SET_SIZE) {
  return Array.from({ length: n }, () => mintRecoveryCode(rand));
}

export const joinRecoverySet = (hashes) => [SET_TAG, ...hashes].join(',');

export async function hashRecoverySet(codes, { subtle, rand }) {
  return joinRecoverySet(await Promise.all(codes.map((c) => hashPassword(codeForHashing(c), { subtle, rand }, RECOVERY_CODE_ITERS))));
}

export function parseRecoverySet(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(`${SET_TAG},`)) return null;
  const hashes = stored.split(',').slice(1);
  return hashes.every((h) => parseStored(h)) ? hashes : null;
}

export function recoveryLeft(stored) {
  const set = parseRecoverySet(stored);
  if (set) return set.length;
  return parseStored(stored) ? 1 : null;
}

export async function matchRecoveryCode(canon, stored, { subtle }) {
  const set = parseRecoverySet(stored);
  const guess = canon ?? '';
  // Every row costs the same derivations, so timing does not show whether the account or a set exists.
  const slots = Array.from({ length: Math.max(RECOVERY_SET_SIZE, set?.length ?? 0) }, (_, i) => set?.[i] ?? null);
  const [one, ...each] = await Promise.all([
    verifyPassword(guess, set ? null : stored, { subtle }),
    ...slots.map((h) => verifyPassword(guess, h, { subtle }, RECOVERY_CODE_ITERS)),
  ]);
  if (!canon) return { ok: false, rest: null };
  if (!set) return { ok: one, rest: null };
  const i = each.findIndex(Boolean);
  return i < 0 ? { ok: false, rest: null } : { ok: true, rest: set.filter((_, j) => j !== i) };
}
