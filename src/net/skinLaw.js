// @ts-check
// BUNNYFALL (2026-11-07): CUSTOM PAPERDOLLS - the one law both ends read (server-account/src/skins.js keeps it,
// systems/online/customSkins.js is the client's, ui/skinsWindow.js the page). A player uploads a front and a back picture
// to their account with a name and a height, staff approve it, and the player picks which of their approved skins is
// theirs online: it stands for their paperdoll in the inventory and for their body in the world, for everyone who sees them.
// The height is how big the figure is DRAWN, 0.5 to 1.2 of a player's own height; the hitbox, the reach and the eyes stay.

/** How many skins one account keeps (any status) and how many may wait for review at once. */
export const SKIN_MAX_PER_ACCOUNT = 5;
export const SKIN_MAX_PENDING = 3;
/** The height a skin may be drawn at, as a share of a player's height, in steps of SKIN_HEIGHT_STEP. */
export const SKIN_HEIGHT_MIN = 0.5;
export const SKIN_HEIGHT_MAX = 1.2;
export const SKIN_HEIGHT_STEP = 0.05;
/** One picture: its file size and the pixels it may have. The doll's own is 110 x 184. */
export const SKIN_PNG_MAX_BYTES = 150 * 1024;
export const SKIN_W_MIN = 24, SKIN_W_MAX = 256;
export const SKIN_H_MIN = 48, SKIN_H_MAX = 512;
/** The upload's whole body: two pictures in base64 and the words round them. */
export const SKIN_BODY_MAX = 2 * Math.ceil(SKIN_PNG_MAX_BYTES * 4 / 3) + 2048;
export const SKIN_NAME_MAX = 24;
export const SKIN_NOTE_MAX = 200;
export const SKIN_STATUS = Object.freeze(['pending', 'approved', 'rejected']);
/** A skin's id: it is also what a look carries on the wire. */
export const SKIN_ID_RE = /^sk-[0-9a-f]{12}$/;

export const skinIdOk = (/** @type {unknown} */ v) => typeof v === 'string' && SKIN_ID_RE.test(v);

/** A height as it is kept (rounded to a step, within the bounds), or null. */
export function skinHeight(/** @type {unknown} */ v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const s = Math.round(v / SKIN_HEIGHT_STEP) * SKIN_HEIGHT_STEP;
  const r = Math.round(s * 100) / 100;
  return r >= SKIN_HEIGHT_MIN - 1e-9 && r <= SKIN_HEIGHT_MAX + 1e-9 ? r : null;
}

/** A skin's name as it is kept: one line, within the bound - or null. */
export function skinName(/** @type {unknown} */ v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= SKIN_NAME_MAX ? s : null;
}

/** A reviewer's note as it is kept, or ''. */
export const skinNote = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SKIN_NOTE_MAX) : '');

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A PNG's size from its header: `{ w, h }` when the bytes are a PNG within the bounds, else null. Pure; no decoding. */
export function skinPngSize(/** @type {Uint8Array} */ b) {
  if (!(b instanceof Uint8Array) || b.length < 33 || b.length > SKIN_PNG_MAX_BYTES) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;   // IHDR first
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  return w >= SKIN_W_MIN && w <= SKIN_W_MAX && h >= SKIN_H_MIN && h <= SKIN_H_MAX ? { w, h } : null;
}

/** The words for each refusal (the page and the menu show them). */
export const SKIN_WORDS = Object.freeze({
  'skin-bad': 'That upload is not a usable skin. It needs a name, a height from 0.5 to 1.2 and two PNG pictures.',
  'skin-png': 'The pictures must be PNG files, between 24 x 48 and 256 x 512 pixels, under 150 KB each.',
  'skin-same-size': 'The front and the back must be the same size in pixels.',
  'skin-full': 'You have as many skins as an account may keep. Delete one first.',
  'skin-pending-full': 'Three skins are already waiting for review. Wait for a decision first.',
  'skin-need-account': 'Skins belong to a registered account. Register first.',
  'skin-gone': 'That skin is not there.',
  'skin-not-approved': 'Only an approved skin can be worn.',
});
