// @ts-check
// The prepared held-map picture, reused on each later opening and dropped after SHEET_IDLE_MS with no map open.

export const SHEET_IDLE_MS = 3 * 60 * 1000;

/** @typedef {{ sheet: ImageData, zones: { img: ImageData, x0: number, y0: number }[], thumbBoxes: any[] }} PreparedSheet */
/** @type {PreparedSheet|null} */
let kept = null;
let openMaps = 0;
/** @type {ReturnType<typeof setTimeout>|null} */
let idle = null;

/** @returns {PreparedSheet|null} */
export function openHeldSheet() {
  openMaps++;
  if (idle !== null) { clearTimeout(idle); idle = null; }
  return kept;
}

/** @param {PreparedSheet} prepared */
export function keepHeldSheet(prepared) { kept = prepared; }

export function closeHeldSheet() {
  openMaps = Math.max(0, openMaps - 1);
  if (openMaps > 0 || kept === null || idle !== null) return;
  idle = setTimeout(() => { idle = null; if (openMaps === 0) kept = null; }, SHEET_IDLE_MS);
  /** @type {any} */ (idle).unref?.();
}

/** @param {PreparedSheet} prepared @param {HTMLCanvasElement} sheet @param {HTMLCanvasElement} hands */
export function showHeldSheet(prepared, sheet, hands) {
  const { width, height } = prepared.sheet;
  sheet.width = width; sheet.height = height;
  sheet.getContext('2d', { willReadFrequently: true })?.putImageData(prepared.sheet, 0, 0);
  hands.width = width; hands.height = height;
  const hctx = hands.getContext('2d');
  for (const z of prepared.zones) hctx?.putImageData(z.img, z.x0, z.y0);
}
