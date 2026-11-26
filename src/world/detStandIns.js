import { registerCustomModel } from './customModels.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { buildDerivedPicture } from '../formats/derivedTexture.js';
import { TOWN_PICTURE_ARCHIVE, PICTURE, townPictureEntries } from './townPictures.js';
import { STAND_IN_SPRITES } from './standInSprites.js';

const ROPE = [0, 77];
const IRON = [0, 79];
const WOOD = [67, 0];
const WOOD_DARK = [67, 8];
const CLOTH = [116, 4];
const TIMBER = [67, 14];
const STONE = [87, 5];
const FLUE = [317, 0];
const FLUE_TOP = [317, 2];
const SOOT = [0, 79];
const TERRACOTTA = [0, 36];
const SOIL = [0, 45];
const BARK = [0, 44];
const HEARTWOOD = [0, 69];
const LEAVES = [TOWN_PICTURE_ARCHIVE, PICTURE.leaves];

export class MeshBuilder {
  constructor() { this.groups = new Map(); }
  _group(tex) {
    const key = `${tex[0]}_${tex[1]}`;
    let g = this.groups.get(key);
    if (!g) { g = { archive: tex[0], record: tex[1], positions: [], normals: [], uvs: [], indices: [] }; this.groups.set(key, g); }
    return g;
  }
  tri(tex, a, b, c, n, ua = [0, 0], ub = [1, 0], uc = [1, -1]) {
    const g = this._group(tex);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const verts = flip ? [[a, ua], [c, uc], [b, ub]] : [[a, ua], [b, ub], [c, uc]];
    const base = g.positions.length / 3;
    for (const [p, uv] of verts) { g.positions.push(p[0], p[1], p[2]); g.normals.push(n[0], n[1], n[2]); g.uvs.push(uv[0], uv[1]); }
    g.indices.push(base, base + 1, base + 2);
  }
  quad(tex, p0, p1, p2, p3, n, uv = [[0, 0], [1, 0], [1, -1], [0, -1]]) {
    this.tri(tex, p0, p1, p2, n, uv[0], uv[1], uv[2]);
    this.tri(tex, p0, p2, p3, n, uv[0], uv[2], uv[3]);
  }
  sheet(tex, p0, p1, p2, p3, n, uv) {
    this.quad(tex, p0, p1, p2, p3, n, uv);
    this.quad(tex, p0, p1, p2, p3, [-n[0], -n[1], -n[2]], uv);
  }
  box(tex, c, s, uvScale = 1) {
    const [cx, cy, cz] = c, [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const P = (x, y, z) => [cx + x * hx, cy + y * hy, cz + z * hz];
    const u = (w, h) => [[0, 0], [w * uvScale, 0], [w * uvScale, -h * uvScale], [0, -h * uvScale]];
    this.quad(tex, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1], u(s[0], s[1]));
    this.quad(tex, P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [0, 0, -1], u(s[0], s[1]));
    this.quad(tex, P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), [1, 0, 0], u(s[2], s[1]));
    this.quad(tex, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), [-1, 0, 0], u(s[2], s[1]));
    this.quad(tex, P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), [0, 1, 0], u(s[0], s[2]));
    this.quad(tex, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), [0, -1, 0], u(s[0], s[2]));
  }
  cylinderY(tex, base, r, h, seg = 6, vRepeat = 0.5, caps = true) {
    const [bx, by, bz] = base;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (a, y) => [bx + Math.cos(a) * r, by + y, bz + Math.sin(a) * r];
      const n = [Math.cos(am), 0, Math.sin(am)];
      const u0 = i / seg, u1 = (i + 1) / seg, v = -h / vRepeat;
      this.quad(tex, p(a0, 0), p(a1, 0), p(a1, h), p(a0, h), n, [[u0, 0], [u1, 0], [u1, v], [u0, v]]);
      if (caps) {
        this.tri(tex, [bx, by + h, bz], p(a0, h), p(a1, h), [0, 1, 0]);
        this.tri(tex, [bx, by, bz], p(a1, 0), p(a0, 0), [0, -1, 0]);
      }
    }
  }
  cylinderX(tex, base, r, len, seg = 5) {
    const [bx, by, bz] = base;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (a, x) => [bx + x, by + Math.cos(a) * r, bz + Math.sin(a) * r];
      this.quad(tex, p(a0, 0), p(a1, 0), p(a1, len), p(a0, len), [0, Math.cos(am), Math.sin(am)], [[0, 0], [len * 2, 0], [len * 2, -0.25], [0, -0.25]]);
    }
  }
  build() {
    let nv = 0, ni = 0;
    for (const g of this.groups.values()) { nv += g.positions.length / 3; ni += g.indices.length; }
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), indices = new Uint32Array(ni);
    const subMeshes = [];
    let v = 0, i = 0;
    for (const g of this.groups.values()) {
      positions.set(g.positions, v * 3); normals.set(g.normals, v * 3); uvs.set(g.uvs, v * 2);
      for (let k = 0; k < g.indices.length; k++) indices[i + k] = g.indices[k] + v;
      subMeshes.push({ textureArchive: g.archive, textureRecord: g.record, startIndex: i, primitiveCount: g.indices.length / 3 });
      v += g.positions.length / 3; i += g.indices.length;
    }
    return { positions, normals, uvs, indices, subMeshes, doors: [] };
  }
}

