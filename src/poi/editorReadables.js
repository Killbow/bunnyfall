// @ts-check
// Gives scenery flats in a dungeon readable text, such as a note on a table or a sign on a wall.
// The flat stays scenery with no body or faction, and pressing it shows its next line.

/**
 * @param {any[]} blocks
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
      const half = Math.max(w, 0.4) / 2;
      out.push({
        name: f.editorPerson.name, lines: f.editorPerson.lines, said: 0,
        aabb: { min: [x - half, f.y - h / 2, z - half], max: [x + half, f.y + h / 2, z + half] },
      });
    }
  }
  return out;
}

const KEY = 'readable:';
const ofKey = (/** @type {any[]} */ list, /** @type {any} */ key) => (typeof key === 'string' && key.startsWith(KEY) ? list[Number(key.slice(KEY.length))] ?? null : null);

/**
 * @param {any[]} list
 * @param {number} distance
 * @param {number} reach
 */
export const readableTargets = (list, distance, reach) => list.map((r, i) => ({ key: `${KEY}${i}`, aabb: r.aabb, distance, reach }));

/**
 * @param {any[]} list
 * @param {any} key
 */
export function readableName(list, key) {
  const r = ofKey(list, key);
  return r?.name ? { title: r.name } : null;
}

/**
 * @param {any[]} list
 * @param {any} key
 * @param {(line: string) => void} [say]
 */
export function readReadable(list, key, say) {
  const r = ofKey(list, key);
  if (!r) return false;
  say?.(r.lines[r.said++ % r.lines.length]);
  return true;
}
