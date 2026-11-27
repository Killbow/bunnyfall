// AI-ROOMS: the NEW 3D PIECES - props ARCH3D never had, authored in code, each a `bunnyfall-dungeon-model/1` file
// (ids from 7,100,001; the Dungeon Editor's own start at 7,000,001). Origin at the middle of the base, y up, metres.
// Textures are Daggerfall's NUMBERS in the dungeon slots (120, 122, 123, 124), so a dungeon's texture table dresses a
// piece the way it dresses its walls. Wall = record 0, floor = 2, ceiling = 3 (4 in slot 122).
import { Mesh } from './mesh.mjs';

const W = (slot) => `${slot}_0`, F = (slot) => `${slot}_2`;

/** A ring wall: outer faces out, inner faces in, the top an annulus. */
function ring(m, cx, cz, y0, y1, rOut, rIn, sides, tex) {
  const T = 3.2, p = (r, y, k) => [cx + r * Math.cos((k / sides) * Math.PI * 2), y, cz + r * Math.sin((k / sides) * Math.PI * 2)];
  for (let k = 0; k < sides; k++) {
    const mid = p(rOut, 0, k + 0.5), u0 = k / sides, u1 = (k + 1) / sides;
    m.quad(tex, [p(rOut, y0, k), p(rOut, y0, k + 1), p(rOut, y1, k + 1), p(rOut, y1, k)], [[u0, (y0 - y1) / T], [u1, (y0 - y1) / T], [u1, 0], [u0, 0]], [mid[0] - cx, 0, mid[2] - cz]);
    m.quad(tex, [p(rIn, y0, k), p(rIn, y0, k + 1), p(rIn, y1, k + 1), p(rIn, y1, k)], [[u0, (y0 - y1) / T], [u1, (y0 - y1) / T], [u1, 0], [u0, 0]], [cx - mid[0], 0, cz - mid[2]]);
    m.quad(tex, [p(rOut, y1, k), p(rOut, y1, k + 1), p(rIn, y1, k + 1), p(rIn, y1, k)], [[u0, 0], [u1, 0], [u1, 0.3], [u0, 0.3]], [0, 1, 0]);
  }
}
const cone = (m, cx, cz, y0, h, r, sides, tex) => m.prism(cx, cz, y0, y0 + h, r, 0, sides, tex, { cap: false });