// One classic model unit is 0.025 m, the Daggerfall Unity mesh scale.
const U = 0.025;
export const DET_SEGMENT_UNITS = 85;

export const DET_MODELS = Object.freeze({
  45081: () => timber(TIMBER, 6, DET_SEGMENT_UNITS),
  45110: () => timber(TIMBER, 8, DET_SEGMENT_UNITS),
  45121: () => {
    const m = new MeshBuilder();
    m.box(WOOD_DARK, [0, 0.04, 0], [0.07, 0.08, 0.07], 4);
    m.sheet(CLOTH, [0.02, 0.1, 0], [0.62, 0.12, 0], [0.62, 0.48, 0], [0.02, 0.5, 0], [0, 0, 1], [[0, 0], [1, 0], [1, -1], [0, -1]]);
    m.cylinderY(ROPE, [0, 0.08, 0], 0.012, 0.44, 4, 0.4, false);
    return m.build();
  },
  45164: () => hanging(DET_PICTURES[45164], 0.8, 1.2),
  45161: () => hanging(DET_PICTURES[45161], 0.8, 1.2),
  45082: () => { const m = new MeshBuilder(); m.cylinderY(WOOD, [0, 0, 0], 0.045, 2.1, 6, 0.6); m.box(WOOD_DARK, [0, 2.13, 0], [0.1, 0.07, 0.1], 4); return m.build(); },
  45162: () => hanging(DET_PICTURES[45162], 0.8, 1.2),
  45145: () => hanging(DET_PICTURES[45145], 1.0, 1.5),
  45190: () => {
    const m = new MeshBuilder();
    m.box(WOOD, [0, 0.22, 0], [0.9, 0.44, 0.5], 2);
    m.box(WOOD_DARK, [0, 0.49, 0], [0.92, 0.1, 0.52], 2);
    for (const x of [-0.3, 0.3]) m.box(IRON, [x, 0.28, 0], [0.05, 0.56, 0.54]);
    m.box(IRON, [0, 0.4, 0.265], [0.08, 0.1, 0.02]);
    return m.build();
  },
  45191: () => {
    const m = new MeshBuilder();
    for (const x of [-0.55, 0.55]) { m.box(WOOD_DARK, [x, 0.65, 0], [0.08, 1.3, 0.08]); m.box(WOOD_DARK, [x, 0.03, 0], [0.12, 0.06, 0.4]); }
    m.box(WOOD, [0, 1.1, 0], [1.18, 0.07, 0.07]);
    m.box(WOOD, [0, 0.35, 0.06], [1.18, 0.07, 0.07]);
    for (let i = 0; i < 5; i++) {
      const x = -0.4 + i * 0.2;
      m.cylinderY(WOOD, [x, 0.08, 0.06], 0.018, 1.55, 5, 0.6, false);
      m.box(IRON, [x, 1.66, 0.06], [0.04, 0.16, 0.02]);
    }
    return m.build();
  },
});

