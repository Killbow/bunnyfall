// @ts-check
// GUESTBOOK (2026-10-30, the owner: "the guestbook ... at the front door"): A HOME'S GUESTBOOK, the one law both ends
// read (server-account/src/guestbook.js keeps it; systems/online/guestbook.js is the door's). A visitor signs at the
// front door of another player's home - their character's name and a short line - and the home's insiders (its owner's
// account, a hall's guild) read it there. A registered account signs a home once every GUESTBOOK_SIGN_GAP_S; a book
// keeps its newest GUESTBOOK_KEEP lines.

export const GUESTBOOK_TEXT_MAX = 160;
export const GUESTBOOK_NAME_MAX = 40;
export const GUESTBOOK_KEEP = 50;
export const GUESTBOOK_SIGN_GAP_S = 6 * 3600;
/** How many lines a read hands back. */
export const GUESTBOOK_READ_MAX = 20;

/** A line as it is kept: trimmed, one line, within the bound - or null for none. */
export function guestbookText(/** @type {unknown} */ v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= GUESTBOOK_TEXT_MAX ? s : null;
}
/** A signer's name as it is kept, or null. */
export function guestbookName(/** @type {unknown} */ v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= GUESTBOOK_NAME_MAX ? s : null;
}
