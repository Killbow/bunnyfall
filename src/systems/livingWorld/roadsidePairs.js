// @ts-check
import { pairPicture } from '../../world/naturePicture.js';

/**
 * @param {any[]} pairs
 * @param {(x: number, z: number) => boolean} keep
 */
export const keptPairs = (pairs, keep) => pairs.filter((p) => p.trees.every((t) => keep(t.x, t.z)));

/** @param {{ door: any, pairs: any[], speciesPic: (species: number) => Promise<any>, groups: Map<string, any>, handles: any[], set: any[], sway: (proto: any, record: number) => void }} deps */
export async function standRoadside({ door, pairs, speciesPic, groups, handles, set, sway }) {
  const halves = new Map();
  const half = async (kind, side) => {
    const key = `${kind}.${side}`;
    if (!halves.has(key)) halves.set(key, await pairPicture(door, kind, side));
    return halves.get(key);
  };
  let drawn = 0;
  for (const p of pairs) {
    const pics = [];
    for (const [side, t] of p.trees.entries()) pics.push((await speciesPic(t.species)) ? await half(p.kind, side) : null);
    const whole = pics.every(Boolean);
    if (whole) drawn++;
    p.trees.forEach((t, side) => {
      const gk = `J${t.species}`, c = [t.x, t.y, t.z];
      let g = groups.get(gk);
      if (!g) groups.set(gk, (g = { species: t.species, young: false, centers: [], own: [] }));
      g.centers.push(c); g.own.push(p.js);
      if (!whole) return;
      const pic = pics[side];
      if (pic.h == null) {
        door.acquire(pic.far);
        handles.push(pic.far);
        pic.h = handles.length - 1;
        pic.entry = { h: pic.h, centers: [], wild: null, own: [], fit: null, turn: [] };
        set.push(pic.entry);
        sway(pic.proto, t.record);
      }
      pic.entry.centers.push([t.x, p.y, t.z]); pic.entry.own.push(p.js); pic.entry.turn.push(p.turn);
      (g.spanned ??= new Set()).add(c);
      (g.spans ??= new Set()).add(pic.far);
    });
  }
  for (const pic of halves.values()) if (pic?.entry) { pic.entry.own = Float32Array.from(pic.entry.own); pic.entry.turn = Float32Array.from(pic.entry.turn); }
  return drawn;
}