function timber(tex, side, len) {
  const m = new MeshBuilder();
  squared(m, tex, tex, (side * U) / 2, (side * U) / 2, 0, len * U, 1.6);
  return m.build();
}
function squared(m, tex, capTex, hx, hz, y0, y1, repeat = 1.6, cx = 0, cz = 0) {
  const P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const along = (y1 - y0) / repeat;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % 4];
    const n = i === 0 ? [0, 0, -1] : i === 1 ? [1, 0, 0] : i === 2 ? [0, 0, 1] : [-1, 0, 0];
    m.quad(tex, [cx + ax, y0, cz + az], [cx + bx, y0, cz + bz], [cx + bx, y1, cz + bz], [cx + ax, y1, cz + az], n, [[0, 0], [0, -1], [along, -1], [along, 0]]);
  }
  m.quad(capTex, [cx - hx, y1, cz - hz], [cx + hx, y1, cz - hz], [cx + hx, y1, cz + hz], [cx - hx, y1, cz + hz], [0, 1, 0]);
  m.quad(capTex, [cx - hx, y0, cz + hz], [cx + hx, y0, cz + hz], [cx + hx, y0, cz - hz], [cx - hx, y0, cz - hz], [0, -1, 0]);
}
function hanging(record, w, h, { banner = false } = {}) {
  const m = new MeshBuilder(), tex = [TOWN_PICTURE_ARCHIVE, record], hw = w / 2, z = 0.004;
  for (const side of [1, -1]) {
    const n = [0, 0, side], zz = z * side, L = hw * side;
    const uv = (x, y) => [(L - x) / (2 * L), y / h];
    const P = (x, y) => [x, y, zz];
    const cut = banner ? h * 0.8 : h;
    m.quad(tex, P(L, 0), P(-L, 0), P(-L, -cut), P(L, -cut), n, [uv(L, 0), uv(-L, 0), uv(-L, -cut), uv(L, -cut)]);
    if (banner) {
      const notch = -cut - (h - cut) * 0.45;
      for (const e of [L, -L]) {
        m.tri(tex, P(e, -cut), P(0, -cut), P(0, notch), n, uv(e, -cut), uv(0, -cut), uv(0, notch));
        m.tri(tex, P(e, -cut), P(0, notch), P(e, -h), n, uv(e, -cut), uv(0, notch), uv(e, -h));
      }
    }
  }
  m.cylinderX(WOOD, [-hw - 0.04, 0, 0], 0.016, w + 0.08, 6);
  return m.build();
}
function rugModel(record, w, d) {
  const m = new MeshBuilder(), tex = [TOWN_PICTURE_ARCHIVE, record], hw = w / 2, hd = d / 2, t = 0.012;
  m.quad(tex, [hw, t, -hd], [-hw, t, -hd], [-hw, t, hd], [hw, t, hd], [0, 1, 0], [[0, 0], [1, 0], [1, -1], [0, -1]]);
  squared(m, SOIL, SOIL, hw, hd, 0, t * 0.999, 1.6);
  return m.build();
}
function dome(m, tex, c, r, hgt, seg = 8, rings = 3) {
  const P = (k, i) => { const a = (i / seg) * Math.PI * 2, t = (k / rings) * (Math.PI / 2); return [c[0] + Math.cos(a) * r * Math.cos(t), c[1] + hgt * Math.sin(t), c[2] + Math.sin(a) * r * Math.cos(t)]; };
  for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) {
    const a = P(k, i), b = P(k, i + 1), d = P(k + 1, i), e = P(k + 1, i + 1);
    const mid = [(a[0] + e[0]) / 2 - c[0], (a[1] + e[1]) / 2 - c[1], (a[2] + e[2]) / 2 - c[2]], l = Math.hypot(...mid) || 1;
    const n = [mid[0] / l, mid[1] / l, mid[2] / l];
    if (k === rings - 1) m.tri(tex, a, b, d, n); else m.quad(tex, a, b, e, d, n);
  }
}
function flue() { const m = new MeshBuilder(), h = (53 * U) / 2; squared(m, FLUE, SOOT, h, h, 0, 114 * U, 1.6); return m.build(); }
function flueTopper() {
  const m = new MeshBuilder();
  squared(m, FLUE_TOP, FLUE_TOP, (61 * U) / 2, (61 * U) / 2, 0, 8 * U, 1.6);
  squared(m, FLUE, FLUE_TOP, (45 * U) / 2, (45 * U) / 2, 8 * U, 20 * U, 1.6);
  for (const x of [-9, 9]) { m.cylinderY(TERRACOTTA, [x * U, 20 * U, 0], 5 * U, 14 * U, 8, 0.6, false); m.cylinderY(SOOT, [x * U, 33.5 * U, 0], 3.5 * U, 0.5 * U, 8, 0.6, true); }
  return m.build();
}
function flueBase() {
  const m = new MeshBuilder();
  squared(m, FLUE, FLUE_TOP, (53 * U) / 2, (80 * U) / 2, 0, 30 * U, 1.6);
  squared(m, FLUE, FLUE_TOP, (53 * U) / 2, (66 * U) / 2, 30 * U, 60 * U, 1.6, 0, -7 * U);
  return m.build();
}
function stump() { const m = new MeshBuilder(); m.cylinderY(BARK, [0, 0, 0], 0.2, 0.4, 8, 0.4, false); dome(m, HEARTWOOD, [0, 0.4, 0], 0.2, 0.001, 8, 1); return m.build(); }
function flowerPot() {
  const m = new MeshBuilder();
  m.cylinderY(TERRACOTTA, [0, 0, 0], 0.13, 0.22, 8, 0.4, false);
  dome(m, SOIL, [0, 0.2, 0], 0.125, 0.001, 8, 1);
  dome(m, LEAVES, [0, 0.21, 0], 0.18, 0.2, 8, 3);
  return m.build();
}
function columnDrum() { const m = new MeshBuilder(); m.cylinderY(STONE, [0, 0, 0], 10 * U, 57 * U, 10, 1.2, false); return m.build(); }
function columnHead() {
  const m = new MeshBuilder();
  squared(m, STONE, STONE, 13 * U, 13 * U, 0, 6 * U, 1.6);
  squared(m, STONE, STONE, 17 * U, 17 * U, 6 * U, 12 * U, 1.6);
  return m.build();
}