export const PIECES = [
  { id: 7100001, name: 'pillar-square', note: 'A square pillar with a base and a capital, floor to a 3.2 m ceiling.', build(m) { const t = W(122); m.box(-0.6, 0, -0.6, 0.6, 0.35, 0.6, t); m.box(-0.45, 0.35, -0.45, 0.45, 2.85, 0.45, t); m.box(-0.6, 2.85, -0.6, 0.6, 3.2, 0.6, t); } },
  { id: 7100002, name: 'pillar-square-tall', note: 'The same pillar for a 6.4 m hall.', build(m) { const t = W(122); m.box(-0.7, 0, -0.7, 0.7, 0.5, 0.7, t); m.box(-0.5, 0.5, -0.5, 0.5, 5.9, 0.5, t); m.box(-0.7, 5.9, -0.7, 0.7, 6.4, 0.7, t); } },
  { id: 7100003, name: 'pillar-round', note: 'An eight-sided column with a wider foot and head, 3.2 m.', build(m) { const t = W(120); m.prism(0, 0, 0, 0.3, 0.7, 0.5, 8, t, { cap: false }); m.prism(0, 0, 0.3, 2.9, 0.5, 0.5, 8, t, { cap: false }); m.prism(0, 0, 2.9, 3.2, 0.5, 0.7, 8, t); } },
  { id: 7100004, name: 'pillar-round-tall', note: 'The round column for a 6.4 m hall.', build(m) { const t = W(120); m.prism(0, 0, 0, 0.5, 0.9, 0.65, 8, t, { cap: false }); m.prism(0, 0, 0.5, 5.9, 0.65, 0.65, 8, t, { cap: false }); m.prism(0, 0, 5.9, 6.4, 0.65, 0.9, 8, t); } },
  { id: 7100005, name: 'pillar-broken', note: 'A column snapped off at the knee, its drum lying beside it.', build(m) { const t = W(120); m.prism(0, 0, 0, 0.3, 0.7, 0.5, 8, t, { cap: false }); m.prism(0, 0, 0.3, 1.5, 0.5, 0.45, 8, t); m.prism(0.95, 0.15, 0, 0.5, 0.5, 0.5, 8, t); m.box(-0.95, 0, -0.7, -0.4, 0.25, -0.2, t); } },
  { id: 7100006, name: 'arch', note: 'Two slim posts and a lintel across 3.2 m: a 2.6 m opening, 2.6 m high.', build(m) { const t = W(124); m.box(-1.6, 0, -0.3, -1.3, 3.2, 0.3, t); m.box(1.3, 0, -0.3, 1.6, 3.2, 0.3, t); m.box(-1.6, 2.6, -0.3, 1.6, 3.2, 0.3, t); } },
  { id: 7100007, name: 'sarcophagus', note: 'A stone coffin on a slab with a heavy lid.', build(m) { const t = W(123); m.box(-1.2, 0, -0.55, 1.2, 0.2, 0.55, F(123)); m.box(-1.0, 0.2, -0.45, 1.0, 0.8, 0.45, t); m.box(-1.1, 0.8, -0.5, 1.1, 1.05, 0.5, t); m.box(-0.8, 1.05, -0.3, 0.8, 1.2, 0.3, t); } },
  { id: 7100008, name: 'altar', note: 'A block altar on two steps.', build(m) { const t = W(124); m.box(-1.6, 0, -1.0, 1.6, 0.25, 1.0, F(124)); m.box(-1.3, 0.25, -0.75, 1.3, 0.5, 0.75, F(124)); m.box(-1.0, 0.5, -0.45, 1.0, 1.3, 0.45, t); m.box(-1.1, 1.3, -0.55, 1.1, 1.45, 0.55, t); } },
  { id: 7100009, name: 'statue', note: 'A robed figure on a plinth, arms at its sides.', build(m) { const t = W(120); m.box(-0.6, 0, -0.6, 0.6, 0.9, 0.6, t); m.box(-0.35, 0.9, -0.25, 0.35, 2.1, 0.25, t); m.box(-0.55, 1.2, -0.2, -0.35, 2.0, 0.2, t); m.box(0.35, 1.2, -0.2, 0.55, 2.0, 0.2, t); m.box(-0.2, 2.1, -0.2, 0.2, 2.55, 0.2, t); } },
  { id: 7100010, name: 'stalagmites', note: 'Three stone fangs rising from the floor.', build(m) { const t = W(120); cone(m, 0, 0, 0, 2.2, 0.55, 6, t); cone(m, 0.8, 0.4, 0, 1.4, 0.4, 6, t); cone(m, -0.6, 0.7, 0, 1.0, 0.35, 5, t); } },
  { id: 7100011, name: 'stalactites', note: 'Fangs hanging from the ceiling; the origin is at the ceiling.', build(m) { const t = W(120); const hang = (cx, cz, h, r, s) => m.prism(cx, cz, -h, 0, 0, r, s, t, { cap: false }); hang(0, 0, 2.0, 0.55, 6); hang(0.8, -0.3, 1.2, 0.4, 6); hang(-0.7, 0.5, 0.9, 0.35, 5); } },
  { id: 7100012, name: 'rubble', note: 'A fallen heap: chunks of wall and floor.', build(m) { const t = W(122); m.prism(0, 0, 0, 0.6, 1.0, 0.45, 6, t); m.prism(0.9, 0.5, 0, 0.45, 0.6, 0.35, 5, t); m.prism(-0.8, -0.6, 0, 0.35, 0.5, 0.3, 5, t); m.box(-0.2, 0.55, -0.2, 0.5, 0.85, 0.4, t); m.box(0.7, 0, -0.9, 1.3, 0.3, -0.4, F(122)); } },
  { id: 7100013, name: 'cage', note: 'An iron-barred cage on a stone floor, 1.6 m square.', build(m) { const t = W(124); m.box(-0.8, 0, -0.8, 0.8, 0.2, 0.8, F(124)); for (let k = 0; k <= 4; k++) { const a = -0.75 + k * 0.375; m.box(a - 0.04, 0.2, -0.79, a + 0.04, 2.2, -0.71, t); m.box(a - 0.04, 0.2, 0.71, a + 0.04, 2.2, 0.79, t); if (k > 0 && k < 4) { m.box(-0.79, 0.2, a - 0.04, -0.71, 2.2, a + 0.04, t); m.box(0.71, 0.2, a - 0.04, 0.79, 2.2, a + 0.04, t); } } m.box(-0.8, 2.2, -0.8, 0.8, 2.35, 0.8, t); } },
  { id: 7100014, name: 'well', note: 'A low round wall round a drop. The inside is dark, not open: nothing falls.', build(m) { const t = W(123); ring(m, 0, 0, 0, 0.9, 1.3, 0.85, 8, t); m.prism(0, 0, 0.02, 0.02, 0.85, 0.85, 8, F(123)); } },
  { id: 7100015, name: 'throne', note: 'A high-backed stone seat on a two-step dais.', build(m) { const t = W(120); m.box(-1.3, 0, -1.3, 1.3, 0.3, 1.3, F(120)); m.box(-1.0, 0.3, -1.0, 1.0, 0.6, 1.0, F(120)); m.box(-0.5, 0.6, -0.5, 0.5, 1.1, 0.5, t); m.box(-0.5, 1.1, 0.3, 0.5, 2.8, 0.5, t); m.box(-0.7, 0.6, -0.5, -0.5, 1.4, 0.5, t); m.box(0.5, 0.6, -0.5, 0.7, 1.4, 0.5, t); } },
  { id: 7100016, name: 'stone-table', note: 'A slab table on two block legs, 2.4 m long.', build(m) { const t = W(122); m.box(-1.1, 0, -0.35, -0.7, 0.8, 0.35, t); m.box(0.7, 0, -0.35, 1.1, 0.8, 0.35, t); m.box(-1.2, 0.8, -0.5, 1.2, 1.0, 0.5, F(122)); } },
  { id: 7100017, name: 'barred-gate', note: 'A grating across a 3.2 m opening; solid to walk into.', build(m) { const t = W(124); m.box(-1.6, 2.7, -0.15, 1.6, 3.2, 0.15, t); for (let k = 0; k <= 16; k++) { const x = -1.55 + k * 0.194; m.box(x - 0.03, 0, -0.05, x + 0.03, 2.7, 0.05, t); } m.box(-1.6, 0.9, -0.08, 1.6, 1.0, 0.08, t); m.box(-1.6, 1.9, -0.08, 1.6, 2.0, 0.08, t); } },
  { id: 7100018, name: 'bone-pile', note: 'Skulls and long bones heaped low.', build(m) { const t = W(123); m.prism(0, 0, 0, 0.35, 0.9, 0.5, 6, t); for (const [x, z] of [[0.3, 0.2], [-0.4, 0.1], [0.1, -0.4]]) m.box(x - 0.15, 0.3, z - 0.15, x + 0.15, 0.6, z + 0.15, F(123)); m.box(-0.9, 0.1, -0.1, 0.8, 0.22, 0.05, F(123)); } },
  { id: 7100019, name: 'dais-step', note: 'A 3.2 m wide, 0.4 m high step to stand a prop on.', build(m) { const t = F(120); m.box(-1.6, 0, -1.6, 1.6, 0.4, 1.6, t); } },
  { id: 7100020, name: 'lectern', note: 'A stone reading stand, chest high, the top sloped by stacked slabs.', build(m) { const t = W(124); m.box(-0.3, 0, -0.3, 0.3, 0.9, 0.3, t); m.box(-0.5, 0.9, -0.4, 0.5, 1.05, 0.4, t); m.box(-0.5, 1.05, -0.2, 0.5, 1.2, 0.4, t); } },
  { id: 7100021, name: 'pillar-huge', note: 'A great round column, 9.6 m, for the tall halls.', build(m) { const t = W(120); m.prism(0, 0, 0, 0.6, 1.1, 0.85, 8, t, { cap: false }); m.prism(0, 0, 0.6, 9.0, 0.85, 0.85, 8, t, { cap: false }); m.prism(0, 0, 9.0, 9.6, 0.85, 1.1, 8, t); } },
];
export const PIECE_ID = Object.freeze(Object.fromEntries(PIECES.map((p) => [p.name, p.id])));
/** Every piece as a model file's JSON. */
export const pieceModels = () => PIECES.map((p) => { const m = new Mesh(); p.build(m); return m.toModel(p.id); });
