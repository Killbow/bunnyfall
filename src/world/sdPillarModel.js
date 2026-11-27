// @ts-check
// Builds the arena pillar meshes inside the collider square from sdRealm pillarQuads.
// No collider and no light of its own.
import { SD_ARENA, SD_PILLAR_R, SD_PILLAR_W, SD_PILLAR_H, realmToDungeon } from '../net/sdBrain.js';

export const SD_PILLAR_LOOK = Object.freeze({
  plinth: Object.freeze({ y1: 0.45, w: SD_PILLAR_W / 2 }),
  plinthBand: Object.freeze({ y1: 0.58, w: SD_PILLAR_W / 2 - 0.02 }),
  shaft: Object.freeze({ y1: 10.0, w: 0.68, chamfer: 0.14 }),
  bands: Object.freeze([3.4, 6.5, 9.4]), band: Object.freeze({ h: 0.2, w: 0.73 }),
  conduit: Object.freeze({ at: 0.64, r: 0.045, sides: 6 }),
  collar: Object.freeze({ y1: 10.2, w: 0.74 }),
  step: Object.freeze({ y1: 10.4, w: 0.78 }),
  clock: Object.freeze({ y1: 12.2, w: 0.78 }),
  cornice: Object.freeze({ y1: 12.35, w: SD_PILLAR_W / 2 }),
  lantern: Object.freeze({ y1: 13.5, stem: 0.12 }),
  roof: Object.freeze({ y1: 13.75, w: SD_PILLAR_W / 2 - 0.02 }),
  cap: Object.freeze({ y1: SD_PILLAR_H, w: SD_PILLAR_W / 2 }),
});
export const SD_PILLAR_DIAL = Object.freeze({ y: 11.3, r: 0.66, lift: 0.01 });
export const SD_LANTERN = Object.freeze({ w: 0.3, y0: 12.43, y1: 13.3, bar: 0.025, plate: 0.08, flameY: 12.86 });

export function pillarCentre(k) {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  return [SD_ARENA.x + Math.cos(a) * SD_PILLAR_R, SD_ARENA.z + Math.sin(a) * SD_PILLAR_R];
}
const square = (w) => [[-w, -w], [w, -w], [w, w], [-w, w]];
const chamfered = (w, c) => [[-w + c, -w], [w - c, -w], [w, -w + c], [w, w - c], [w - c, w], [-w + c, w], [-w, w - c], [-w, -w + c]];
const diamond = (w) => [[0, -w], [w, 0], [0, w], [-w, 0]];

function prism(f, rec, px, pz, P, y0, y1, { tile = 2, top = true, under = true } = {}) {
  const C = (o, y) => realmToDungeon(px + o[0], y, pz + o[1]);
  let u = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    f.quad(rec, C(a, y0), C(a, y1), C(b, y1), C(b, y0), [u / tile, -y0 / tile], [u / tile, -y1 / tile], [(u + len) / tile, -y1 / tile], [(u + len) / tile, -y0 / tile]);
    u += len;
  }
  const c = [0, 0], cu = (o) => [0.5 + o[0] / tile, 0.5 + o[1] / tile];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (top) f.tri(rec, C(c, y1), C(b, y1), C(a, y1), cu(c), cu(b), cu(a));
    if (under) f.tri(rec, C(c, y0), C(a, y0), C(b, y0), cu(c), cu(a), cu(b));
  }
}
function pipe(f, rec, px, pz, ox, oz, r, sides, y0, y1) {
  const P = [];
  for (let i = 0; i < sides; i++) { const a = (-i / sides) * Math.PI * 2; P.push([ox + Math.cos(a) * r, oz + Math.sin(a) * r]); }
  const [a, b] = [P[0], P[1]], mx = (a[0] + b[0]) / 2 - ox, mz = (a[1] + b[1]) / 2 - oz;
  if ((b[1] - a[1]) * mx + (a[0] - b[0]) * mz < 0) P.reverse();
  prism(f, rec, px, pz, P, y0, y1, { tile: 1, top: false, under: false });
}