const DECOR_ORDER = Object.freeze([45134, 45135, 45136, 45137, 45138, 45139, 45140, 45158, 45159, 45160, 45161, 45162, 45163, 45164]);
const decor = (id) => PICTURE.decorative(DECOR_ORDER.indexOf(id));
const REGIONS = Object.freeze([['Glenpoint', 45008, 45044], ['Totambu', 45023, 45059], ['Lainlyn', 45024, 45060], ['Santaki', 45029, 45065], ['Abibon-Gora', 45034, 45070]]);
const DIVINES = Object.freeze(['Akatosh', 'Arkay', 'Dibella', 'Julianos', 'Kynareth', 'Zenithar', 'Mara', 'Stendarr']);
const DIVINE_TAPESTRIES = Object.freeze(DIVINES.map((god) => 45141 + DIVINES.indexOf(god)));
const DIVINE_BANNERS = Object.freeze(DIVINES.map((_god, k) => 45150 + k));

export const DET_PICTURES = Object.freeze({
  ...Object.fromEntries(REGIONS.flatMap(([name, tapestry, flag]) => [[tapestry, PICTURE.regionTapestry(name)], [flag, PICTURE.regionBanner(name)]])),
  ...Object.fromEntries(DIVINE_TAPESTRIES.map((id, k) => [id, PICTURE.divineTapestry(DIVINES[k])])),
  ...Object.fromEntries(DIVINE_BANNERS.map((id, k) => [id, PICTURE.divineBanner(DIVINES[k])])),
  ...Object.fromEntries(DECOR_ORDER.map((id) => [id, decor(id)])),
  45192: PICTURE.rug(0), 45194: PICTURE.rug(1),
});

