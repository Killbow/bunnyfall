// @ts-check
// BUNNYFALL: THE DUNGEON EDITOR'S PEOPLE. The Bunnyfall Dungeon Editor writes a person's name and lines on their flat in the
// block's world data, `FlatResource.BunnyfallPerson: { Name, Lines }`. A press of Talk says the next line, round and round,
// as a POI's person does (scenes/poiNpcs.js). The limits are a POI person's (poi/poiLaw.js POI_LIMITS): a mod's file is read
// with the same care as a POI's document. DFU has no such field and ignores it.

const NAME_MAX = 48, LINE_MAX = 240, LINES_MAX = 8;
const text = (/** @type {any} */ v, /** @type {number} */ max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The `{ name, lines }` a flat's field holds, checked; null when it says nothing. @param {any} raw */
export function editorPersonOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.Name, NAME_MAX);
  const lines = (Array.isArray(raw.Lines) ? raw.Lines : []).map((/** @type {any} */ l) => text(l, LINE_MAX)).filter(Boolean).slice(0, LINES_MAX);
  return name || lines.length ? { name, lines } : null;
}

/** The line this press of Talk says, and the next one made ready; null for a person with no lines. @param {any} pn */
export function nextPersonLine(pn) {
  const lines = pn?.editorPerson?.lines;
  if (!lines?.length) return null;
  pn.personSaid = pn.personSaid ?? 0;
  return lines[pn.personSaid++ % lines.length];
}
