// @ts-check
import { MINE_ART_ARCHIVE } from './mineArt.js';

export const MINE_WAY_OUT_RECORD = 200;
// `back` must stay under `MOUTH_BACK_M` (1.5 m) in mineModel.js, where the closing wall of the mouth tunnel sits.
export const MINE_WAY_OUT = Object.freeze({ w: 2.4, h: 2.9, back: 1.4, sink: 0.4 });
const SIDE = 32;

export function mineWayOutPicture() {
  const colors = new Uint8Array(SIDE * SIDE * 4), glow = new Uint8Array(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    const i = (y * SIDE + x) * 4, post = x < 4 || x >= SIDE - 4, lintel = y < 4;
    let c;
    if (post || lintel) {
      const g = ((post ? y : x) % 5 === 0 ? -18 : 0) + ((x * 7 + y * 3) % 3) * 4;
      c = [104 + g, 70 + g, 38 + g];
    } else {
      const f = (y - 4) / (SIDE - 5);
      c = [Math.round(255 - f * 25), Math.round(246 - f * 40), Math.round(214 - f * 70)];
    }
    colors[i] = c[0]; colors[i + 1] = c[1]; colors[i + 2] = c[2]; colors[i + 3] = 255;
    if (!post && !lintel) { glow[i] = c[0]; glow[i + 1] = c[1]; glow[i + 2] = c[2]; }
    glow[i + 3] = 255;
  }
  return { picture: { width: SIDE, height: SIDE, colors }, glow: { width: SIDE, height: SIDE, colors: glow } };
}

/**
 * Squares to the first leg of the mouth tunnel, not the mouth heading, which the leg can drift from.
 * @param {{ mouth: { at: number[], facing: number }, tunnels: any[] }} layout
 */
export function mineWayOutModel(layout) {
  const mouth = layout.mouth, pts = layout.tunnels.find((t) => t.from === 'mouth')?.pts;
  let ix = Math.cos(mouth.facing), iz = Math.sin(mouth.facing);
  if (pts?.length >= 2) { const dx = pts[1][0] - pts[0][0], dz = pts[1][2] - pts[0][2], l = Math.hypot(dx, dz); if (l > 1e-6) { ix = dx / l; iz = dz / l; } }
  const sx = -iz, sz = ix, W = MINE_WAY_OUT;
  const cx = mouth.at[0] - ix * W.back, cz = mouth.at[2] - iz * W.back, y0 = mouth.at[1] - W.sink, y1 = y0 + W.h, hw = W.w / 2;
  const c = [[cx - sx * hw, y0, cz - sz * hw], [cx + sx * hw, y0, cz + sz * hw], [cx + sx * hw, y1, cz + sz * hw], [cx - sx * hw, y1, cz - sz * hw]];
  const positions = new Float32Array([...c.flat(), ...c.flat()]);
  const normals = new Float32Array(24);
  for (let i = 0; i < 8; i++) { const s = i < 4 ? 1 : -1; normals[i * 3] = ix * s; normals[i * 3 + 2] = iz * s; }
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  return { positions, normals, uvs, indices, subMeshes: [{ textureArchive: MINE_ART_ARCHIVE, textureRecord: MINE_WAY_OUT_RECORD, startIndex: 0, primitiveCount: 4 }] };
}