export const DET_TOWN_MODELS = Object.freeze({
  ...Object.fromEntries(REGIONS.flatMap(([_name, tapestry, flag]) => [
    [tapestry, () => hanging(DET_PICTURES[tapestry], 0.9, 1.35)],
    [flag, () => hanging(DET_PICTURES[flag], 0.6, 1.6, { banner: true })],
  ])),
  ...Object.fromEntries(DIVINE_TAPESTRIES.filter((id) => id !== 45145).map((id) => [id, () => hanging(DET_PICTURES[id], 1.0, 1.5)])),
  ...Object.fromEntries(DIVINE_BANNERS.map((id) => [id, () => hanging(DET_PICTURES[id], 0.7, 1.8, { banner: true })])),
  ...Object.fromEntries(DECOR_ORDER.filter((id) => ![45161, 45162, 45164].includes(id)).map((id) => [id, () => hanging(DET_PICTURES[id], 0.8, 1.2)])),
  45074: flueBase,
  45076: flue,
  45077: flueTopper,
  45087: () => DET_MODELS[45121](),
  45111: () => timber(TIMBER, 10, DET_SEGMENT_UNITS),
  45112: () => timber(TIMBER, 4, DET_SEGMENT_UNITS),
  45113: () => timber(TIMBER, 4, DET_SEGMENT_UNITS),
  45129: () => timber(STONE, 6, DET_SEGMENT_UNITS),
  45114: stump,
  45115: stump,
  45120: flowerPot,
  45122: flowerPot,
  45169: columnDrum,
  45170: columnHead,
  45192: () => rugModel(DET_PICTURES[45192], 1.2, 0.8),
  45194: () => rugModel(DET_PICTURES[45194], 1.2, 0.8),
});

