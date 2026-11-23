// @ts-check
// BUNNYFALL: WHAT A DUNGEON'S FLATS SAY. The Dungeon Editor can give any scenery flat words (a note on a table, a sign on a
// wall): `FlatResource.BunnyfallPerson` as a person's are (world/editorPeople.js), on a flat that is no person. It stays
// scenery, with no body, no faction and no made-up name: a box the eye can pick, and a press shows its next line, round and
// round. Its name, if it has one, is what the plaque says. A flat with an action of its own is that action's, so has none.

/**
 * The readable flats of a dungeon's blocks, in the parent frame.
 * @param {any[]} blocks each `{ layout: { flats }, originX, originZ }`
 * @param {(archive: number) => Promise<any>} getTexture
 * @param {(texture: any, record: number) => { w: number, h: number }} sizeOf
 */
export async function standReadables(blocks, getTexture, sizeOf) {
  const out = [];
  for (const b of blocks) {
    for (const f of b.layout.flats) {
      if (f.npc || f.action || !f.editorPerson?.lines.length) continue;
      const t = await getTexture(f.archive);
      if (!t || f.record >= t.recordCount) continue;
      const { w, h } = sizeOf(t, f.record);
      const x = f.x + b.originX, z = f.z + b.originZ;
      const half = Math.max(w, 0.4) / 2;   // a flat is turned to the eye, so its box is square; a thin one can still be hit
      out.push({
        name: f.editorPerson.name, lines: f.editorPerson.lines, said: 0,
        aabb: { min: [x - half, f.y - h / 2, z - half], max: [x + half, f.y + h / 2, z + half] },   // an RDB flat's y is its centre
      });
    }
  }
  return out;
}

const KEY = 'readable:';
const ofKey = (/** @type {any[]} */ list, /** @type {any} */ key) => (typeof key === 'string' && key.startsWith(KEY) ? list[Number(key.slice(KEY.length))] ?? null : null);

/** What the eye can pick. @param {any[]} list @param {number} distance the ray's @param {number} reach */
export const readableTargets = (list, distance, reach) => list.map((r, i) => ({ key: `${KEY}${i}`, aabb: r.aabb, distance, reach }));

/** The plaque: the flat's name, or nothing for one with none. @param {any[]} list @param {any} key */
export function readableName(list, key) {
  const r = ofKey(list, key);
  return r?.name ? { title: r.name } : null;
}

/** A press: its next line, said. False for a key that is not a readable's. @param {any[]} list @param {any} key @param {(line: string) => void} [say] */
export function readReadable(list, key, say) {
  const r = ofKey(list, key);
  if (!r) return false;
  say?.(r.lines[r.said++ % r.lines.length]);
  return true;
}
