// @ts-check
// Name, line, and line count limits match those of a POI person in `POI_LIMITS` (poi/poiLaw.js).

const NAME_MAX = 48, LINE_MAX = 240, LINES_MAX = 8;
const text = (/** @type {any} */ v, /** @type {number} */ max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** @param {any} raw */
export function editorPersonOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.Name, NAME_MAX);
  const lines = (Array.isArray(raw.Lines) ? raw.Lines : []).map((/** @type {any} */ l) => text(l, LINE_MAX)).filter(Boolean).slice(0, LINES_MAX);
  return name || lines.length ? { name, lines } : null;
}

/** @param {any} pn */
export function nextPersonLine(pn) {
  const lines = pn?.editorPerson?.lines;
  if (!lines?.length) return null;
  pn.personSaid = pn.personSaid ?? 0;
  return lines[pn.personSaid++ % lines.length];
}