export const DET_FLAT_STAND_INS = Object.freeze({
  10021: Object.freeze({ 13: [218, 0], 17: [213, 0], 22: [200, 1], 27: [205, 30] }),
  10025: Object.freeze({ 3: [205, 17] }),
  10027: Object.freeze({
    0: [208, 0], 4: [205, 22], 5: [205, 23], 6: [205, 17], 7: [205, 18], 8: [205, 24], 9: [205, 25],
    10: [205, 0], 11: [200, 1], 12: [205, 30], 13: [218, 4], 14: [204, 7],
  }),
});
export const DET_FLAT_DRAWINGS = Object.freeze({
  10009: Object.freeze({ 14: ['monkey', 0] }),
  10010: Object.freeze({
    3: ['brownRooster', 0], 4: ['brownChickenPecking', 0], 5: ['brownChicken', 0], 6: ['brownChickenLooking', 0],
    15: ['sheep', 128], 16: ['sheepFront', 128], 17: ['sheepResting', 128],
    22: ['whiteChickenLooking', 0], 23: ['whiteChicken', 0], 24: ['whiteChickenPecking', 0], 25: ['whiteRooster', 0],
    36: ['blackRat', 0], 38: ['brownRat', 0], 40: ['blackRatSitting', 0],
    42: ['dove', 0], 43: ['dovePecking', 0], 44: ['dove', 0], 45: ['doveWing', 0], 46: ['dovePecking', 0],
    47: ['dove', 0], 48: ['doveWing', 0], 49: ['dovePecking', 0], 50: ['dove', 0],
  }),
  10021: Object.freeze({
    0: ['cherries', -128], 1: ['pear', -96], 2: ['plum', -96], 3: ['peach', -96], 4: ['olives', -64],
    5: ['cheeseWheel', -32], 6: ['cheeseWheelCut', -32], 7: ['cheeseSlice', -64], 8: ['cheeseSliceHoles', -64], 9: ['cheeseWheel', -32],
    10: ['softCheese', -64], 11: ['roastPlatter', -32], 12: ['porridge', -64], 14: ['grapes', -96], 15: ['whiteGrapes', -96], 16: ['cabbage', -64],
  }),
  10022: Object.freeze({ 4: ['easel', 64] }),
  10023: Object.freeze({ 0: ['firewood', 0] }),
  10024: Object.freeze({ 0: ['wheatBundle', 64], 1: ['grainPile', 0] }),
  10025: Object.freeze({ 0: ['brokenBottles', -64] }),
  10027: Object.freeze({ 1: ['blockToy', -96], 3: ['rollingPin', -96] }),
});
export const DET_TOWN_FLATS = Object.freeze({
  10010: Object.freeze({
    18: [201, 3, 1], 19: [201, 4, 0.6], 20: [201, 3, 1.1],
    51: [201, 0, 1], 52: [201, 0, 1],
    73: [201, 9, 1], 74: [201, 10, 1], 75: [201, 9, 1], 76: [201, 10, 1], 77: [201, 9, 1], 78: [201, 10, 1],
  }),
  10024: Object.freeze({ 2: [205, 17, 1] }),
  10025: Object.freeze({ 2: [213, 4, 1] }),
  10028: Object.freeze({ 4: [202, 4, 1] }),
});
export const DET_OLD_ARCHIVES = Object.freeze({ 1010: 10010, 1021: 10021, 1025: 10025 });

export const DET_DOLPHIN_RECORDS = Object.freeze([29, 30, 31]);
const DOLPHIN = { w: 40, h: 56, body: [96, 110, 128], back: [58, 70, 88], belly: [196, 206, 214], eye: [20, 22, 26] };

export function drawDolphin(k) {
  const { w, h } = DOLPHIN;
  const data = new Uint8Array(w * h * 4);
  const tilt = [-0.62, 0, 0.62][k];
  const cx = w / 2, cy = 15, len = 30;
  const cs = Math.cos(tilt), sn = Math.sin(tilt);
  const toBody = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const bx = dx * cs + dy * sn, by = -dx * sn + dy * cs;
    return [bx / len + 0.5, by + Math.sin(Math.min(1, Math.max(0, bx / len + 0.5)) * Math.PI) * 2.6];
  };
  const halfWidth = (u) => {
    if (u < 0 || u > 1) return -1;
    if (u > 0.9) return 1.2 + (1 - u) * 8;
    if (u > 0.78) return 4.2 - (u - 0.78) * 16;
    if (u < 0.2) return 0.9 + u * 16;
    return 4.2;
  };
  const inside = (x, y) => {
    const [u, v] = toBody(x, y);
    const hw = halfWidth(u);
    if (hw > 0 && Math.abs(v) <= hw) return v / hw;
    if (u > 0.42 && u < 0.62 && v < 0 && -v < hw + (0.62 - u) * 30 - Math.abs(u - 0.5) * 20) return -1;
    if (u > -0.1 && u < 0.04 && Math.abs(v) < 1 + (0.04 - u) * 45) return -0.6;
    return null;
  };
  const set = (x, y, c) => { const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = inside(x + 0.5, y + 0.5);
      if (q === null) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inside(x + 0.5 + a, y + 0.5 + b) === null);
      set(x, y, edge ? DOLPHIN.back.map((c) => c * 0.7) : q < -0.25 ? DOLPHIN.back : q > 0.4 ? DOLPHIN.belly : DOLPHIN.body);
    }
  }
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] !== 0;
  const slivers = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => opaque(x + a, y + b)).length <= 1) slivers.push((y * w + x) * 4);
  for (const i of slivers) data[i + 3] = 0;
  const eu = 0.8, ev = -1.2;
  const bx = (eu - 0.5) * len, by = ev - Math.sin(eu * Math.PI) * 2.6;
  const ex = Math.round(cx + bx * cs - by * sn), ey = Math.round(cy + bx * sn + by * cs);
  if (ex >= 0 && ey >= 0 && ex < w && ey < h) set(ex, ey, DOLPHIN.eye);
  return { width: w, height: h, data };
}
// Sprites grow by `1 + scale / 256` with 2.5 cm pixels, so 384 makes the 32-pixel body about two meters long.
export const DOLPHIN_SCALE = Object.freeze({ width: 384, height: 384 });