/**
 * @param {ReturnType<typeof import('./gateModel.js').faces>} f
 * @param {number} k
 * @param {{ stone: number, brass: number }} rec
 */
export function pillarVisual(f, k, rec) {
  const L = SD_PILLAR_LOOK, [px, pz] = pillarCentre(k);
  prism(f, rec.stone, px, pz, square(L.plinth.w), 0, L.plinth.y1, { under: false });
  prism(f, rec.brass, px, pz, square(L.plinthBand.w), L.plinth.y1, L.plinthBand.y1, { under: false });
  prism(f, rec.stone, px, pz, chamfered(L.shaft.w, L.shaft.chamfer), L.plinthBand.y1, L.shaft.y1, { top: false, under: false });
  for (const y of L.bands) prism(f, rec.brass, px, pz, square(L.band.w), y, y + L.band.h);
  const C = L.conduit;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) pipe(f, rec.brass, px, pz, sx * C.at, sz * C.at, C.r, C.sides, L.plinthBand.y1, L.shaft.y1);
  prism(f, rec.brass, px, pz, square(L.collar.w), L.shaft.y1, L.collar.y1);
  prism(f, rec.stone, px, pz, square(L.step.w), L.collar.y1, L.step.y1);
  prism(f, rec.stone, px, pz, square(L.clock.w), L.step.y1, L.clock.y1, { under: false });
  prism(f, rec.brass, px, pz, square(L.cornice.w), L.clock.y1, L.cornice.y1);
  const T = L.lantern;
  lanternCage(f, rec.brass, px, pz);
  prism(f, rec.brass, px, pz, square(T.stem), SD_LANTERN.y1 + SD_LANTERN.plate, T.y1, { top: false, under: false });
  prism(f, rec.brass, px, pz, square(L.roof.w), T.y1, L.roof.y1);
  prism(f, rec.brass, px, pz, square(L.cap.w), L.roof.y1, L.cap.y1);
}
function lanternCage(f, rec, px, pz) {
  const N = SD_LANTERN, foot = SD_PILLAR_LOOK.cornice.y1;
  prism(f, rec, px, pz, diamond(N.w + 0.06), foot, N.y0, { under: false });
  for (const [sx, sz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) prism(f, rec, px, pz, square(N.bar).map(([x, z]) => [sx * N.w + x, sz * N.w + z]), N.y0, N.y1, { top: false, under: false });
  prism(f, rec, px, pz, diamond(N.w + 0.06), N.y1, N.y1 + N.plate);
}

export const SD_PILLAR_FACES = Object.freeze([Object.freeze([1, 0]), Object.freeze([0, 1]), Object.freeze([-1, 0]), Object.freeze([0, -1])]);
/** @returns {ReadonlyArray<{ k: number, j: number, at: number[], n: number[], right: number[] }>} */
export const sdPillarDials = (() => {
  let made = null;
  return () => {
    if (made) return made;
    const D = SD_PILLAR_DIAL, out = [];
    for (let k = 0; k < 4; k++) {
      const [px, pz] = pillarCentre(k);
      for (let j = 0; j < 4; j++) {
        const [nx, nz] = SD_PILLAR_FACES[j], d = SD_PILLAR_LOOK.clock.w + D.lift;
        out.push(Object.freeze({ k, j, at: Object.freeze(realmToDungeon(px + nx * d, D.y, pz + nz * d)), n: Object.freeze([nx, 0, nz]), right: Object.freeze([nz, 0, -nx]) }));
      }
    }
    return (made = Object.freeze(out));
  };
})();
export const sdLanterns = (() => {
  let made = null;
  return () => (made ??= Object.freeze([0, 1, 2, 3].map((k) => { const [px, pz] = pillarCentre(k); return Object.freeze(realmToDungeon(px, SD_LANTERN.flameY, pz)); })));
})();
