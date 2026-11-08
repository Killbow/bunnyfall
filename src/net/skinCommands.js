// BUNNYFALL (2026-11-07): THE CHAT COMMANDS THAT HIDE A PLAYER'S CUSTOM SKIN, for me alone (systems/online/skinHide.js).
//   /hideskin <name>   /showskin <name>   /hiddenskins
// This file only reads the line; the chat safety host runs it (it already names a player from the rooms and the lines heard).
export const SKIN_COMMANDS = Object.freeze(['hideskin', 'showskin', 'hiddenskins']);
const RE = new RegExp(`^/(${SKIN_COMMANDS.join('|')})(?:\\s+([\\s\\S]*))?$`, 'i');
/** @returns {{ op: 'hide'|'show'|'list', name: string }|{ error: string }|null} */
export function parseSkinCommand(/** @type {string} */ text) {
  const m = RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const op = m[1].toLowerCase();
  if (op === 'hiddenskins') return { op: 'list', name: '' };
  const name = (m[2] ?? '').trim();
  if (!name) return { error: `Usage: /hideskin <name> stops drawing their custom skin. /showskin <name> undoes it, and /hiddenskins lists them.` };
  return { op: op === 'hideskin' ? 'hide' : 'show', name };
}
