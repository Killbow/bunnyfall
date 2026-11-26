// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE WAY OUT, SEEN - the owner: "the way out needs a texture as well". A timber-framed
// opening onto daylight hung across the mouth tunnel just behind its exit door (systems/mine/mineHost.js mineExitDoor),
// so the way back up reads from down the tunnel. One quad, both faces, its picture drawn here (no file to load) and
// uploaded under the mines' own pseudo-archive (world/mine/mineArt.js MINE_ART_ARCHIVE), a record past the baked ones.
import { MINE_ART_ARCHIVE } from './mineArt.js';

/** The way out's picture record, and the opening's size and how far behind the door it hangs (m). */
export const MINE_WAY_OUT_RECORD = 200;
export const MINE_WAY_OUT = Object.freeze({ w: 2.4, h: 2.9, back: 1.4, sink: 0.4 });   // back: against the tunnel's closing wall (1.5 m)
const SIDE = 32;

/** The picture: daylight paling upward inside a timber frame (posts, a lintel), RGBA, top row first; and its glow (the
 *  daylight alone, the timbers black), so the light outside shines whatever the cave's dark - the timbers take its light. */
export function mineWayOutPicture() {
  const colors = new Uint8Array(SIDE * SIDE * 4), glow = new Uint8Array(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    const i = (y * SIDE + x) * 4, post = x < 4 || x >= SIDE - 4, lintel = y < 4;
    let c;
    if (post || lintel) {   // the timbers, their grain a stripe every few texels
      const g = ((post ? y : x) % 5 === 0 ? -18 : 0) + ((x * 7 + y * 3) % 3) * 4;
      c = [104 + g, 70 + g, 38 + g];
    } else {   // daylight: white-gold near the top, a sandy glare toward the ground
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
 * The opening as a mesh in the mine's frame: across the mouth tunnel, `back` behind the door, facing into the mine. It
 * squares to the tunnel's own first leg (its closing wall's, world/mine/mineModel.js), not the mouth's heading, which
 * the leg wanders from.
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
