// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE DRILL, SEEN - a drill set on a hole (net/mine/mineDrill.js) stood as a squat timber
// rig over it: two posts and a crossbeam, and an iron shaft with its bit down into the seam, which turns while the drill
// runs. Boxes, both faces, in two pictures drawn here (no file) under the mines' pseudo-archive (world/mine/mineArt.js
// MINE_ART_ARCHIVE): the frame (records MINE_DRILL_RECORDS.timber) and the shaft (.iron), the shaft its own mesh so it
// alone turns.
import { MINE_ART_ARCHIVE } from './mineArt.js';

export const MINE_DRILL_RECORDS = Object.freeze({ timber: 300, iron: 301, flame: 302 });
/** The rig's size (m): how wide the posts stand, how tall the frame, the shaft's thickness and how far it reaches. */
export const MINE_DRILL_SIZE = Object.freeze({ span: 1.3, tall: 1.9, post: 0.16, shaft: 0.18, reach: 1.7 });
const SIDE = 16;

/** The two pictures: rough timber and dark worked iron, RGBA. */
export function mineDrillPictures() {
  const make = (/** @type {(x: number, y: number) => number[]} */ f) => {
    const colors = new Uint8Array(SIDE * SIDE * 4);
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) { const c = f(x, y), i = (y * SIDE + x) * 4; colors[i] = c[0]; colors[i + 1] = c[1]; colors[i + 2] = c[2]; colors[i + 3] = 255; }
    return { width: SIDE, height: SIDE, colors };
  };
  return {
    timber: make((x, y) => { const g = (x % 4 === 0 ? -20 : 0) + ((x * 5 + y * 3) % 4) * 5; return [110 + g, 74 + g, 40 + g]; }),
    iron: make((x, y) => { const g = (y % 3 === 0 ? 22 : 0) + ((x + y) % 2) * 6; return [70 + g, 72 + g, 78 + g]; }),
    // a Mine Lamp's glass: a flame's warm gold, hottest at its heart (worn as its own glow too - systems/mine/mineHost.js)
    flame: make((x, y) => { const d = Math.hypot(x - 7.5, y - 8.5) / 8; return [255, Math.round(220 - 90 * d), Math.round(120 - 100 * d)]; }),
  };
}

/** Boxes as one mesh of `record`: each `[cx, cy, cz, w, h, d]`, every face both ways. */
function boxesModel(/** @type {number[][]} */ boxes, /** @type {number} */ record) {
  const P = [], N = [], U = [], I = [];
  const face = (/** @type {number[][]} */ q, /** @type {number[]} */ n) => {
    const b = P.length / 3;
    for (const v of q) { P.push(...v); N.push(...n); }
    U.push(0, 1, 1, 1, 1, 0, 0, 0);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
  };
  for (const [cx, cy, cz, w, h, d] of boxes) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy, y1 = cy + h, z0 = cz - d / 2, z1 = cz + d / 2;
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  }
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint32Array(I), subMeshes: [{ textureArchive: MINE_ART_ARCHIVE, textureRecord: record, startIndex: 0, primitiveCount: I.length / 3 }] };
}

/** The rig's frame (about its own foot, the hole at the origin): two posts, a crossbeam, a collar over the shaft. */
export function mineDrillFrameModel() {
  const S = MINE_DRILL_SIZE, h = S.span / 2;
  return boxesModel([
    [-h, 0, 0, S.post, S.tall, S.post], [h, 0, 0, S.post, S.tall, S.post],
    [0, S.tall - S.post, 0, S.span + S.post, S.post, S.post * 1.2],
    [0, S.tall - S.post * 2.6, 0, S.post * 2.2, S.post * 1.4, S.post * 2.2],
  ], MINE_DRILL_RECORDS.timber);
}

/** The shaft and its bit, about its own axis (turned by the host while the drill runs). */
export function mineDrillShaftModel() {
  const S = MINE_DRILL_SIZE;
  return boxesModel([
    [0, -0.25, 0, S.shaft, S.reach, S.shaft],
    [0, -0.35, 0, S.shaft * 2, 0.12, S.shaft * 0.6],   // the bit's flutes, across
    [0, S.reach - 0.55, 0, S.shaft * 2.4, 0.2, S.shaft * 2.4],   // the gear head
  ], MINE_DRILL_RECORDS.iron);
}

/** A MINE LAMP (2026-11-26): a timber post with a glowing lantern atop it, stood where a chamber's lamp is lit. Two meshes:
 *  the post (timber) and the lantern (flame, worn as its own glow so it shines in the dark). */
export function mineLampModels() {
  const post = boxesModel([[0, 0, 0, 0.12, 1.9, 0.12], [0.18, 1.78, 0, 0.42, 0.08, 0.08]], MINE_DRILL_RECORDS.timber);
  const lantern = boxesModel([[0.36, 1.42, 0, 0.26, 0.34, 0.26]], MINE_DRILL_RECORDS.flame);
  return { post, lantern };
}

export const MINE_LAMP_MARK_RECORD = 303;

/** A small ring just above the chamber floor. */
export function mineLampMarkerModel() {
  const positions = [], normals = [], uvs = [], indices = [];
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const angle = i * 2 * Math.PI / segments;
    for (const radius of [0.38, 0.45]) {
      positions.push(radius * Math.cos(angle), 0.025, radius * Math.sin(angle));
      normals.push(0, 1, 0);
      uvs.push(0.5, 0.5);
    }
    const inner = i * 2;
    const next = ((i + 1) % segments) * 2;
    indices.push(inner, next, inner + 1, inner + 1, next, next + 1);
  }
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    uvs: new Float32Array(uvs), indices: new Uint32Array(indices),
    subMeshes: [{ textureArchive: MINE_ART_ARCHIVE, textureRecord: MINE_LAMP_MARK_RECORD, startIndex: 0, primitiveCount: indices.length / 3 }],
  };
}