let _installed = false;
const _gates = new Set();
export const detStandInsOn = () => { for (const g of _gates) if (g() === true) return true; return false; };
// Installs once. Every later call only adds its switch to the set that turns the stand-ins on.
export function installDetStandIns(isOn) {
  if (typeof isOn === 'function') _gates.add(isOn);
  if (_installed) return 0;
  _installed = true;
  const gate = detStandInsOn;
  for (const [id, build] of Object.entries({ ...DET_MODELS, ...DET_TOWN_MODELS })) registerCustomModel(Number(id), build, gate);
  const entries = [];
  const classic = (archive, record, from, size = 1) => ({
    archive, record, fileName: `det-stand-in-${archive}_${record}`, standIn: true, gate,
    build: async (ctx) => {
      const pic = await buildDerivedPicture({ from }, ctx.classicRgba);
      const own = (await ctx.classicScale?.(from[0], from[1])) ?? null;
      if (size === 1) return { ...pic, scale: own };
      const grow = (s) => Math.round(256 * (size * (1 + (s ?? 0) / 256) - 1));
      return { ...pic, scale: { width: grow(own?.width), height: grow(own?.height) } };
    },
  });
  const drawn = (archive, record, [name, scale]) => ({
    archive, record, fileName: `det-stand-in-${archive}_${record}`, standIn: true, gate,
    build: async () => ({ ...STAND_IN_SPRITES[name](), scale: { width: scale, height: scale } }),
  });
  const each = (table, make) => { for (const [a, recs] of Object.entries(table)) for (const [r, v] of Object.entries(recs)) make(Number(a), Number(r), v); };
  each(DET_FLAT_STAND_INS, (a, r, from) => entries.push(classic(a, r, from)));
  each(DET_FLAT_DRAWINGS, (a, r, spec) => entries.push(drawn(a, r, spec)));
  each(DET_TOWN_FLATS, (a, r, [fa, fr, size]) => entries.push(classic(a, r, [fa, fr], size)));
  for (const [oldArchive, archive] of Object.entries(DET_OLD_ARCHIVES)) {
    for (const e of entries.filter((x) => x.archive === archive)) entries.push({ ...e, archive: Number(oldArchive), fileName: `det-stand-in-${oldArchive}_${e.record}` });
  }
  for (const [k, record] of DET_DOLPHIN_RECORDS.entries()) {
    entries.push({ archive: 10009, record, fileName: `det-stand-in-10009_${record}`, standIn: true, gate, build: async () => ({ ...drawDolphin(k), scale: DOLPHIN_SCALE }) });
  }
  entries.push(...townPictureEntries(gate));
  // `yields` lets a matching picture from the player's own DET or another pack take precedence over these
  // stand-ins.
  return addVendorTextures(entries.map((e) => ({ ...e, yields: true })));
}
export function _resetDetStandIns() { _installed = false; _gates.clear(); }
