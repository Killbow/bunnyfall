// @ts-check

// A cached board row stores the shape of the reads that built it, so rows cached by an older deploy are read again.
export function shapeOf(/** @type {(string | number)[]} */ ...parts) {
  let h = 0x811c9dc5;
  const text = parts.map(String).join('\u0001');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const KEPT_BOARD_MAX_BYTES = 1_500_000;
const encoder = new TextEncoder();
export function keptFits(/** @type {string} */ text, /** @type {string} */ board) {
  if (text.length <= KEPT_BOARD_MAX_BYTES / 3 || encoder.encode(text).length <= KEPT_BOARD_MAX_BYTES) return true;
  keptPast(board, `${text.length} characters`);
  return false;
}
export function keptPast(/** @type {string} */ board, /** @type {string} */ what) {
  if (toldTooLarge.has(board)) return;
  toldTooLarge.add(board);
  console.warn(`[kept] ${board}: ${what}, past ${KEPT_BOARD_MAX_BYTES} bytes - read every time, as before`);
}
const toldTooLarge = new Set();
